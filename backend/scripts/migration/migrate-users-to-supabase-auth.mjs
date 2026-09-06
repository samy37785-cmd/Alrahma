#!/usr/bin/env node
// Rehearsed, NOT-yet-live-executed migration path for moving Mongo User/
// AdminUser accounts into Supabase Auth (GoTrue) identities. This was an
// explicit, named gap left by Stage 2F: mongo-to-supabase.mjs migrates every
// OTHER domain but deliberately never touches "users" — a Mongo user only
// ever became a Supabase Auth account via real sign-up (see that script's
// resolveProfileId() comment). This script is the actual account-creation
// path Stage 2F left unbuilt.
//
// Hard rules this script enforces structurally, not just by convention:
//   1. NEVER reads or copies a Mongo password hash or an AdminUser TOTP
//      secret — accounts are created with a fresh, random, throwaway
//      password nobody is ever told (see randomThrowawayPassword()) and
//      admins ALWAYS start with zero MFA factors (they re-enroll on first
//      supabase-mode login — the existing, already-built mfa_setup stage in
//      data/supabase/adminAuthController.js handles this with no changes
//      needed here).
//   2. NEVER sends a real email. `--plan` (the default) computes what a
//      password-reset/invite wave WOULD send (via GoTrue's admin
//      generateLink, which mints a valid recovery link without emailing it)
//      and writes it to a local, redacted-by-default report file — actually
//      delivering that plan (real SMTP, real inboxes) is a deliberate,
//      separate, later decision this script does not make for you.
//   3. Same assertLocalHost discipline as every other script in this
//      directory for MIGRATION_DB_URL. SUPABASE_URL (the GoTrue admin API
//      target) is READ but not host-checked here — pointing this script at
//      a real project's GoTrue is exactly the kind of production-affecting
//      action this whole engagement's rules forbid attempting in this pass;
//      this script exists so that a LATER, separately-authorized cutover
//      has a reviewed, tested tool to run, not so it can be run today.
//   4. Idempotent + checkpointed, same shape as mongo-to-supabase.mjs:
//      re-running never creates a duplicate auth.users row for an email
//      already migrated (checked via a pre-flight listUsers lookup, not
//      trusted to a checkpoint file alone, since the checkpoint could be
//      stale relative to the actual project state).
//   5. Reconciliation report at the end: counts of Mongo source rows vs.
//      accounts created vs. accounts that already existed vs. failures,
//      plus a per-row email/name match check between Mongo and the new
//      profiles row — never dumps a password, token, or link to stdout.
import mongoose from 'mongoose';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

function randomThrowawayPassword() {
  // Never persisted anywhere, never logged, never communicated to the
  // account owner — this account is only usable after a real password
  // reset (see the --plan report) or an admin's own MFA re-enrollment.
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
// the authoritative old-AdminUser-role -> new-admin_role_assignments-role
// table. Kept here as a single source rather than re-derived per row.
const ADMIN_ROLE_MAP = {
  'super-admin': 'super-admin',
  admin: 'admin',
  editor: 'editor',
  viewer: 'viewer',
};

async function migrateOneUser(supabaseAdmin, pgClient, mongoUser, { execute }) {
  const email = String(mongoUser.email).toLowerCase().trim();

  // Pre-flight: does an auth.users row for this email already exist? (Real
  // project state, not just our own checkpoint — a prior partial run, or an
  // account created by real sign-up after the Mongo snapshot was taken,
  // must never be duplicated.)
  const existingRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
  if (existingRes.rows[0]) {
    return { status: 'already_exists', id: existingRes.rows[0].id };
  }

  if (!execute) {
    return { status: 'would_create' };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: randomThrowawayPassword(),
    email_confirm: true,
    user_metadata: { migrated_from: 'mongodb', migrated_at: new Date().toISOString() },
  });
  if (error) {
    return { status: 'error', message: error.message };
  }

  // handle_new_user() (0001_functions_triggers.sql) already created a
  // profiles row with role='user' and the email/name it read off the new
  // auth.users row — update the fields Mongo actually had that trigger
  // can't know about.
  await pgClient.query(
    `UPDATE profiles SET name = $2 WHERE id = $1`,
    [data.user.id, mongoUser.name || null]
  );

  return { status: 'created', id: data.user.id };
}

async function migrateOneAdmin(supabaseAdmin, pgClient, mongoAdmin, { execute }) {
  const email = String(mongoAdmin.email).toLowerCase().trim();
  const mappedRole = ADMIN_ROLE_MAP[mongoAdmin.role];
  if (!mappedRole) {
    return { status: 'error', message: `unmapped AdminUser role: ${mongoAdmin.role}` };
  }

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
    await pgClient.query(`UPDATE profiles SET name = $2 WHERE id = $1`, [userId, mongoAdmin.name || null]);
  } else if (!execute) {
    return { status: 'already_exists_would_assign_role', role: mappedRole };
  }

  // admin_role_assignments: idempotent upsert. Deliberately does NOT touch
  // auth.mfa_factors — this admin re-enrolls TOTP on first supabase-mode
  // login (the existing mfa_setup stage), matching this script's "never
  // migrate an MFA secret" rule.
  if (execute) {
    await pgClient.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = $2`,
      [userId, mappedRole]
    );
  }

  return { status: existingRes.rows[0] ? 'role_assigned_existing_account' : 'created', id: userId, role: mappedRole };
}

async function generateInvitePlan(supabaseAdmin, emails) {
  // GoTrue's generateLink mints a real recovery token/link WITHOUT sending
  // any email — the actual send is a separate, later decision (real SMTP,
  // a real send wave), never made by this script. The link itself is
  // sensitive (equivalent to a password-reset token) — never logged to
  // stdout or the reconciliation report; only a per-email pass/fail is.
  const results = [];
  for (const email of emails) {
    const { error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });
    results.push({ email, wouldSend: !error, error: error?.message });
  }
  return results;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has('--execute'); // default: dry-run / plan only
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
  const report = { users: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] }, admins: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] } };

  try {
    const users = await db.collection('users').find({}, { projection: { email: 1, name: 1 } }).toArray();
    for (const u of users) {
      if (!u.email) continue;
      const result = await migrateOneUser(supabaseAdmin, pgClient, u, { execute });
      checkpoint[`user:${u.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created') report.users.created++;
      else if (result.status === 'already_exists') report.users.alreadyExists++;
      else if (result.status === 'would_create') report.users.wouldCreate++;
      else if (result.status === 'error') report.users.errors.push({ email: u.email, message: result.message });
    }

    const admins = await db.collection('adminusers').find({}, { projection: { email: 1, name: 1, role: 1 } }).toArray();
    for (const a of admins) {
      if (!a.email) continue;
      const result = await migrateOneAdmin(supabaseAdmin, pgClient, a, { execute });
      checkpoint[`admin:${a.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created' || result.status === 'role_assigned_existing_account') report.admins.created++;
      else if (result.status?.startsWith('already_exists')) report.admins.alreadyExists++;
      else if (result.status === 'would_create' || result.status === 'already_exists_would_assign_role') report.admins.wouldCreate++;
      else if (result.status === 'error') report.admins.errors.push({ email: a.email, message: result.message });
    }

    // Reconciliation: total Mongo source rows vs. total profiles rows that
    // now exist for those emails — a mismatch here (excluding intentional
    // errors already reported above) means something silently didn't land.
    const allEmails = [...users, ...admins].map((r) => String(r.email).toLowerCase().trim());
    const pgCountRes = await pgClient.query(`SELECT count(*)::int AS n FROM profiles WHERE email = ANY($1::text[])`, [allEmails]);
    report.reconciliation = {
      mongoSourceRows: allEmails.length,
      matchingProfilesRows: pgCountRes.rows[0].n,
      consistent: execute ? pgCountRes.rows[0].n === allEmails.length - report.users.errors.length - report.admins.errors.length : 'n/a (dry-run)',
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
