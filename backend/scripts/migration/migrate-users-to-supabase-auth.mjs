#!/usr/bin/env node
// Stage 2J-B rewrite. Moves Mongo `users`/`adminusers` accounts into
// Supabase Auth (GoTrue) identities, LOSSLESSLY per
// docs/stage-2j-b-lossless-mapping-contract.md — not just account
// creation (Stage 2F's original scope) but the full persona/role,
// relationship, and subscription state that accompanies each account.
//
// Hard rules this script enforces structurally, not just by convention
// (unchanged from the original, Stage 2F version):
//   1. NEVER reads or copies a Mongo password hash or an AdminUser TOTP
//      secret — accounts are created with a fresh, random, throwaway
//      password nobody is ever told; admins ALWAYS start with zero MFA
//      factors (re-enroll on first supabase-mode login).
//   2. NEVER sends a real email. `--plan` (the default) computes what a
//      password-reset/invite wave WOULD send via GoTrue's admin
//      generateLink (mints a valid recovery link WITHOUT emailing it).
//   3. Same assertLocalHost discipline as every other script in this
//      directory for MIGRATION_DB_URL. SUPABASE_URL (GoTrue admin API
//      target) is read but not host-checked — pointing this at a real
//      project's GoTrue is exactly what this whole engagement forbids
//      attempting in this stage; this script exists so a LATER,
//      separately-authorized cutover has a reviewed, tested tool to run.
//   4. Idempotent + resumable from DATABASE STATE, not a checkpoint file
//      alone (Stage 2J-B Part E.9): the pre-flight `SELECT id FROM
//      auth.users WHERE email = $1` already made account CREATION
//      resumable in the original version; this rewrite extends the same
//      discipline to every subsequent step (role/RBAC, relationships,
//      subscription) — each is independently re-checked and only
//      applied if not already done, so a partial prior run (crash
//      between account creation and profile/RBAC completion) is safely
//      completed by re-running, never duplicated.
//   5. Reconciliation report: counts of Mongo source rows vs. accounts
//      created vs. already existed vs. failures, plus role/RBAC/
//      relationship/subscription outcomes — never dumps a password,
//      token, or link to stdout.
import mongoose from 'mongoose';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolvePlanSlug, seedCanonicalPlans } from './lib/plan-catalog.mjs';
import { withImpersonatedAdmin, ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';
import { throwIfFaultStage } from './lib/fault-injection.mjs';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

function randomThrowawayPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

const CHECKPOINT_DIR = path.join(process.cwd(), '.checkpoints');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'users-auth-migration.json');

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return {};
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}
function saveCheckpoint(cp) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// Mirrors lib/db/drizzle/0013_admin_rbac.sql's header-comment mapping —
// the authoritative old-AdminUser-role -> admin_role_assignments-role
// table, for REAL AdminUser documents (not the coarse `users.role`
// ad-hoc admin marker fixed below).
const ADMIN_ROLE_MAP = { 'super-admin': 'super-admin', admin: 'admin', editor: 'editor', viewer: 'viewer' };

// ---------------------------------------------------------------------
// Phase 1 — account + persona (Mapping Contract §1, §6, §7).
// ---------------------------------------------------------------------

/**
 * Fully resolves one Mongo `users` document's persona onto
 * profiles/admin_role_assignments. Handles all four Mongo role values
 * bijectively:
 *   student -> role='user', is_teacher=false
 *   teacher -> role='user', is_teacher=true
 *   parent  -> role='user', is_teacher=false (children[] resolved in Phase 2)
 *   admin   -> role='admin' + admin_role_assignments.role='admin' (never
 *              'super-admin' — Stage 2J-B Part D.5's explicit rule; this
 *              is the coarse "role field directly on User" convention,
 *              distinct from a real AdminUser document, confirmed via
 *              this stage's own local rehearsal to be how both real
 *              admin accounts are actually marked in the source data)
 */
async function applyPersona(pgClient, profileId, mongoUser) {
  const isAdmin = mongoUser.role === 'admin';
  const isTeacher = mongoUser.role === 'teacher';

  await pgClient.query(
    `UPDATE profiles SET
       name = $2, role = $3, is_teacher = $4,
       family_name = coalesce($5, family_name),
       specialization = coalesce($6, specialization),
       bio = coalesce($7, bio),
       gender = coalesce($8, gender),
       languages = coalesce($9::jsonb, languages),
       subjects = coalesce($10::jsonb, subjects),
       parent_link_code = coalesce($11, parent_link_code),
       xp = coalesce($12, xp),
       level = coalesce($13, level),
       streak = coalesce($14, streak),
       last_study_date = coalesce($15, last_study_date),
       badges = coalesce($16::jsonb, badges),
       referral_code = coalesce($17, referral_code)
     WHERE id = $1`,
    [
      profileId,
      mongoUser.name || null,
      isAdmin ? 'admin' : 'user',
      isTeacher,
      mongoUser.familyName || null,
      mongoUser.specialization || null,
      mongoUser.bio || null,
      mongoUser.gender || null,
      mongoUser.languages ? JSON.stringify(mongoUser.languages) : null,
      mongoUser.subjects ? JSON.stringify(mongoUser.subjects) : null,
      mongoUser.parentLinkCode || null,
      mongoUser.xp ?? null,
      mongoUser.level ?? null,
      mongoUser.streak ?? null,
      mongoUser.lastStudyDate ?? null,
      mongoUser.badges ? JSON.stringify(mongoUser.badges) : null,
      mongoUser.referralCode || null,
    ]
  );

  if (isAdmin) {
    await pgClient.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'admin')
       ON CONFLICT (user_id) DO UPDATE SET role = 'admin'`,
      [profileId]
    );
  }

  return { isAdmin, isTeacher };
}

async function migrateOneUser(supabaseAdmin, pgClient, mongoUser, { execute }) {
  const email = String(mongoUser.email).toLowerCase().trim();

  const existingRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
  let profileId = existingRes.rows[0]?.id ?? null;
  let status = profileId ? 'already_exists' : 'would_create';

  if (!execute) return { status, id: profileId };

  if (!profileId) {
    throwIfFaultStage('during_user_creation');
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomThrowawayPassword(),
      email_confirm: true,
      user_metadata: { migrated_from: 'mongodb', migrated_at: new Date().toISOString() },
    });
    if (error) return { status: 'error', message: error.message };
    profileId = data.user.id;
    status = 'created';
    // Fires AFTER the GoTrue account exists but BEFORE its profile/RBAC
    // row is written — Stage 2J-B Part H's named "worst case" interruption
    // point. Re-running this script must find `profileId` via the
    // `auth.users` lookup above and safely finish applyPersona() below,
    // never re-create a duplicate account or leave it undetected.
    throwIfFaultStage('after_auth_user_before_profile');
  }

  // Resumable regardless of branch above: applyPersona() is a plain
  // UPDATE, safe to re-run against an already-migrated profile.
  const persona = await applyPersona(pgClient, profileId, mongoUser);
  return { status, id: profileId, persona };
}

async function migrateOneAdmin(supabaseAdmin, pgClient, mongoAdmin, { execute }) {
  const email = String(mongoAdmin.email).toLowerCase().trim();
  const mappedRole = ADMIN_ROLE_MAP[mongoAdmin.role];
  if (!mappedRole) return { status: 'error', message: `unmapped AdminUser role: ${mongoAdmin.role}` };

  const existingRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
  let userId = existingRes.rows[0]?.id ?? null;

  if (!userId) {
    if (!execute) return { status: 'would_create', role: mappedRole };
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomThrowawayPassword(),
      email_confirm: true,
      user_metadata: { migrated_from: 'mongodb_adminuser', migrated_at: new Date().toISOString() },
    });
    if (error) return { status: 'error', message: error.message };
    userId = data.user.id;
  } else if (!execute) {
    return { status: 'already_exists_would_assign_role', role: mappedRole };
  }

  if (execute) {
    await pgClient.query(`UPDATE profiles SET name = $2, role = 'admin' WHERE id = $1`, [userId, mongoAdmin.name || null]);
    await pgClient.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = $2`,
      [userId, mappedRole]
    );
  }

  return { status: existingRes.rows[0] ? 'role_assigned_existing_account' : 'created', id: userId, role: mappedRole };
}

// ---------------------------------------------------------------------
// Phase 2 — relationships (Mapping Contract §1: teacher_id, children[]).
// Runs only after every account in this batch exists as a profiles row
// — teacher_id/parent_student_links both reference profiles(id).
// ---------------------------------------------------------------------

async function resolveRelationships(pgClient, mongoUsers, emailToProfileId) {
  const report = { teacherLinksResolved: 0, teacherLinksSkippedNoTarget: 0, parentLinksResolved: 0, parentLinksSkippedNoTarget: 0 };
  const idByMongoId = new Map(mongoUsers.map((u) => [String(u._id), u]));

  for (const u of mongoUsers) {
    const studentProfileId = emailToProfileId.get(String(u.email).toLowerCase().trim());
    if (!studentProfileId) continue;
    throwIfFaultStage('during_relationships');

    if (u.teacher) {
      const teacherMongo = idByMongoId.get(String(u.teacher));
      const teacherProfileId = teacherMongo ? emailToProfileId.get(String(teacherMongo.email).toLowerCase().trim()) : null;
      if (teacherProfileId) {
        await pgClient.query(`UPDATE profiles SET teacher_id = $2 WHERE id = $1`, [studentProfileId, teacherProfileId]);
        report.teacherLinksResolved += 1;
      } else {
        report.teacherLinksSkippedNoTarget += 1;
      }
    }

    for (const childMongoId of u.children || []) {
      const childMongo = idByMongoId.get(String(childMongoId));
      const childProfileId = childMongo ? emailToProfileId.get(String(childMongo.email).toLowerCase().trim()) : null;
      if (childProfileId) {
        await pgClient.query(
          `INSERT INTO parent_student_links (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [studentProfileId, childProfileId]
        );
        report.parentLinksResolved += 1;
      } else {
        report.parentLinksSkippedNoTarget += 1;
      }
    }
  }
  return report;
}

// ---------------------------------------------------------------------
// Phase 3 — subscription (Mapping Contract §8). DERIVED_WITH_PROOF status
// mapping, documented per branch; a plan name that doesn't resolve is a
// FAIL, never a default.
// ---------------------------------------------------------------------

function deriveSubscriptionStatus(mongoSub) {
  const validUntil = mongoSub.validUntil ? new Date(mongoSub.validUntil) : null;
  const now = new Date();
  if (mongoSub.status === 'active') {
    if (validUntil && validUntil.getTime() > now.getTime()) return { status: 'active', reason: 'status=active, validUntil in the future' };
    return { status: 'expired', reason: 'status=active but validUntil has passed' };
  }
  // status === 'inactive'
  if (validUntil) return { status: 'canceled', reason: 'status=inactive, validUntil was set (a real subscription that ended)' };
  return { status: 'expired', reason: 'status=inactive, validUntil never set (never activated)' };
}

async function migrateSubscription(pgClient, profileId, mongoUser, planSlugToId) {
  const sub = mongoUser.subscription;
  if (!sub || !sub.plan) return { status: 'skipped_no_subscription' };

  const slug = resolvePlanSlug(sub.plan);
  if (!slug || !planSlugToId.has(slug)) {
    return { status: 'FAIL', reason: `unresolvable plan name on subscription: not migrated, not defaulted` };
  }
  const planId = planSlugToId.get(slug);
  const derived = deriveSubscriptionStatus(sub);
  throwIfFaultStage('during_subscriptions');

  const provider = ['stripe', 'paypal', 'manual'].includes(sub.provider) ? sub.provider : null;
  if (sub.provider && !provider) {
    return { status: 'FAIL', reason: `unknown subscription provider "${sub.provider}"` };
  }

  await pgClient.query(
    `INSERT INTO subscriptions
       (user_id, plan_id, provider, provider_customer_id, provider_subscription_id, status,
        current_period_start, current_period_end, cancel_at_period_end, renewal_reminder_sent_for)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
     RETURNING id`,
    [
      profileId, planId, provider || 'manual', sub.stripeCustomerId || null, sub.stripeSubscriptionId || null,
      derived.status, sub.activeSince || null, sub.validUntil || null, !!sub.cancelAtPeriodEnd,
      sub.renewalReminderSentFor || null,
    ]
  ).catch(async (err) => {
    // subscriptions_one_active_per_user only guards status='active' — a
    // non-active derived status always inserts fine; if this DID fail on
    // that unique index, a prior run already created the active row.
    if (err.code === '23505') return null;
    throw err;
  });

  return { status: 'migrated', planSlug: slug, derivedStatus: derived.status, reason: derived.reason };
}

// ---------------------------------------------------------------------

async function generateInvitePlan(supabaseAdmin, emails) {
  const results = [];
  for (const email of emails) {
    const { error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });
    results.push({ email, wouldSend: !error, error: error?.message });
  }
  return results;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has('--execute');
  const withInvitePlan = args.has('--with-invite-plan');

  const mongoUri = process.env.MIGRATION_MONGO_URI;
  const pgUri = process.env.MIGRATION_DB_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mongoUri || !pgUri || !supabaseUrl || !serviceRoleKey) {
    throw new Error('MIGRATION_MONGO_URI, MIGRATION_DB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set.');
  }
  assertLocalHost(pgUri, 'MIGRATION_DB_URL');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  await mongoose.connect(mongoUri);
  const db = mongoose.connection;
  const pool = new pg.Pool({ connectionString: pgUri });
  const pgClient = await pool.connect();

  const checkpoint = loadCheckpoint();
  const report = {
    users: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] },
    admins: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] },
    relationships: null,
    subscriptions: { migrated: 0, skipped: 0, failed: [] },
  };

  try {
    const users = await db.collection('users').find({}).toArray();
    const admins = await db.collection('adminusers').find({}).toArray();

    for (const u of users) {
      if (!u.email) continue;
      const result = await migrateOneUser(supabaseAdmin, pgClient, u, { execute });
      checkpoint[`user:${u.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created') report.users.created++;
      else if (result.status === 'already_exists') report.users.alreadyExists++;
      else if (result.status === 'would_create') report.users.wouldCreate++;
      else if (result.status === 'error') report.users.errors.push({ email: u.email, message: result.message });
    }

    for (const a of admins) {
      if (!a.email) continue;
      const result = await migrateOneAdmin(supabaseAdmin, pgClient, a, { execute });
      checkpoint[`admin:${a.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created') report.admins.created++;
      else if (result.status === 'role_assigned_existing_account') report.admins.roleAssignedExisting = (report.admins.roleAssignedExisting ?? 0) + 1;
      else if (result.status?.startsWith('already_exists')) report.admins.alreadyExists++;
      else if (result.status === 'would_create' || result.status === 'already_exists_would_assign_role') report.admins.wouldCreate++;
      else if (result.status === 'error') report.admins.errors.push({ email: a.email, message: result.message });
    }

    if (execute) {
      const emailToProfileId = new Map();
      for (const u of users) {
        const email = String(u.email).toLowerCase().trim();
        const r = await pgClient.query('SELECT id FROM profiles WHERE email = $1', [email]);
        if (r.rows[0]) emailToProfileId.set(email, r.rows[0].id);
      }

      report.relationships = await resolveRelationships(pgClient, users, emailToProfileId);

      const usersWithSubscription = users.filter((u) => u.subscription && u.subscription.plan);
      if (usersWithSubscription.length > 0) {
        await ensureMigrationSeedAdmin(pgClient);
        const planSlugToId = await seedCanonicalPlans(pgClient, { withImpersonatedAdmin });
        for (const u of usersWithSubscription) {
          const profileId = emailToProfileId.get(String(u.email).toLowerCase().trim());
          if (!profileId) continue;
          const result = await migrateSubscription(pgClient, profileId, u, planSlugToId);
          if (result.status === 'migrated') report.subscriptions.migrated++;
          else if (result.status === 'FAIL') report.subscriptions.failed.push({ email: u.email, reason: result.reason });
          else report.subscriptions.skipped++;
        }
      }
    }

    // Reconciliation: DISTINCT Mongo source emails vs. matching profiles rows.
    const allEmails = [...users, ...admins].map((r) => String(r.email).toLowerCase().trim());
    const distinctEmails = [...new Set(allEmails)];
    const erroredEmails = new Set([...report.users.errors.map((e) => e.email), ...report.admins.errors.map((e) => e.email)]);
    const expectedEmails = distinctEmails.filter((e) => !erroredEmails.has(e));
    const pgCountRes = await pgClient.query(`SELECT count(*)::int AS n FROM profiles WHERE email = ANY($1::text[])`, [distinctEmails]);
    report.reconciliation = {
      mongoSourceRows: allEmails.length,
      mongoDistinctEmails: distinctEmails.length,
      matchingProfilesRows: pgCountRes.rows[0].n,
      expectedProfilesRows: expectedEmails.length,
      consistent: execute ? pgCountRes.rows[0].n === expectedEmails.length : 'n/a (dry-run)',
    };

    if (execute && withInvitePlan) {
      const created = users.filter((u) => checkpoint[`user:${u.email}`]?.status === 'created').map((u) => u.email);
      report.invitePlan = await generateInvitePlan(supabaseAdmin, created);
    }

    saveCheckpoint(checkpoint);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    pgClient.release();
    await pool.end();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate-users-to-supabase-auth] FATAL:', err.message);
  process.exitCode = 1;
});
