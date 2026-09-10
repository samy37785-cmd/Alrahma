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
import { fileURLToPath } from 'node:url';
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

// Review round 5, item 2: pure, no I/O -- given the full source `users`
// array and the set of normalized emails already known invalid (missing/
// malformed/duplicate, from computeIdentityEmailProblems() below), decides
// exactly which teacher/parent-child references WOULD resolve and which
// WOULD be skipped for lack of a target -- entirely from source-document
// shape, without touching profiles/auth.users. This is what makes
// relationship validation possible during `--plan`, before any write:
// the old resolveRelationships() (now applyRelationships(), writes only)
// could only ever answer this question post-write, via emailToProfileId,
// which is why `--plan` never computed relationships at all and a real
// skipped link was invisible until (or unless) someone read the raw
// report of a completed --execute run.
export function computeRelationshipPlan(users, invalidEmails) {
  const idByMongoId = new Map(users.map((u) => [String(u._id), u]));
  const invalid = invalidEmails instanceof Set ? invalidEmails : new Set(invalidEmails || []);

  const isResolvableTarget = (mongoId) => {
    const doc = idByMongoId.get(String(mongoId));
    if (!doc || !doc.email || typeof doc.email !== 'string') return false; // dangling reference: no such source document
    const email = doc.email.toLowerCase().trim();
    if (!email || invalid.has(email)) return false; // reference exists, but its own identity is unmigratable
    return true;
  };

  const stats = { teacherLinksResolved: 0, teacherLinksSkippedNoTarget: 0, parentLinksResolved: 0, parentLinksSkippedNoTarget: 0 };
  const skipped = [];

  for (const u of users) {
    if (!u.email || typeof u.email !== 'string') continue;
    const studentEmail = u.email.toLowerCase().trim();
    if (!studentEmail || invalid.has(studentEmail)) continue; // the student's own identity already failed separately -- not a NEW relationship problem

    if (u.teacher) {
      if (isResolvableTarget(u.teacher)) {
        stats.teacherLinksResolved += 1;
      } else {
        stats.teacherLinksSkippedNoTarget += 1;
        skipped.push({ kind: 'teacher', studentEmail, targetMongoId: String(u.teacher) });
      }
    }

    for (const childMongoId of u.children || []) {
      if (isResolvableTarget(childMongoId)) {
        stats.parentLinksResolved += 1;
      } else {
        stats.parentLinksSkippedNoTarget += 1;
        skipped.push({ kind: 'parent-child', studentEmail, targetMongoId: String(childMongoId) });
      }
    }
  }
  return { ...stats, skipped };
}

// Review round 5, item 2: the WRITE half of relationship migration, kept
// deliberately separate from computeRelationshipPlan() above (which is
// the VALIDATION half, pure, run in both --plan and --execute). This
// function only runs under --execute, after every account in this batch
// has been created/confirmed, and writes exactly the links
// computeRelationshipPlan() already predicted would resolve -- resolved
// here against the DB-authoritative emailToProfileId (built from real
// profiles rows), not re-derived, so a link is only ever written for a
// target that genuinely has a profile.
async function applyRelationships(pgClient, users, emailToProfileId) {
  const idByMongoId = new Map(users.map((u) => [String(u._id), u]));

  for (const u of users) {
    if (!u.email) continue;
    const studentProfileId = emailToProfileId.get(String(u.email).toLowerCase().trim());
    if (!studentProfileId) continue;
    throwIfFaultStage('during_relationships');

    if (u.teacher) {
      const teacherMongo = idByMongoId.get(String(u.teacher));
      const teacherProfileId = teacherMongo?.email ? emailToProfileId.get(String(teacherMongo.email).toLowerCase().trim()) : null;
      if (teacherProfileId) {
        await pgClient.query(`UPDATE profiles SET teacher_id = $2 WHERE id = $1`, [studentProfileId, teacherProfileId]);
      }
    }

    for (const childMongoId of u.children || []) {
      const childMongo = idByMongoId.get(String(childMongoId));
      const childProfileId = childMongo?.email ? emailToProfileId.get(String(childMongo.email).toLowerCase().trim()) : null;
      if (childProfileId) {
        await pgClient.query(
          `INSERT INTO parent_student_links (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [studentProfileId, childProfileId]
        );
      }
    }
  }
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

// Review round 4: pure, no I/O -- everything about a subscription record
// that can be determined invalid WITHOUT touching the database or writing
// anything at all (an unresolvable plan name, or an unknown provider) is
// a structural fact about the Mongo document itself, checkable in --plan
// mode exactly as reliably as in --execute mode. CANONICAL_PLANS
// (lib/plan-catalog.mjs) is the one hardcoded, data-independent source of
// truth resolvePlanSlug() resolves against, so a slug it returns is
// always seedable later -- a --plan run never needs planSlugToId (which
// only exists post-seed, an --execute-only side effect) to know whether
// a subscription's plan name and provider are valid.
export function validateSubscriptionPlan(sub) {
  if (!sub || !sub.plan) return { ok: true, skip: true };
  const slug = resolvePlanSlug(sub.plan);
  if (!slug) {
    return { ok: false, reason: 'unresolvable plan name on subscription: not migrated, not defaulted' };
  }
  if (sub.provider && !['stripe', 'paypal', 'manual'].includes(sub.provider)) {
    return { ok: false, reason: `unknown subscription provider "${sub.provider}"` };
  }
  return { ok: true, slug };
}

// ---------------------------------------------------------------------
// Review round 5, item 2 -- identity validation (Mapping Contract's
// implicit requirement that every migrated account be uniquely and
// validly addressable by email, since email is the resumability key this
// whole script's idempotency depends on, per this file's own header rule
// #4). Pure, no I/O, so it runs identically and BEFORE ANY WRITE in both
// --plan and --execute: previously `if (!u.email) continue;` silently
// dropped malformed source documents with no trace in the report at all,
// and two source documents sharing one email were never even
// checked -- both would reach migrateOneUser()/migrateOneAdmin()
// independently, the second always resolving to whatever the first one
// produced (silently merging two distinct source identities into one
// account).
// ---------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function computeIdentityEmailProblems(users, admins) {
  const problems = [];
  const seen = new Map(); // normalized email -> [{kind, id}]

  const record = (kind, doc, index) => {
    const id = String(doc?._id ?? `${kind}#${index}`);
    const rawEmail = doc?.email;
    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.trim()) {
      problems.push({ kind, id, email: null, reason: 'missing email' });
      return;
    }
    const normalized = rawEmail.toLowerCase().trim();
    if (!EMAIL_RE.test(normalized)) {
      problems.push({ kind, id, email: rawEmail, reason: 'invalid email format' });
      return;
    }
    if (!seen.has(normalized)) seen.set(normalized, []);
    seen.get(normalized).push({ kind, id });
  };

  users.forEach((u, i) => record('user', u, i));
  admins.forEach((a, i) => record('admin', a, i));

  for (const [email, occurrences] of seen) {
    if (occurrences.length > 1) {
      problems.push({
        kind: 'duplicate',
        id: occurrences.map((o) => `${o.kind}:${o.id}`).join('+'),
        email,
        reason: `email used by ${occurrences.length} source documents (${occurrences.map((o) => `${o.kind}:${o.id}`).join(', ')})`,
      });
    }
  }
  return problems;
}

// Review round 5, item 2 -- "unless there is an explicit, approved
// disposition". A skipped relationship or an invalid identity is allowed
// to NOT fail the run only when an operator has reviewed it and recorded
// that review in an --approved-dispositions file (a small, explicit,
// human-authored artifact -- never inferred, never a silent default).
// Each problem/skip has a stable signature; a disposition matches by
// signature only, so approving one specific known issue can never
// accidentally blanket-approve a different, unreviewed one.
export function emailProblemSignature(p) {
  return `email:${p.kind}:${p.reason}:${p.email ?? 'null'}:${p.id}`;
}
export function relationshipSkipSignature(s) {
  return `relationship:${s.kind}:${s.studentEmail}:${s.targetMongoId}`;
}

export function partitionByDisposition(items, signatureFn, approvedSignatures) {
  const approvedSet = approvedSignatures instanceof Set ? approvedSignatures : new Set(approvedSignatures || []);
  const approved = [];
  const unapproved = [];
  for (const item of items) {
    if (approvedSet.has(signatureFn(item))) approved.push(item);
    else unapproved.push(item);
  }
  return { approved, unapproved };
}

// The disposition file itself is I/O (not pure), but its validation is
// strict and fail-closed: a malformed or incomplete file is a hard error,
// never treated as "no dispositions approved" (that would silently
// weaken the gate) nor as "everything approved" (that would silently
// bypass it).
export function loadApprovedDispositions(filePath) {
  if (!filePath) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.items)) {
    throw new Error('--approved-dispositions file must be a JSON object with an "items" array');
  }
  if (!raw.approvedBy || typeof raw.approvedBy !== 'string') {
    throw new Error('--approved-dispositions file must include a non-empty "approvedBy" string');
  }
  if (!raw.approvedAt || typeof raw.approvedAt !== 'string') {
    throw new Error('--approved-dispositions file must include a non-empty "approvedAt" string');
  }
  return raw.items.map((item, i) => {
    if (!item || typeof item.signature !== 'string' || !item.signature) {
      throw new Error(`--approved-dispositions items[${i}] is missing a non-empty "signature"`);
    }
    if (!item.reason || typeof item.reason !== 'string' || !item.reason) {
      throw new Error(`--approved-dispositions items[${i}] is missing a non-empty "reason"`);
    }
    return item.signature;
  });
}

async function migrateSubscription(pgClient, profileId, mongoUser, planSlugToId) {
  const sub = mongoUser.subscription;
  if (!sub || !sub.plan) return { status: 'skipped_no_subscription' };

  const validation = validateSubscriptionPlan(sub);
  if (!validation.ok) return { status: 'FAIL', reason: validation.reason };
  const slug = validation.slug;
  if (!planSlugToId.has(slug)) {
    // Should be unreachable in practice (CANONICAL_PLANS is exactly what
    // seedCanonicalPlans() seeds, and validateSubscriptionPlan() only
    // ever resolves a slug FROM that same list) -- kept as a genuine
    // fail-closed guard rather than assumed, not a silent default.
    return { status: 'FAIL', reason: `plan slug "${slug}" resolved but was not seeded -- not migrated, not defaulted` };
  }
  const planId = planSlugToId.get(slug);
  const derived = deriveSubscriptionStatus(sub);
  throwIfFaultStage('during_subscriptions');

  await pgClient.query(
    `INSERT INTO subscriptions
       (user_id, plan_id, provider, provider_customer_id, provider_subscription_id, status,
        current_period_start, current_period_end, cancel_at_period_end, renewal_reminder_sent_for)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
     RETURNING id`,
    [
      profileId, planId, sub.provider || 'manual', sub.stripeCustomerId || null, sub.stripeSubscriptionId || null,
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
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const execute = args.has('--execute');
  const withInvitePlan = args.has('--with-invite-plan');
  const dispositionsFlag = argv.find((a) => a.startsWith('--approved-dispositions='));
  const approvedDispositionsPath = dispositionsFlag ? dispositionsFlag.slice('--approved-dispositions='.length) : null;
  // Fail fast on a malformed dispositions file before touching Mongo/PG at
  // all -- this file is trusted operator input, same fail-closed posture
  // as loadApprovedDispositions() itself.
  const approvedSignatures = loadApprovedDispositions(approvedDispositionsPath);

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
    identity: null,
    relationships: null,
    subscriptions: { migrated: 0, skipped: 0, wouldMigrate: 0, failed: [] },
  };

  try {
    const users = await db.collection('users').find({}).toArray();
    const admins = await db.collection('adminusers').find({}).toArray();

    // Review round 5, item 2: identity + relationship validation happens
    // HERE -- immediately after reading the source, before either
    // per-document loop below writes anything, and identically in --plan
    // and --execute. A source document whose email is missing/invalid, or
    // that collides with another document's email, is never handed to
    // migrateOneUser()/migrateOneAdmin() at all (guarded in the loops
    // below) -- it is reported, not silently dropped and not silently
    // processed into a merged/ambiguous account.
    const identityProblems = computeIdentityEmailProblems(users, admins);
    const identityDisposition = partitionByDisposition(identityProblems, emailProblemSignature, approvedSignatures);
    report.identity = {
      problems: identityProblems,
      approvedCount: identityDisposition.approved.length,
      unapprovedCount: identityDisposition.unapproved.length,
    };
    const invalidEmails = new Set(identityProblems.filter((p) => p.email).map((p) => p.email));

    const relationshipPlan = computeRelationshipPlan(users, invalidEmails);
    const relationshipDisposition = partitionByDisposition(relationshipPlan.skipped, relationshipSkipSignature, approvedSignatures);
    report.relationships = {
      teacherLinksResolved: relationshipPlan.teacherLinksResolved,
      teacherLinksSkippedNoTarget: relationshipPlan.teacherLinksSkippedNoTarget,
      parentLinksResolved: relationshipPlan.parentLinksResolved,
      parentLinksSkippedNoTarget: relationshipPlan.parentLinksSkippedNoTarget,
      skipped: relationshipPlan.skipped,
      approvedSkippedCount: relationshipDisposition.approved.length,
      unapprovedSkippedCount: relationshipDisposition.unapproved.length,
    };

    for (const u of users) {
      const normalizedEmail = u.email && typeof u.email === 'string' ? u.email.toLowerCase().trim() : null;
      if (!normalizedEmail || invalidEmails.has(normalizedEmail)) continue; // recorded in report.identity above, never silently processed
      const result = await migrateOneUser(supabaseAdmin, pgClient, u, { execute });
      checkpoint[`user:${u.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created') report.users.created++;
      else if (result.status === 'already_exists') report.users.alreadyExists++;
      else if (result.status === 'would_create') report.users.wouldCreate++;
      else if (result.status === 'error') report.users.errors.push({ email: u.email, message: result.message });
    }

    for (const a of admins) {
      const normalizedEmail = a.email && typeof a.email === 'string' ? a.email.toLowerCase().trim() : null;
      if (!normalizedEmail || invalidEmails.has(normalizedEmail)) continue; // recorded in report.identity above, never silently processed
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
        if (!u.email) continue;
        const email = String(u.email).toLowerCase().trim();
        const r = await pgClient.query('SELECT id FROM profiles WHERE email = $1', [email]);
        if (r.rows[0]) emailToProfileId.set(email, r.rows[0].id);
      }

      await applyRelationships(pgClient, users, emailToProfileId);

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
    } else {
      // Review round 4: a --plan run must fail on every error detectable
      // WITHOUT writing anything, not just an --execute run -- an
      // unresolvable plan name or unknown provider on a subscription is
      // exactly such an error (validateSubscriptionPlan() is pure, no DB
      // access). Previously this whole section only ran under `if
      // (execute)`, so --plan could never surface a broken subscription
      // at all; it would only be discovered for the first time during a
      // real write.
      const usersWithSubscription = users.filter((u) => u.subscription && u.subscription.plan);
      for (const u of usersWithSubscription) {
        const validation = validateSubscriptionPlan(u.subscription);
        if (!validation.ok) {
          report.subscriptions.failed.push({ email: u.email, reason: validation.reason });
        } else {
          report.subscriptions.wouldMigrate++;
        }
      }
    }

    // Reconciliation: DISTINCT Mongo source emails vs. matching profiles
    // rows. Review round 5: a document with no usable email (missing, or
    // an unapproved identity problem) was never processed above and must
    // not be counted as "expected" here either -- previously
    // `String(undefined).toLowerCase()` turned every missing-email doc
    // into a bogus "undefined" pseudo-email folded into distinctEmails,
    // which could make an otherwise-consistent run falsely report
    // reconciliation.consistent=false.
    const allEmails = [...users, ...admins]
      .filter((r) => r.email && typeof r.email === 'string')
      .map((r) => String(r.email).toLowerCase().trim());
    const distinctEmails = [...new Set(allEmails)];
    const erroredEmails = new Set([...report.users.errors.map((e) => e.email), ...report.admins.errors.map((e) => e.email)]);
    const expectedEmails = distinctEmails.filter((e) => !erroredEmails.has(e) && !invalidEmails.has(e));
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
    // Review round 4 (extended round 5): document-level failures were
    // previously only ever logged inside `report` -- this process's own
    // exit code stayed 0 as long as nothing THREW, exactly the same class
    // of bug fixed in mongo-to-supabase.mjs's own changelog (a caller
    // checking only the exit code -- production-import-orchestrator.mjs's
    // runWorker()/domainResult.code -- could see success while real
    // per-document or relationship/identity failures sat unexamined in the
    // JSON report). Fixed: every condition computeExitFailure() checks now
    // sets a non-zero exit.
    if (computeExitFailure(report, execute)) process.exitCode = 1;
  } finally {
    pgClient.release();
    await pool.end();
    await mongoose.disconnect();
  }
}

// Review round 4 (extended round 5, item 2): pure -- given the final
// report and whether this was an --execute run, true iff the process
// must exit non-zero. Exported specifically so each condition is
// unit-testable in isolation with a plain object, no live
// Mongo/Postgres/GoTrue needed:
//   - report.users.errors is non-empty
//   - report.admins.errors is non-empty
//   - report.subscriptions.failed is non-empty
//   - report.identity.unapprovedCount is non-zero (round 5: a missing,
//     invalid, or conflicting/duplicate user/admin email that has no
//     matching --approved-dispositions entry)
//   - report.relationships.unapprovedSkippedCount is non-zero (round 5: a
//     teacher/parent-child reference that would be skipped for lack of a
//     target, with no matching --approved-dispositions entry) -- checked
//     in BOTH modes now, not execute-only, because relationships are
//     computed identically in --plan and --execute (see
//     computeRelationshipPlan()) and a skip is exactly as real a problem
//     pre-write as post-write.
//   - (execute only) report.reconciliation.consistent !== true
// The reconciliation condition is execute-only because --plan's own
// reconciliation.consistent is always the string 'n/a (dry-run)' --
// literally not `true`, but that's "not yet applicable", not a failure.
export function computeExitFailure(report, execute) {
  return (
    report.users.errors.length > 0 ||
    report.admins.errors.length > 0 ||
    report.subscriptions.failed.length > 0 ||
    (report.identity?.unapprovedCount ?? 0) > 0 ||
    (report.relationships?.unapprovedSkippedCount ?? 0) > 0 ||
    (execute && report.reconciliation?.consistent !== true)
  );
}

// Guarded (unlike this file's original version) so computeExitFailure()
// and validateSubscriptionPlan() above can be imported directly by a unit
// test without also triggering a real Mongo/Postgres/GoTrue connection
// attempt via an unconditional main() call -- mongo-to-supabase.mjs's own
// header documents the SAME risk for that file, which is why every test
// in this directory drives these two scripts via child-process CLI
// invocation only; this guard makes that no longer the ONLY safe option
// for the pure exports here specifically, while leaving child-process
// invocation (used by every live/integration test) behaving identically
// (process.argv[1] equals this file's own path in that case, same as
// before).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[migrate-users-to-supabase-auth] FATAL:', err.message);
    process.exitCode = 1;
  });
}
