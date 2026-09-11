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
import { findLedgerEntry, markPlanned, markCreated, markReconciled, markFailed, contentHashOf } from './lib/source-ledger.mjs';
import { parseStrictCliArgs } from './lib/cli-args.mjs';
import { verifyReadBack } from './lib/read-back-verify.mjs';

// Review round 6, item 3: this script never went through migration_source_
// ledger before this round (it predates that table, and auth.users/
// profiles/subscriptions have their own natural idempotency key: email).
// A reviewer correctly rejected the round-5 substitute
// (raw_user_meta_data->>'migrated_from') as not durable provenance -- it's
// user metadata, not an admin-only migration record, carries no source
// database/document identity or content hash, and any matching tag
// legitimized a profile with no real relationship to the current source.
// Fixed: every account and subscription this script creates/confirms now
// ALSO gets a real migration_source_ledger row (mongo-to-supabase.mjs's
// own lib/source-ledger.mjs helpers, reused unchanged) -- the same real,
// DB-side provenance guarantee every domain table already has. This does
// NOT replace the existing email-based idempotency key (still how
// migrateOneUser()/migrateOneAdmin() decide "already exists" and resume);
// it adds durable, source-scoped, SQL-verifiable provenance ALONGSIDE it,
// which is what production-import-orchestrator.mjs's verifyNoUnrecordedData()
// now checks instead of the metadata tag.
const SOURCE_DATABASE = 'al-rahma';

async function openSourceLedger(pgClient, {
  sourceCollection, sourceDocumentId, targetTable, sourceValue, existingTargetId = null,
}) {
  const key = {
    sourceDatabase: SOURCE_DATABASE,
    sourceCollection,
    sourceDocumentId: String(sourceDocumentId),
    targetTable,
  };
  const contentHash = contentHashOf(sourceValue);
  const existing = await findLedgerEntry(pgClient, key);
  if (existing) {
    if (existing.source_content_hash !== contentHash) {
      throw new Error(
        `migration_source_ledger content hash mismatch for ${sourceCollection}/${sourceDocumentId} -> ${targetTable}; ` +
        'refusing to re-attribute changed source content'
      );
    }
    if (existing.target_id) {
      // PR #70 review round 7, item 2/4: a ledger row that already
      // recorded a target_id is NEVER trusted blindly on resume. Before
      // this fix, if the live email lookup found NOTHING (existingTargetId
      // === null -- e.g. the target row was deleted out-of-band, or a
      // compensating rollback removed it from a DIFFERENT table but left
      // this ledger row behind), the mismatch check below was skipped
      // entirely (both sides must be truthy for `&&`), openSourceLedger()
      // returned the stale ledger row as if nothing were wrong, and the
      // caller's own `if (!profileId)` branch would then happily CREATE A
      // BRAND NEW auth.users account -- while `ledger.target_id` was
      // already non-null, so the caller's own `if (!ledger.target_id)
      // markCreated(...)` guard never fired for the NEW id either. The
      // result: a genuinely orphaned, completely untracked duplicate
      // account, and the ledger still silently pointing at the missing
      // original. Fixed: a ledger row with a target_id is fail-closed the
      // moment the live lookup does not corroborate it -- this function
      // never manufactures a replacement target on the caller's behalf.
      if (!existingTargetId) {
        throw new Error(
          `migration_source_ledger for ${sourceCollection}/${sourceDocumentId} -> ${targetTable} already recorded ` +
          `target ${existing.target_id}, but no live row matches it anymore -- refusing to create a replacement ` +
          `target automatically (this is a fail-closed ledger/target mismatch, not a fresh document)`
        );
      }
      if (String(existing.target_id) !== String(existingTargetId)) {
        throw new Error(
          `migration_source_ledger target mismatch for ${sourceCollection}/${sourceDocumentId} -> ${targetTable}; ` +
          `ledger target ${existing.target_id} does not match existing target ${existingTargetId}`
        );
      }
    }
    return existing;
  }
  if (existingTargetId) {
    throw new Error(
      `existing ${targetTable} row ${existingTargetId} has no matching source-scoped migration_source_ledger entry ` +
      `for ${sourceCollection}/${sourceDocumentId}`
    );
  }
  const id = await markPlanned(pgClient, { ...key, contentHash });
  return { id, source_content_hash: contentHash, target_id: null, status: 'planned' };
}

// PR #70 review round 8, item 2 -- closes the ambiguous-GoTrue-recovery
// gap round 7 left open. Round 7's fix only handled "createUser() threw"
// and "crash between createUser() success and markCreated()"; it never
// addressed what migrateOneUser()/migrateOneAdmin() actually DO with an
// existing auth.users row found by email alone. Before this fix, ANY
// pre-existing account with a matching email -- not just one this exact
// migration run created -- was silently treated as "our pending create
// finally landed", reused as-is, and had this Mongo document's persona
// WRITTEN INTO IT. A real account that happened to share an email with a
// Mongo user (a completely unrelated signup, or one that appeared any
// time between an ambiguous createUser() timeout and a later resume) was
// therefore at real risk of being silently claimed and overwritten by a
// migration that has no actual relationship to it.
//
// Fixed with a deterministic, admin-only correlation identity: a stable
// hash of this exact source document's database + collection + document
// ID + content hash, computed BEFORE createUser() is ever called and
// written into GoTrue's own app_metadata at creation time. On any later
// resume where an account is found by email, that account is linked to
// this migration ONLY if its OWN app_metadata carries the exact matching
// correlation ID -- proving GoTrue's own admin-only record, not just a
// coincidental email string, ties it to this specific source document.
// Any mismatch (including a totally absent migration_correlation_id, the
// normal signature of an account this migration never created) fails
// closed: the document is reported as blocked, nothing about the foreign
// account is read, linked, or modified.
//
// Round 9, item 2: round 8's original implementation wrote this into
// user_metadata (raw_user_meta_data), while claiming "admin-only" in this
// very comment -- that claim was false. GoTrue's own documented
// distinction is that user_metadata is writable by the account's own
// owner at any time via a normal authenticated `supabase.auth.
// updateUser({ data: {...} })` call; only app_metadata is restricted to
// the service-role/admin API. A user_metadata-based check is therefore
// forgeable by whoever controls the (possibly foreign/attacker) account
// sharing this email -- they could simply set their own
// migration_correlation_id to whatever value makes this check pass,
// defeating the entire point of this mechanism. Moved to app_metadata
// (raw_app_meta_data), which only this migration's own service-role
// client can ever write -- proven directly by a live test that mutates
// a foreign account's raw_user_meta_data to the expected value and
// confirms it still fails closed.
export function correlationIdFor({ sourceCollection, sourceDocumentId, sourceValue }) {
  const contentHash = contentHashOf(sourceValue);
  return crypto
    .createHash('sha256')
    .update(`${SOURCE_DATABASE}:${sourceCollection}:${String(sourceDocumentId)}:${contentHash}`)
    .digest('hex');
}

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
// PR #70 review round 10, item 3: applyPersona() used to return only
// {isAdmin, isTeacher} -- neither migrateOneUser() nor migrateOneAdmin()
// ever independently re-read a single profiles column this function
// wrote before calling markReconciled(). Several of those columns are
// COALESCE'd (only overwritten when the source carries a real value;
// otherwise the column's PRE-EXISTING value survives unchanged) -- an
// exact read-back must honor that same semantics precisely, not just
// compare against `mongoUser`'s raw fields (which would be wrong for
// every coalesce-preserved column on a resume/update where the source
// value is absent). Fixed: read each coalesced column's value BEFORE the
// UPDATE, then compute exactly what COALESCE itself would produce --
// the incoming value when non-null, otherwise the prior value -- and
// return it as `expectedProfileFields` for the caller to read back
// against. The UPDATE's own `rowCount` is also checked here now: 0 rows
// affected (profileId deleted/never existed) is a fail-closed error, not
// a silent no-op.
async function applyPersona(pgClient, profileId, mongoUser) {
  const isAdmin = mongoUser.role === 'admin';
  const isTeacher = mongoUser.role === 'teacher';

  const priorRes = await pgClient.query(
    `SELECT family_name, specialization, bio, gender, languages, subjects, parent_link_code,
            xp, level, streak, last_study_date, badges, referral_code
       FROM profiles WHERE id = $1`,
    [profileId]
  );
  if (priorRes.rows.length === 0) {
    throw new Error(`applyPersona: no profiles row exists for id=${profileId} -- cannot apply persona to a target that does not exist`);
  }
  const prior = priorRes.rows[0];

  const incoming = {
    family_name: mongoUser.familyName || null,
    specialization: mongoUser.specialization || null,
    bio: mongoUser.bio || null,
    gender: mongoUser.gender || null,
    languages: mongoUser.languages ? JSON.stringify(mongoUser.languages) : null,
    subjects: mongoUser.subjects ? JSON.stringify(mongoUser.subjects) : null,
    parent_link_code: mongoUser.parentLinkCode || null,
    xp: mongoUser.xp ?? null,
    level: mongoUser.level ?? null,
    streak: mongoUser.streak ?? null,
    last_study_date: mongoUser.lastStudyDate ?? null,
    badges: mongoUser.badges ? JSON.stringify(mongoUser.badges) : null,
    referral_code: mongoUser.referralCode || null,
  };

  const updateResult = await pgClient.query(
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
      incoming.family_name,
      incoming.specialization,
      incoming.bio,
      incoming.gender,
      incoming.languages,
      incoming.subjects,
      incoming.parent_link_code,
      incoming.xp,
      incoming.level,
      incoming.streak,
      incoming.last_study_date,
      incoming.badges,
      incoming.referral_code,
    ]
  );
  if (updateResult.rowCount !== 1) {
    throw new Error(`applyPersona: UPDATE profiles affected ${updateResult.rowCount} row(s) for id=${profileId}, expected exactly 1`);
  }

  // Mirror COALESCE(incoming, existing) exactly: the incoming value wins
  // only when it is genuinely non-null; otherwise the row's PRIOR value
  // (read above, before this UPDATE) is what the column must still hold.
  const expectedProfileFields = {
    id: profileId,
    name: mongoUser.name || null,
    role: isAdmin ? 'admin' : 'user',
    is_teacher: isTeacher,
  };
  for (const [col, incomingVal] of Object.entries(incoming)) {
    expectedProfileFields[col] = incomingVal !== null ? incomingVal : (prior[col] ?? null);
  }

  let expectedAdminRoleFields = null;
  if (isAdmin) {
    const roleResult = await pgClient.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'admin')
       ON CONFLICT (user_id) DO UPDATE SET role = 'admin'`,
      [profileId]
    );
    if (roleResult.rowCount !== 1) {
      throw new Error(`applyPersona: admin_role_assignments upsert affected ${roleResult.rowCount} row(s) for user_id=${profileId}, expected exactly 1`);
    }
    expectedAdminRoleFields = { user_id: profileId, role: 'admin' };
  }

  return { isAdmin, isTeacher, expectedProfileFields, expectedAdminRoleFields };
}

// PR #70 review round 10, item 3: admin_role_assignments has no
// independent Mongo source document of its own -- it is a deterministic
// CHILD PROJECTION of the SAME users/adminusers document already
// ledgered under target_table='profiles' (its row is `{user_id: role}`,
// derived 1:1 from that same document's `role` field, never written from
// anywhere else in this script). Giving it its own separate
// migration_source_ledger entry would be a second, redundant source of
// truth for a fact the profiles ledger entry already fully determines --
// so rather than a second independent ledger target, its provenance is
// this precise, exact read-back (verifyReadBack() call sites below,
// tables 'admin_role_assignments'/user_id-keyed) run unconditionally
// before EVERY markReconciled() that could have written to it, exactly
// like every other field this migration writes. This is the "documented,
// precisely-verified child projection" alternative the review explicitly
// allows instead of an independent ledger target with its own
// bidirectional preflight.
const PROFILE_READBACK_SPEC = { table: 'profiles' };
const ADMIN_ROLE_READBACK_SPEC = { table: 'admin_role_assignments', pkColumn: 'user_id' };
const AUTH_USER_READBACK_SPEC = { table: 'auth.users' };

export async function migrateOneUser(supabaseAdmin, pgClient, mongoUser, { execute }) {
  const email = String(mongoUser.email).toLowerCase().trim();
  const correlationId = correlationIdFor({ sourceCollection: 'users', sourceDocumentId: mongoUser._id, sourceValue: mongoUser });

  const existingRes = await pgClient.query(`SELECT id, raw_app_meta_data FROM auth.users WHERE email = $1`, [email]);
  const existingRow = existingRes.rows[0] ?? null;
  let profileId = existingRow?.id ?? null;
  let status = profileId ? 'already_exists' : 'would_create';

  if (!execute) return { status, id: profileId };

  // Review round 6, item 3: a 'planned' ledger row before any write is
  // attempted -- the same Saga-first-state discipline every domain table
  // already uses (lib/source-ledger.mjs), now extended to profiles.
  let ledger;
  try {
    ledger = await openSourceLedger(pgClient, {
      sourceCollection: 'users', sourceDocumentId: mongoUser._id,
      targetTable: 'profiles', sourceValue: mongoUser, existingTargetId: profileId,
    });
  } catch (error) {
    return { status: 'error', message: error.message };
  }
  const ledgerId = ledger.id;

  // Round 8, item 2: an account found by email that this migration never
  // itself recorded (ledger.target_id still null -- e.g. an ambiguous
  // createUser() timeout being resumed) is ONLY linked to this source
  // document if its own GoTrue metadata carries the exact correlation ID
  // this run just computed. See correlationIdFor()'s own header comment.
  if (!ledger.target_id && profileId) {
    const existingCorrelationId = existingRow?.raw_app_meta_data?.migration_correlation_id ?? null;
    if (existingCorrelationId !== correlationId) {
      await markFailed(
        pgClient, ledgerId,
        `an auth.users account with email ${email} already exists but its migration_correlation_id does not match ` +
        `this source document's expected identity -- refusing to link, read, or modify a foreign/external account`
      );
      return {
        status: 'blocked_foreign_account_same_email',
        message: `auth.users account for ${email} exists but is not provably this migration's own account ` +
          `(correlation ID mismatch or absent) -- refusing to attribute or overwrite it`,
      };
    }
  }

  if (!profileId) {
    throwIfFaultStage('during_user_creation');
    // PR #70 review round 7, item 2: "handle ambiguous success/network
    // timeout". createUser() previously had no try/catch at all -- if the
    // underlying HTTP call itself threw (a network timeout or connection
    // reset, as opposed to a resolved `{data, error}` response) the
    // exception propagated out of this function, out of main()'s
    // per-document loop entirely, and crashed the WHOLE batch run: every
    // OTHER document not yet processed this run was silently never
    // attempted, and the report for them was lost. Worse, the outcome on
    // GoTrue's side is genuinely AMBIGUOUS after a timeout -- the account
    // may or may not actually have been created. Fixed: any thrown error
    // here is caught, the ledger is marked failed (never left dangling as
    // 'planned' forever), and this document is reported as a real error
    // -- but the run continues to the next document. On the NEXT run,
    // the `SELECT id FROM auth.users WHERE email = $1` lookup at the top
    // of this function is what actually resolves the ambiguity: if
    // GoTrue's write DID land despite the timeout, this exact ledger row
    // (matched by source document identity, not by re-deriving anything)
    // is safely resumed via the target_id-mismatch checks in
    // openSourceLedger() above; if it did not land, createUser() is
    // simply retried fresh.
    let createResult;
    try {
      createResult = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomThrowawayPassword(),
        email_confirm: true,
        user_metadata: { migrated_from: 'mongodb', migrated_at: new Date().toISOString() },
        // Round 8, item 2 / round 9, item 2: migration_correlation_id is
        // the ONLY thing a later resume trusts to prove an
        // account-found-by-email is genuinely this migration's own -- see
        // correlationIdFor(). It MUST live in app_metadata, not
        // user_metadata: user_metadata is writable by the account's own
        // owner via a normal authenticated `supabase.auth.updateUser()`
        // call (GoTrue's own documented distinction), so anything stored
        // there is not actually admin-only and could be forged by
        // whoever controls that account. app_metadata is writable only
        // through the service-role/admin API this migration itself uses
        // -- never by the account holder -- which is what makes it a
        // genuine, unforgeable proof of GoTrue-side provenance.
        app_metadata: { migration_correlation_id: correlationId },
      });
    } catch (thrown) {
      await markFailed(pgClient, ledgerId, `createUser() threw (ambiguous outcome, possible network timeout): ${thrown.message}`);
      return { status: 'error', message: `createUser() threw (ambiguous outcome, possible network timeout): ${thrown.message}` };
    }
    const { data, error } = createResult;
    if (error) {
      await markFailed(pgClient, ledgerId, error.message);
      return { status: 'error', message: error.message };
    }
    profileId = data.user.id;
    status = 'created';
    // Round 7, item 2: a real, previously-unclosed kill window -- GoTrue's
    // createUser() call actually succeeded (a real account now exists),
    // but the process crashes before markCreated() ever commits that fact
    // to the ledger. On resume, the ledger row is still 'planned' with no
    // target_id at all -- migrateOneUser() must find the real account via
    // the email lookup at the top of this function and link it to this
    // SAME already-'planned' ledger row (never attempt a second
    // createUser(), never leave the ledger permanently unaware of a
    // target that genuinely exists). Proven by the dedicated kill-window
    // test for this exact stage.
    throwIfFaultStage('after_gotrue_create_before_marked_created');
    // The auth trigger creates profiles synchronously with auth.users.
    // Persist that target identity before the explicit kill-window fault:
    // a compensate/resume preflight can now prove the partial row belongs
    // to this exact source document instead of rejecting it as unknown.
    await markCreated(pgClient, ledgerId, profileId);
    // Fires AFTER the GoTrue account exists but BEFORE its profile/RBAC
    // row is written — Stage 2J-B Part H's named "worst case" interruption
    // point. Re-running this script must find `profileId` via the
    // `auth.users` lookup above and safely finish applyPersona() below,
    // never re-create a duplicate account or leave it undetected.
    throwIfFaultStage('after_auth_user_before_profile');
  }

  // Resumable regardless of branch above: applyPersona() is a plain
  // UPDATE, safe to re-run against an already-migrated profile.
  if (!ledger.target_id) await markCreated(pgClient, ledgerId, profileId);
  // applyPersona() throws on a genuine integrity violation (the UPDATE
  // affected 0/2+ rows, or the profiles row does not exist at all) --
  // caught here, never left to propagate out of this function and crash
  // the WHOLE batch over one document, consistent with every other
  // failure mode in this file (createUser()'s own try/catch above,
  // computeExitFailure()'s per-document error reporting elsewhere).
  let persona;
  try {
    persona = await applyPersona(pgClient, profileId, mongoUser);
  } catch (err) {
    await markFailed(pgClient, ledgerId, err.message).catch(() => {});
    return { status: 'error', message: err.message };
  }
  await markCreated(pgClient, ledgerId, profileId);

  // PR #70 review round 10, item 3: exact, independent read-back across
  // every table this function (directly or via applyPersona()) wrote to
  // or depends on, BEFORE markReconciled() -- never assumed correct just
  // because no exception was thrown. A resumed run (profileId found by
  // email, no fresh createUser() this invocation) is checked exactly the
  // same way: raw_app_meta_data.migration_correlation_id is verified
  // unconditionally here, not only in the branch-specific foreign-account
  // gate above (which only runs when ledger.target_id was still null).
  const authReadBack = await verifyReadBack(pgClient, AUTH_USER_READBACK_SPEC, profileId, {
    id: profileId,
    email,
    raw_app_meta_data: { migration_correlation_id: correlationId },
  });
  if (!authReadBack.ok) {
    await markFailed(pgClient, ledgerId, authReadBack.reason).catch(() => {});
    return { status: 'error', message: authReadBack.reason };
  }
  const profileReadBack = await verifyReadBack(pgClient, PROFILE_READBACK_SPEC, profileId, persona.expectedProfileFields);
  if (!profileReadBack.ok) {
    await markFailed(pgClient, ledgerId, profileReadBack.reason).catch(() => {});
    return { status: 'error', message: profileReadBack.reason };
  }
  if (persona.isAdmin) {
    const roleReadBack = await verifyReadBack(pgClient, ADMIN_ROLE_READBACK_SPEC, profileId, persona.expectedAdminRoleFields);
    if (!roleReadBack.ok) {
      await markFailed(pgClient, ledgerId, roleReadBack.reason).catch(() => {});
      return { status: 'error', message: roleReadBack.reason };
    }
  }

  await markReconciled(pgClient, ledgerId);
  return { status, id: profileId, persona };
}

export async function migrateOneAdmin(supabaseAdmin, pgClient, mongoAdmin, { execute }) {
  const email = String(mongoAdmin.email).toLowerCase().trim();
  const mappedRole = ADMIN_ROLE_MAP[mongoAdmin.role];
  if (!mappedRole) return { status: 'error', message: `unmapped AdminUser role: ${mongoAdmin.role}` };
  const correlationId = correlationIdFor({ sourceCollection: 'adminusers', sourceDocumentId: mongoAdmin._id, sourceValue: mongoAdmin });

  const existingRes = await pgClient.query(`SELECT id, raw_app_meta_data FROM auth.users WHERE email = $1`, [email]);
  const existingRow = existingRes.rows[0] ?? null;
  let userId = existingRow?.id ?? null;

  if (!execute) {
    return userId ? { status: 'already_exists_would_assign_role', role: mappedRole } : { status: 'would_create', role: mappedRole };
  }

  let ledger;
  try {
    ledger = await openSourceLedger(pgClient, {
      sourceCollection: 'adminusers', sourceDocumentId: mongoAdmin._id,
      targetTable: 'profiles', sourceValue: mongoAdmin, existingTargetId: userId,
    });
  } catch (error) {
    return { status: 'error', message: error.message };
  }
  const ledgerId = ledger.id;

  // Round 8, item 2: same foreign-account-same-email fail-closed check as
  // migrateOneUser() -- see that function's own comment and
  // correlationIdFor()'s header for the full rationale.
  if (!ledger.target_id && userId) {
    const existingCorrelationId = existingRow?.raw_app_meta_data?.migration_correlation_id ?? null;
    if (existingCorrelationId !== correlationId) {
      await markFailed(
        pgClient, ledgerId,
        `an auth.users account with email ${email} already exists but its migration_correlation_id does not match ` +
        `this source document's expected identity -- refusing to link, read, or modify a foreign/external account`
      );
      return {
        status: 'blocked_foreign_account_same_email',
        message: `auth.users account for ${email} exists but is not provably this migration's own account ` +
          `(correlation ID mismatch or absent) -- refusing to attribute or overwrite it`,
      };
    }
  }

  if (!userId) {
    // PR #70 review round 7, item 2: same createUser() try/catch and
    // kill-window fault stage as migrateOneUser() -- see that function's
    // own comment for the full "ambiguous success/network timeout"
    // rationale, and unrecorded-data-preflight/migrate-users tests for the
    // adminusers-specific proof.
    let createResult;
    try {
      createResult = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomThrowawayPassword(),
        email_confirm: true,
        user_metadata: { migrated_from: 'mongodb_adminuser', migrated_at: new Date().toISOString() },
        // Round 9, item 2: see migrateOneUser()'s own comment -- app_metadata,
        // never user_metadata, for the same admin-only-provenance reason.
        app_metadata: { migration_correlation_id: correlationId },
      });
    } catch (thrown) {
      await markFailed(pgClient, ledgerId, `createUser() threw (ambiguous outcome, possible network timeout): ${thrown.message}`);
      return { status: 'error', message: `createUser() threw (ambiguous outcome, possible network timeout): ${thrown.message}` };
    }
    const { data, error } = createResult;
    if (error) {
      await markFailed(pgClient, ledgerId, error.message);
      return { status: 'error', message: error.message };
    }
    userId = data.user.id;
    throwIfFaultStage('after_gotrue_create_before_marked_created');
    await markCreated(pgClient, ledgerId, userId);
  }

  if (!ledger.target_id) await markCreated(pgClient, ledgerId, userId);
  const profileUpdate = await pgClient.query(`UPDATE profiles SET name = $2, role = 'admin' WHERE id = $1`, [userId, mongoAdmin.name || null]);
  if (profileUpdate.rowCount !== 1) {
    const reason = `UPDATE profiles affected ${profileUpdate.rowCount} row(s) for id=${userId}, expected exactly 1`;
    await markFailed(pgClient, ledgerId, reason).catch(() => {});
    return { status: 'error', message: reason };
  }
  const roleUpsert = await pgClient.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET role = $2`,
    [userId, mappedRole]
  );
  if (roleUpsert.rowCount !== 1) {
    const reason = `admin_role_assignments upsert affected ${roleUpsert.rowCount} row(s) for user_id=${userId}, expected exactly 1`;
    await markFailed(pgClient, ledgerId, reason).catch(() => {});
    return { status: 'error', message: reason };
  }
  await markCreated(pgClient, ledgerId, userId);

  // PR #70 review round 10, item 3: same exact, independent read-back
  // discipline as migrateOneUser() -- see that function's own comment.
  const authReadBack = await verifyReadBack(pgClient, AUTH_USER_READBACK_SPEC, userId, {
    id: userId,
    email,
    raw_app_meta_data: { migration_correlation_id: correlationId },
  });
  if (!authReadBack.ok) {
    await markFailed(pgClient, ledgerId, authReadBack.reason).catch(() => {});
    return { status: 'error', message: authReadBack.reason };
  }
  const profileReadBack = await verifyReadBack(pgClient, PROFILE_READBACK_SPEC, userId, {
    id: userId, name: mongoAdmin.name || null, role: 'admin',
  });
  if (!profileReadBack.ok) {
    await markFailed(pgClient, ledgerId, profileReadBack.reason).catch(() => {});
    return { status: 'error', message: profileReadBack.reason };
  }
  const roleReadBack = await verifyReadBack(pgClient, ADMIN_ROLE_READBACK_SPEC, userId, { user_id: userId, role: mappedRole });
  if (!roleReadBack.ok) {
    await markFailed(pgClient, ledgerId, roleReadBack.reason).catch(() => {});
    return { status: 'error', message: roleReadBack.reason };
  }

  await markReconciled(pgClient, ledgerId);

  return { status: existingRow ? 'role_assigned_existing_account' : 'created', id: userId, role: mappedRole };
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
export function computeRelationshipPlan(users, invalidDocIds) {
  const idByMongoId = new Map(users.map((u) => [String(u._id), u]));
  // Review round 6, item 1: matched by stable source identity
  // (`user:${mongoId}`, from computeInvalidDocIds()) now, never by
  // re-deriving/re-normalizing an email string -- see that function's own
  // comment for the exact bug this closes.
  const invalid = invalidDocIds instanceof Set ? invalidDocIds : new Set(invalidDocIds || []);
  const isInvalidUserDoc = (mongoId) => invalid.has(`user:${String(mongoId)}`);

  const isResolvableTarget = (mongoId) => {
    const doc = idByMongoId.get(String(mongoId));
    if (!doc) return false; // dangling reference: no such source document
    if (isInvalidUserDoc(mongoId)) return false; // reference exists, but its own identity is unmigratable
    if (!doc.email || typeof doc.email !== 'string' || !doc.email.trim()) return false; // defensive, should already be covered above
    return true;
  };

  const stats = { teacherLinksResolved: 0, teacherLinksSkippedNoTarget: 0, parentLinksResolved: 0, parentLinksSkippedNoTarget: 0 };
  const skipped = [];

  for (const u of users) {
    if (!u.email || typeof u.email !== 'string') continue;
    if (isInvalidUserDoc(u._id)) continue; // the student's own identity already failed separately -- not a NEW relationship problem
    const studentEmail = u.email.toLowerCase().trim();

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

// Review round 5, item 2 (rewritten round 7, item 6): the WRITE half of
// relationship migration, kept deliberately separate from
// computeRelationshipPlan() above (which is the VALIDATION half, pure, run
// in both --plan and --execute). This function only runs under --execute,
// after every account in this batch has been created/confirmed, and
// writes exactly the links computeRelationshipPlan() already predicted
// would resolve -- resolved here against the DB-authoritative
// emailToProfileId (built from real profiles rows), not re-derived, so a
// link is only ever written for a target that genuinely has a profile.
//
// PR #70 review round 7, item 6: before this round, neither relationship
// had ANY provenance at all -- `UPDATE profiles SET teacher_id = ...` and
// `INSERT INTO parent_student_links ... ON CONFLICT DO NOTHING` were plain
// writes with no migration_source_ledger row, no ownership check, and no
// crash-recovery story of their own (a fault mid-loop just crashed the
// whole batch, per the `during_relationships` stage below, which fires
// once per source document, unchanged). Consequently: (1) this migration
// could silently OVERWRITE a teacher_id a human or a different process had
// already set, with no way to tell "migration-owned" from "someone else's"
// data apart; (2) neither relationship was covered by
// verifyNoUnrecordedData()/verifyLedgerPointsToRealTargets() at all,
// because there was nothing in the ledger to check against; (3) a crash
// between the write and any bookkeeping had literally nothing to resume
// from except re-deriving the SAME UPDATE/INSERT, which happens to be
// idempotent for these two specific writes but was true by accident, not
// by a provable contract. Fixed: each relationship fact now gets a real,
// source-scoped migration_source_ledger row (using a stable composite
// target_id, exactly like this file's other composite-keyed targets),
// written via the same markPlanned/markCreated/markReconciled discipline
// every other target already uses, with the write + markCreated wrapped in
// one real transaction and a post-commit read-back verification before
// markReconciled -- the same pattern items 3/7 apply to
// subscriptions/seed-admin. A relationship whose CURRENT value is not
// attributable to this exact migration fact is never silently overwritten.
async function applyRelationships(pgClient, users, emailToProfileId) {
  const idByMongoId = new Map(users.map((u) => [String(u._id), u]));
  const errors = [];

  for (const u of users) {
    if (!u.email) continue;
    const studentMongoId = String(u._id);
    const studentProfileId = emailToProfileId.get(String(u.email).toLowerCase().trim());
    if (!studentProfileId) continue;
    throwIfFaultStage('during_relationships');

    if (u.teacher) {
      const teacherMongo = idByMongoId.get(String(u.teacher));
      const teacherProfileId = teacherMongo?.email ? emailToProfileId.get(String(teacherMongo.email).toLowerCase().trim()) : null;
      if (teacherProfileId) {
        try {
          await applyTeacherLink(pgClient, { studentMongoId, studentProfileId, teacherProfileId });
        } catch (err) {
          errors.push({ kind: 'teacher', studentEmail: u.email, message: err.message });
        }
      }
    }

    for (const childMongoId of u.children || []) {
      const childMongo = idByMongoId.get(String(childMongoId));
      const childProfileId = childMongo?.email ? emailToProfileId.get(String(childMongo.email).toLowerCase().trim()) : null;
      if (childProfileId) {
        try {
          await applyParentChildLink(pgClient, {
            parentMongoId: studentMongoId, childMongoId: String(childMongoId),
            parentProfileId: studentProfileId, childProfileId,
          });
        } catch (err) {
          errors.push({ kind: 'parent-child', studentEmail: u.email, message: err.message });
        }
      }
    }
  }
  return { errors };
}

/**
 * teacher_id is a COLUMN on an existing profiles row, not a separate
 * insertable row -- its stable composite identity is `<studentProfileId>:
 * <teacherProfileId>`, ledgered under a dedicated target_table (never
 * colliding with that same student's own account-creation ledger row,
 * whose target_table is plain 'profiles') so migration_source_ledger's
 * real unique index (source_system, source_database, source_collection,
 * source_document_id, target_table) allows both to coexist for the same
 * Mongo source document.
 */
async function applyTeacherLink(pgClient, { studentMongoId, studentProfileId, teacherProfileId }) {
  const targetId = `${studentProfileId}:${teacherProfileId}`;
  const ledgerKey = {
    sourceDatabase: SOURCE_DATABASE, sourceCollection: 'users',
    sourceDocumentId: studentMongoId, targetTable: 'profiles_teacher_link',
  };
  const contentHash = contentHashOf({ studentProfileId, teacherProfileId });
  const prior = await findLedgerEntry(pgClient, ledgerKey);
  if (prior && prior.source_content_hash !== contentHash) {
    throw new Error('teacher_id link source content hash differs from its existing migration_source_ledger entry');
  }
  if (prior?.target_id === targetId && prior.status === 'reconciled') return; // already done -- resume-safe no-op
  // A prior ledger row for THIS EXACT source document already recorded
  // this exact target -- a legitimate resume (e.g. a crash after COMMIT
  // but before markReconciled), never "external data that merely agrees".
  const resumeTargetId = prior?.target_id === targetId ? targetId : null;

  // Never overwrite a relationship this migration does not already own.
  // profiles.teacher_id currently holding NULL, or exactly this
  // teacherProfileId already (a resume), are both fine; anything else is
  // data this migration has no relationship to.
  const current = await pgClient.query('SELECT teacher_id FROM profiles WHERE id = $1', [studentProfileId]);
  const currentTeacherId = current.rows[0]?.teacher_id ?? null;
  if (currentTeacherId && String(currentTeacherId) !== String(teacherProfileId)) {
    throw new Error(
      `profiles.teacher_id for ${studentProfileId} is already set to ${currentTeacherId}, which this migration has ` +
      `no matching migration_source_ledger entry for -- refusing to overwrite a relationship it does not own`
    );
  }
  // PR #70 review round 8, item 7: an EXACT VALUE MATCH is not proof of
  // ownership either. Round 7 only rejected a MISMATCHED pre-existing
  // teacher_id; a pre-existing value that happens to already equal
  // teacherProfileId (set by something entirely outside this migration,
  // with no ledger row for this exact source document) fell straight
  // through to a harmless-looking no-op UPDATE, then got marked
  // 'reconciled' -- silently attributing a relationship this migration
  // never actually wrote to itself, the exact same "attribute external
  // data to the migration" failure mode item 7 closes for
  // parent_student_links' ON CONFLICT DO NOTHING below, just reached via
  // a value-equality coincidence here instead. Only a genuine resume
  // (this exact source document's OWN prior ledger row already recorded
  // this target) is exempt.
  if (currentTeacherId && String(currentTeacherId) === String(teacherProfileId) && !resumeTargetId) {
    throw new Error(
      `profiles.teacher_id for ${studentProfileId} already equals ${teacherProfileId}, but this migration has no ` +
      `matching migration_source_ledger entry for this exact source document -- refusing to silently claim a ` +
      `relationship it did not itself create`
    );
  }

  const ledgerId = prior?.id ?? await markPlanned(pgClient, { ...ledgerKey, contentHash });
  try {
    await pgClient.query('BEGIN');
    await pgClient.query('UPDATE profiles SET teacher_id = $2 WHERE id = $1', [studentProfileId, teacherProfileId]);
    throwIfFaultStage('after_relationship_write_before_marked_created');
    await markCreated(pgClient, ledgerId, targetId);
    await pgClient.query('COMMIT');
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    await markFailed(pgClient, ledgerId, err.message).catch(() => {});
    throw err;
  }

  // PR #70 review round 10, item 5: this WHERE clause names BOTH real
  // columns this write touches (studentProfileId identifies the row,
  // teacherProfileId IS the entire content being verified) -- unlike a
  // domain table with separate identity and content columns, there is no
  // additional field a trigger could silently corrupt here that this
  // check would miss. This bespoke SELECT is therefore already a
  // complete, exact read-back for this specific table's shape, not a
  // weaker "existence only" stand-in for the shared verifyReadBack() --
  // kept bespoke rather than switched to verifyReadBack() because there
  // is no separate "identity" vs. "content" split here for that shared
  // function's generic column-list comparison to add anything over.
  const verify = await pgClient.query('SELECT 1 FROM profiles WHERE id = $1 AND teacher_id = $2', [studentProfileId, teacherProfileId]);
  if (verify.rows.length === 0) {
    await markFailed(pgClient, ledgerId, 'post-commit read-back verification failed for teacher_id link');
    throw new Error('post-commit read-back verification failed for teacher_id link');
  }
  await markReconciled(pgClient, ledgerId);
}

/**
 * parent_student_links is a REAL table with a real (parent_id, student_id)
 * composite primary key -- its stable composite identity is exactly that
 * pair, same convention as this repo's other composite-keyed domain
 * targets (wishlists, hifz_progress, etc., see production-import-
 * orchestrator.mjs's LEDGER_BACKED_TARGET_SPECS). One PARENT Mongo
 * document can produce several links (one per child), so the ledger's
 * source_document_id is `<parentMongoId>:child:<childMongoId>` -- a
 * stable, deterministic, per-link identity still traceable back to the
 * real source document, not a fresh UUID or index-based key.
 */
async function applyParentChildLink(pgClient, { parentMongoId, childMongoId, parentProfileId, childProfileId }) {
  const targetId = `${parentProfileId}:${childProfileId}`;
  const ledgerKey = {
    sourceDatabase: SOURCE_DATABASE, sourceCollection: 'users',
    sourceDocumentId: `${parentMongoId}:child:${childMongoId}`, targetTable: 'parent_student_links',
  };
  const contentHash = contentHashOf({ parentProfileId, childProfileId });
  const prior = await findLedgerEntry(pgClient, ledgerKey);
  if (prior && prior.source_content_hash !== contentHash) {
    throw new Error('parent_student_links source content hash differs from its existing migration_source_ledger entry');
  }
  if (prior?.target_id === targetId && prior.status === 'reconciled') return; // already done -- resume-safe no-op
  // A prior ledger row for THIS EXACT source document already recorded
  // this exact target -- a legitimate resume, not "external data".
  const resumeTargetId = prior?.target_id === targetId ? targetId : null;

  // parent_student_links has no single-owner column to overwrite (a
  // student can already be linked to a DIFFERENT parent by a completely
  // unrelated, legitimate row), so ON CONFLICT DO NOTHING on the real
  // (parent_id, student_id) primary key is genuinely the right idempotent
  // write -- it can only ever collide with this EXACT pair, and it never
  // DELETEs anything.
  //
  // PR #70 review round 8, item 7: what round 7 got WRONG was trusting
  // that no-op as PROOF this migration's own write succeeded. ON
  // CONFLICT DO NOTHING no-ops identically whether (a) THIS run's own
  // prior attempt already inserted the row (a legitimate resume) or (b)
  // the exact same pair was already linked by something ELSE entirely --
  // an admin action, a different tool, anything with zero relationship
  // to this Mongo document. Round 7 could not tell the two apart: either
  // way it proceeded straight to markCreated()/markReconciled(),
  // silently attributing an external row to this migration the moment
  // case (b) occurred. Fixed with RETURNING id: a real, non-empty result
  // means THIS statement actually inserted the row (case (a), or a
  // genuine first write); an empty result together with no resume-
  // justifying prior ledger entry is case (b) -- unattributable external
  // data -- and is now rejected exactly like applyTeacherLink()'s own
  // value-equality guard above, never silently claimed as reconciled.
  const ledgerId = prior?.id ?? await markPlanned(pgClient, { ...ledgerKey, contentHash });
  try {
    await pgClient.query('BEGIN');
    const insertResult = await pgClient.query(
      `INSERT INTO parent_student_links (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING parent_id`,
      [parentProfileId, childProfileId]
    );
    if (insertResult.rows.length === 0 && !resumeTargetId) {
      throw new Error(
        `a parent_student_links row for (parent=${parentProfileId}, student=${childProfileId}) already exists and this ` +
        `migration has no matching migration_source_ledger entry for this exact source document -- refusing to ` +
        `silently claim a relationship it did not itself create`
      );
    }
    throwIfFaultStage('after_relationship_write_before_marked_created');
    await markCreated(pgClient, ledgerId, targetId);
    await pgClient.query('COMMIT');
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    await markFailed(pgClient, ledgerId, err.message).catch(() => {});
    throw err;
  }

  // PR #70 review round 10, item 5: same reasoning as applyTeacherLink()'s
  // own comment -- (parent_id, student_id) is the table's ENTIRE real
  // content, not just its identity, so this WHERE clause is already a
  // complete, exact read-back for this table's shape.
  const verify = await pgClient.query(
    'SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2', [parentProfileId, childProfileId]
  );
  if (verify.rows.length === 0) {
    await markFailed(pgClient, ledgerId, 'post-commit read-back verification failed for parent_student_links');
    throw new Error('post-commit read-back verification failed for parent_student_links');
  }
  await markReconciled(pgClient, ledgerId);
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
      // Review round 6, item 1: this used to store the RAW email
      // (`rawEmail`, e.g. " BAD-EMAIL ") here, while every consumer
      // (invalidEmails, the per-document loop guards) matched against the
      // NORMALIZED (lowercased/trimmed) value -- a case/whitespace
      // mismatch meant the raw string was never found in the normalized
      // set, so a reported-invalid document could still be silently
      // handed to migrateOneUser()/migrateOneAdmin() and a relationship
      // referencing it could be counted as resolvable. Fixed: `email`
      // here is now always the SAME normalized value every consumer
      // matches against; `rawEmail` is kept separately, purely for
      // human-readable display in the report.
      problems.push({ kind, id, email: normalized, rawEmail, reason: 'invalid email format' });
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
        occurrences, // structured [{kind,id}] -- see computeInvalidDocIds()
        reason: `email used by ${occurrences.length} source documents (${occurrences.map((o) => `${o.kind}:${o.id}`).join(', ')})`,
      });
    }
  }
  return problems;
}

// Review round 6, item 1: the root fix. Rather than re-deriving a
// normalized email string at every call site (and risking exactly the
// raw-vs-normalized mismatch above), every consumer that needs to know
// "is THIS source document unmigratable" now matches by STABLE SOURCE
// IDENTITY (`${kind}:${mongoId}`) against this one set, computed once
// from computeIdentityEmailProblems()'s own output -- never re-parses or
// re-normalizes an email at all. A 'duplicate' problem contributes EVERY
// one of its `occurrences` (both/all colliding documents are excluded
// from processing, not just the one whose email a re-derivation happened
// to match).
export function computeInvalidDocIds(identityProblems) {
  const ids = new Set();
  for (const p of identityProblems) {
    if (p.kind === 'user' || p.kind === 'admin') {
      ids.add(`${p.kind}:${p.id}`);
    } else if (p.kind === 'duplicate' && Array.isArray(p.occurrences)) {
      for (const o of p.occurrences) ids.add(`${o.kind}:${o.id}`);
    }
  }
  return ids;
}

// Review round 6, item 1: "complete every deterministic validation before
// writes: identities, relationships, admin-role mapping, and subscription
// validation". These two are pure, no I/O -- the exact same checks
// migrateOneAdmin()/migrateSubscription() already perform inline, deep
// inside their own per-document write path, extracted so main() can run
// them over the WHOLE batch up front, before any write anywhere, instead
// of discovering document N's bad role/plan only after documents 1..N-1
// already wrote real accounts/subscriptions.
export function computeAdminRoleMappingProblems(admins) {
  const problems = [];
  admins.forEach((a, i) => {
    const id = String(a?._id ?? `admin#${i}`);
    if (!ADMIN_ROLE_MAP[a?.role]) {
      problems.push({ id, email: a?.email ?? null, role: a?.role ?? null, reason: `unmapped AdminUser role: ${a?.role}` });
    }
  });
  return problems;
}

export function computeSubscriptionProblems(users) {
  const problems = [];
  for (const u of users) {
    if (!u.subscription || !u.subscription.plan) continue;
    const validation = validateSubscriptionPlan(u.subscription);
    if (!validation.ok) problems.push({ email: u.email, reason: validation.reason });
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

// Review round 6, item 2: "reject ... unused/unknown signatures". An
// approved-dispositions file that names a signature matching NO real
// problem/skip in this run is itself a red flag (stale entry, typo, or
// the underlying data changed since it was reviewed/approved) -- silently
// ignoring it would let the file drift from what it actually approves
// without anyone noticing. Pure: given the operator's full approved list
// and every signature that a partitionByDisposition() call in this run
// actually matched, returns whichever approved signatures matched
// nothing at all.
export function findUnusedApprovedSignatures(approvedSignatures, matchedSignatures) {
  const matched = new Set(matchedSignatures);
  return approvedSignatures.filter((sig) => !matched.has(sig));
}

// The disposition file itself is I/O (not pure), but its validation is
// strict and fail-closed: a malformed or incomplete file is a hard error,
// never treated as "no dispositions approved" (that would silently
// weaken the gate) nor as "everything approved" (that would silently
// bypass it).
export function parseApprovedDispositions(contents) {
  const raw = JSON.parse(contents);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.items)) {
    throw new Error('--approved-dispositions file must be a JSON object with an "items" array');
  }
  if (typeof raw.approvedBy !== 'string' || !raw.approvedBy.trim()) {
    throw new Error('--approved-dispositions file must include a non-empty "approvedBy" string');
  }
  // Review round 6, item 2: "reject ... malformed timestamps" -- a
  // non-empty string was previously accepted even if it could never parse
  // as a real date (e.g. "yesterday", "tbd").
  const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  if (typeof raw.approvedAt !== 'string' || !isoInstant.test(raw.approvedAt) || Number.isNaN(Date.parse(raw.approvedAt))) {
    throw new Error('--approved-dispositions file must include a valid ISO "approvedAt" timestamp string');
  }
  const seenSignatures = new Set();
  const signatures = raw.items.map((item, i) => {
    if (!item || typeof item.signature !== 'string' || !item.signature.trim()) {
      throw new Error(`--approved-dispositions items[${i}] is missing a non-empty "signature"`);
    }
    if (typeof item.reason !== 'string' || !item.reason.trim()) {
      throw new Error(`--approved-dispositions items[${i}] is missing a non-empty "reason"`);
    }
    // Review round 6, item 2: "reject duplicate ... signatures" -- two
    // entries for the same signature is always either a copy/paste
    // mistake or an attempt to smuggle a second, unreviewed reason behind
    // an already-approved one; either way it must not silently pass.
    if (seenSignatures.has(item.signature)) {
      throw new Error(`--approved-dispositions items[${i}] has a duplicate signature "${item.signature}" -- each approved item must be unique`);
    }
    seenSignatures.add(item.signature);
    return item.signature;
  });
  return { approvedBy: raw.approvedBy.trim(), approvedAt: raw.approvedAt, signatures };
}

export function loadApprovedDispositions(filePath) {
  if (!filePath) return [];
  return parseApprovedDispositions(fs.readFileSync(filePath, 'utf8')).signatures;
}

// PR #70 review round 8, item 3 -- closes the approved-dispositions TOCTOU
// round 7's snapshot mechanism narrowed but did not actually eliminate.
// Round 7 had the orchestrator write a private, orchestrator-owned
// snapshot file and re-verify its hash immediately before spawning this
// script with `--approved-dispositions=<snapshotPath>` -- but the
// snapshot was still a real path on disk, and this script's own
// `loadApprovedDispositions()` still opened and read THAT PATH itself, a
// separate operation happening some (however small) amount of time after
// the orchestrator's own last check. Structurally, any path-based handoff
// between two separate processes has this shape: check, then later,
// separately, read -- exactly the definition of a TOCTOU window.
//
// This closes it for real: the orchestrator no longer hands this script a
// path to open at all for the stdin mode. It reads the operator's
// approved-dispositions file into memory exactly once, computes its own
// sha256 of those bytes, and pipes the SAME bytes directly into this
// process's stdin while passing only the hash (never a path) via
// `--approved-dispositions-hash`. This function reads stdin fully into
// memory exactly once, hashes what it actually received, and REFUSES to
// even parse the content unless that hash matches what the caller
// committed to on the command line -- the verification and the content
// consumed are now provably the same bytes, because there is no
// intermediate path for anything to race against between them.
export async function loadApprovedDispositionsFromStdin(expectedHash) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(
      `--approved-dispositions-hash mismatch: caller committed to ${expectedHash} but stdin actually contained content ` +
      `hashing to ${actualHash} -- refusing to trust dispositions content that does not match the hash committed to ` +
      'before this process started'
    );
  }
  return parseApprovedDispositions(buf.toString('utf8')).signatures;
}

export async function migrateSubscription(pgClient, profileId, mongoUser, planSlugToId) {
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

  const sourceDocumentId = String(mongoUser._id);
  const ledgerKey = {
    sourceDatabase: SOURCE_DATABASE, sourceCollection: 'users', sourceDocumentId,
    targetTable: 'subscriptions',
  };
  const sourceContentHash = contentHashOf(sub);
  const priorLedger = await findLedgerEntry(pgClient, ledgerKey);
  if (priorLedger && priorLedger.source_content_hash !== sourceContentHash) {
    return { status: 'FAIL', reason: 'subscription source content hash differs from its existing migration_source_ledger entry' };
  }

  // PR #70 review round 7, item 3: a ledger row that already recorded a
  // target_id is NEVER trusted blindly -- the SAME "read back and
  // independently re-verify, or fail closed" discipline as
  // openSourceLedger()'s round-7 fix. A ledger claiming a target that no
  // longer matches a real row for this profile means the target went
  // missing (deleted out-of-band, a partial rollback of a different
  // domain, etc.) -- this function must never silently create a
  // replacement; it fails closed instead (item 4's "لا تنشئ target بديلًا
  // تلقائيًا").
  let resumeTargetId = null;
  if (priorLedger?.target_id) {
    const attributed = await pgClient.query(
      `SELECT id FROM subscriptions WHERE id = $1 AND user_id = $2`,
      [priorLedger.target_id, profileId]
    );
    if (attributed.rows.length === 0) {
      await markFailed(pgClient, priorLedger.id, 'ledger target_id no longer matches a real subscription row for this profile').catch(() => {});
      return {
        status: 'FAIL',
        reason: 'subscription ledger target is missing or belongs to a different profile -- refusing to create a replacement automatically',
      };
    }
    resumeTargetId = priorLedger.target_id;
    if (priorLedger.status === 'reconciled') {
      return { status: 'migrated', resumed: true, planSlug: slug, derivedStatus: derived.status, reason: derived.reason };
    }
    // status is 'created' (crashed between the write and reconciliation)
    // or 'failed' with a real, verified target -- fall through to the
    // read-back-verify-then-reconcile path below, reusing this exact row,
    // never re-inserting.
  }

  if (!resumeTargetId) {
    // A target row with no exact source-document ledger entry is unrelated
    // data, even when its owning profile is itself attributable. Detect it
    // before writing a planned ledger row and before INSERT/ON CONFLICT.
    //
    // Round 8, item 5: this is EXACTLY the "planned/null-target ledger
    // (or no ledger at all) with a target already present" case -- e.g. a
    // ledger row still 'planned' (a prior run got this far but never
    // wrote the target, or the target was created by something outside
    // this migration's own INSERT). Round 7 failed this closed as a
    // generic 'FAIL', which is correct in spirit but indistinguishable in
    // the report from an ordinary validation error a re-run might fix on
    // its own. This is NOT that: no amount of retrying this script will
    // ever resolve it, because the ambiguity is real and can only be
    // resolved by a human who can look at BOTH rows and decide whether
    // they are the same subscription. Rather than attempt an automatic
    // field-by-field "recovery" (comparing plan/status/dates and hoping
    // agreement implies identity -- exactly the kind of assumption item 2
    // rejected for accounts sharing an email), this fails closed with an
    // explicit, distinct classification a caller/operator can filter and
    // alert on separately from a transient/fixable FAIL, and never claims
    // an automatic recovery it did not actually perform.
    const unknownExisting = await pgClient.query(`SELECT id FROM subscriptions WHERE user_id = $1 LIMIT 1`, [profileId]);
    if (unknownExisting.rows.length > 0) {
      const reason =
        'an existing subscription row exists for this profile with no matching source-scoped migration_source_ledger ' +
        'entry -- refusing to silently claim, overwrite, or ignore it; requires a human to manually verify whether this ' +
        "IS this source document's subscription (then attribute it via the ledger) or resolve the conflict, before this " +
        'document can proceed';
      if (priorLedger) await markFailed(pgClient, priorLedger.id, reason).catch(() => {});
      return { status: 'BLOCKED_MANUAL_RECONCILIATION', reason };
    }
  }

  // Round 7, item 3: reuses the EXISTING 'planned' ledger row (from a
  // prior crash before any write, or before the INSERT below) rather than
  // creating a second one -- "أغلق حالة subscription موجودة مع planned/
  // null-target ledger بطريقة resume آمنة ومثبتة".
  const ledgerId = priorLedger?.id ?? await markPlanned(pgClient, { ...ledgerKey, contentHash: sourceContentHash });

  let targetId = resumeTargetId;
  if (!targetId) {
    // Round 7, item 3: the target write and markCreated() are now ONE
    // real transaction -- exactly the pattern mongo-to-supabase.mjs's own
    // migrateDomain() already uses for every domain table (see that
    // file's own "Kill-window 2" comment). Without this, a crash strictly
    // between "the row was written" and "the ledger was told its id"
    // would leave a genuinely untracked orphan subscription row with no
    // ledger linkage at all -- the exact bug class items 3/4 both target.
    try {
      await pgClient.query('BEGIN');
      const insertResult = await pgClient.query(
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
        // subscriptions_one_active_per_user only guards status='active' —
        // a non-active derived status always inserts fine; if this DID
        // fail on that unique index, a prior run already created the
        // active row.
        if (err.code === '23505') return { rows: [] };
        throw err;
      });

      if (insertResult.rows.length === 0) {
        // ON CONFLICT fired -- nothing was written by this statement.
        // Roll back (a no-op, nothing to undo) and fall through to the
        // conflicting-active-subscription handling below, OUTSIDE the
        // transaction.
        await pgClient.query('ROLLBACK');
      } else {
        targetId = insertResult.rows[0].id;
        // Round 7, item 3: "اختبر kill window بعد INSERT وقبل markCreated"
        // -- fires INSIDE the still-open transaction, after the INSERT,
        // before markCreated(). The kill-window test proves the whole
        // transaction rolls back: the row must NOT exist afterward.
        throwIfFaultStage('after_subscription_insert_before_marked_created');
        await markCreated(pgClient, ledgerId, targetId);
        await pgClient.query('COMMIT');
      }
    } catch (err) {
      await pgClient.query('ROLLBACK').catch(() => {});
      await markFailed(pgClient, ledgerId, err.message).catch(() => {});
      return { status: 'FAIL', reason: `subscription write failed and was rolled back: ${err.message}` };
    }
  }

  if (!targetId) {
    // ON CONFLICT DO NOTHING actually fired: some active subscription
    // already occupies this user's slot. This is ONLY ever "migrated" if
    // OUR OWN ledger already recorded that exact row (handled via
    // resumeTargetId above) -- reaching here means it did not, so this is
    // unknown/unrelated data this migration must never silently claim.
    await markFailed(pgClient, ledgerId, 'a conflicting active subscription exists for this user and is not attributable to this migration');
    return {
      status: 'FAIL',
      reason: 'a conflicting active subscription already exists for this user and is not attributable to this migration ' +
        '(ON CONFLICT DO NOTHING fired against data with no matching migration_source_ledger entry)',
    };
  }

  // Round 7, item 3: "نفّذ read-back verification بعد commit ثم
  // markReconciled" -- never assume the just-committed (or just-resumed)
  // row is exactly right; independently re-read it and confirm identity
  // before calling it done.
  //
  // Round 9, item 5: round 7's own read-back only ever checked bare
  // EXISTENCE (`id = $1 AND user_id = $2`) -- never compared any of the
  // actual subscription CONTENT (plan_id, provider, status, period
  // dates, cancel_at_period_end, renewal_reminder_sent_for) against what
  // this migration itself just wrote. A trigger (or anything else)
  // silently rewriting one of those values under the same id/user_id
  // passed completely unnoticed. Strengthened to compare every field
  // this INSERT itself set, via the same shared comparator
  // mongo-to-supabase.mjs's generic domain loop now uses.
  const readBack = await verifyReadBack(pgClient, { table: 'subscriptions' }, targetId, {
    id: targetId,
    user_id: profileId,
    plan_id: planId,
    provider: sub.provider || 'manual',
    provider_customer_id: sub.stripeCustomerId || null,
    provider_subscription_id: sub.stripeSubscriptionId || null,
    status: derived.status,
    current_period_start: sub.activeSince || null,
    current_period_end: sub.validUntil || null,
    cancel_at_period_end: !!sub.cancelAtPeriodEnd,
    renewal_reminder_sent_for: sub.renewalReminderSentFor || null,
  });
  if (!readBack.ok) {
    await markFailed(pgClient, ledgerId, readBack.reason).catch(() => {});
    return { status: 'FAIL', reason: readBack.reason };
  }
  await markReconciled(pgClient, ledgerId);
  return { status: 'migrated', resumed: !!resumeTargetId, planSlug: slug, derivedStatus: derived.status, reason: derived.reason };
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

// PR #70 review round 7, item 1: an explicit allowlist, shared with every
// other entrypoint in this directory (lib/cli-args.mjs) -- see that
// module's own header for the exact truthy-string/unknown-flag bugs this
// closes. `--execute` and `--with-invite-plan` are boolean-only (no
// `=value` accepted at all, not even `=false`/`=true`); `--approved-
// dispositions` requires a non-empty `=<path>`. Parsing happens as the
// FIRST thing main() does, before any env var is even read, so a bad flag
// stops the process before it can touch Mongo/Postgres/GoTrue at all.
const CLI_SPEC = {
  flags: {
    execute: { type: 'boolean' },
    'with-invite-plan': { type: 'boolean' },
    'approved-dispositions': { type: 'string' },
    // Round 8, item 3: the TOCTOU-closing alternative input mode -- see
    // loadApprovedDispositionsFromStdin()'s own header. Orchestrator-only;
    // a human operator running this script directly still uses the plain
    // path-based --approved-dispositions above.
    'approved-dispositions-stdin': { type: 'boolean' },
    'approved-dispositions-hash': { type: 'string' },
  },
};

async function main() {
  const args = parseStrictCliArgs(process.argv.slice(2), CLI_SPEC);
  const execute = !!args.execute;
  const withInvitePlan = !!args['with-invite-plan'];
  const approvedDispositionsPath = typeof args['approved-dispositions'] === 'string' ? args['approved-dispositions'] : null;
  const approvedDispositionsViaStdin = !!args['approved-dispositions-stdin'];
  const approvedDispositionsHash = typeof args['approved-dispositions-hash'] === 'string' ? args['approved-dispositions-hash'] : null;

  // Cross-flag validation (round 8, item 8): the two input modes are
  // mutually exclusive, and the stdin mode's two flags must always be
  // given together -- a hash with no stdin flag, or a stdin flag with no
  // hash to verify against, are both meaningless and are rejected rather
  // than silently defaulting to "no dispositions approved".
  if (approvedDispositionsViaStdin && !approvedDispositionsHash) {
    throw new Error('--approved-dispositions-stdin requires --approved-dispositions-hash=<sha256> to verify the content against');
  }
  if (approvedDispositionsHash && !approvedDispositionsViaStdin) {
    throw new Error('--approved-dispositions-hash requires --approved-dispositions-stdin -- it has nothing to verify without it');
  }
  if (approvedDispositionsPath && (approvedDispositionsViaStdin || approvedDispositionsHash)) {
    throw new Error('--approved-dispositions cannot be combined with --approved-dispositions-stdin/--approved-dispositions-hash -- pick exactly one input mode');
  }

  // Fail fast on a malformed dispositions file/stream before touching
  // Mongo/PG at all -- this content is trusted operator input either way,
  // same fail-closed posture as loadApprovedDispositions() itself.
  const approvedSignatures = approvedDispositionsViaStdin
    ? await loadApprovedDispositionsFromStdin(approvedDispositionsHash)
    : loadApprovedDispositions(approvedDispositionsPath);

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

    // ===================================================================
    // Phase A -- FULL deterministic validation, zero writes, identical in
    // --plan and --execute. Review round 6, item 1: this used to stop at
    // identity/relationships; "execution continues and computeExitFailure()
    // is called only after users, relationships, and subscriptions may
    // already have been written" was a real bug -- an admin with an
    // unmapped role, or a user with an unresolvable subscription plan,
    // was only ever discovered INSIDE the per-document loop, by which
    // point every document processed BEFORE it had already been written
    // for real. compensate() (production-import-orchestrator.mjs) makes
    // this worse: it invokes this script's --execute path directly,
    // WITHOUT a plan pass first, so there was no earlier --plan run to
    // have caught it either. Fixed: every deterministic check --
    // identities, relationships, admin-role mapping, subscription
    // validity -- now runs here, BEFORE either per-document loop, and (in
    // --execute) any unapproved problem aborts the ENTIRE run with ZERO
    // writes anywhere, not just a per-document skip.
    // ===================================================================
    const identityProblems = computeIdentityEmailProblems(users, admins);
    const identityDisposition = partitionByDisposition(identityProblems, emailProblemSignature, approvedSignatures);
    report.identity = {
      problems: identityProblems,
      approvedCount: identityDisposition.approved.length,
      unapprovedCount: identityDisposition.unapproved.length,
    };
    // Review round 6, item 1: matched by stable source identity now (see
    // computeInvalidDocIds()'s own comment for the raw-vs-normalized-email
    // bug this replaces), never by re-deriving/re-normalizing an email.
    const invalidDocIds = computeInvalidDocIds(identityProblems);

    const relationshipPlan = computeRelationshipPlan(users, invalidDocIds);
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

    const adminRoleProblems = computeAdminRoleMappingProblems(admins);
    const subscriptionProblems = computeSubscriptionProblems(users);

    // Review round 6, item 2: "reject ... unused/unknown signatures" --
    // an approved-dispositions entry that matched nothing real in this
    // run is a hard, fail-closed error in BOTH modes (a stale/typo'd
    // signature is exactly the kind of drift that must never be silently
    // tolerated), checked before anything else below.
    const matchedSignatures = [
      ...identityDisposition.approved.map(emailProblemSignature),
      ...relationshipDisposition.approved.map(relationshipSkipSignature),
    ];
    const unusedSignatures = findUnusedApprovedSignatures(approvedSignatures, matchedSignatures);
    if (unusedSignatures.length > 0) {
      throw new Error(
        `--approved-dispositions contains ${unusedSignatures.length} signature(s) that matched no real problem/skip in this run ` +
        `-- remove stale entries or verify the file is correct: ${unusedSignatures.join(', ')}`
      );
    }

    const hasUnapprovedValidationFailure =
      identityDisposition.unapproved.length > 0 ||
      relationshipDisposition.unapproved.length > 0 ||
      adminRoleProblems.length > 0 ||
      subscriptionProblems.length > 0;

    if (execute && hasUnapprovedValidationFailure) {
      // Zero-write-on-validation-failure: nothing below this block has
      // run yet -- no migrateOneUser()/migrateOneAdmin(),
      // applyRelationships(), plan-catalog seeding, or migrateSubscription()
      // call has ever been made. The report is still fully populated from
      // what Phase A already found, so a caller never loses visibility
      // into WHY the run refused to write.
      for (const p of adminRoleProblems) report.admins.errors.push({ email: p.email, message: p.reason });
      for (const p of subscriptionProblems) report.subscriptions.failed.push({ email: p.email, reason: p.reason });
      report.reconciliation = {
        skipped: true,
        reason: 'zero-write-on-validation-failure: deterministic validation found an unapproved problem before any write was attempted',
        consistent: false,
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    // ===================================================================
    // Phase B -- writes. Only reached when --plan (never writes anyway)
    // or when --execute AND Phase A found zero unapproved problems.
    // ===================================================================

    for (const u of users) {
      if (invalidDocIds.has(`user:${String(u._id)}`)) continue; // recorded in report.identity above, never silently processed
      const result = await migrateOneUser(supabaseAdmin, pgClient, u, { execute });
      checkpoint[`user:${u.email}`] = { ...result, at: new Date().toISOString() };
      if (result.status === 'created') report.users.created++;
      else if (result.status === 'already_exists') report.users.alreadyExists++;
      else if (result.status === 'would_create') report.users.wouldCreate++;
      else if (result.status === 'error') report.users.errors.push({ email: u.email, message: result.message });
    }

    for (const a of admins) {
      if (invalidDocIds.has(`admin:${String(a._id)}`)) continue; // recorded in report.identity above, never silently processed
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

      // Round 7, item 6: applyRelationships() no longer throws for a
      // per-link ownership/verification failure (each of applyTeacherLink/
      // applyParentChildLink already isolates and reports its own error
      // internally) -- its `errors` array is folded into the report and
      // fails the run closed via computeExitFailure(), exactly like
      // users/admins/subscriptions errors, without ANY single bad
      // relationship crashing the whole batch.
      const relationshipWriteResult = await applyRelationships(pgClient, users, emailToProfileId);
      report.relationships.writeErrors = relationshipWriteResult.errors;

      const usersWithSubscription = users.filter((u) => u.subscription && u.subscription.plan);
      if (usersWithSubscription.length > 0) {
        await ensureMigrationSeedAdmin(pgClient);
        const planSlugToId = await seedCanonicalPlans(pgClient, { withImpersonatedAdmin });
        for (const u of usersWithSubscription) {
          const profileId = emailToProfileId.get(String(u.email).toLowerCase().trim());
          if (!profileId) continue;
          const result = await migrateSubscription(pgClient, profileId, u, planSlugToId);
          if (result.status === 'migrated') report.subscriptions.migrated++;
          else if (result.status === 'FAIL' || result.status === 'BLOCKED_MANUAL_RECONCILIATION') {
            // Round 8, item 5: BLOCKED_MANUAL_RECONCILIATION is reported
            // through the SAME failed[] array (so computeExitFailure()
            // fails the run with zero new wiring), tagged with its own
            // `status` so a human/CI can immediately tell "needs a manual
            // decision" apart from an ordinary, possibly-transient FAIL.
            report.subscriptions.failed.push({ email: u.email, reason: result.reason, status: result.status });
          }
          else report.subscriptions.skipped++;
        }
      }
    } else {
      // Review round 4: a --plan run must fail on every error detectable
      // WITHOUT writing anything, not just an --execute run -- reuses
      // Phase A's own subscriptionProblems (computed once, above) rather
      // than re-deriving the same pure check a second time.
      const usersWithSubscription = users.filter((u) => u.subscription && u.subscription.plan);
      const failedEmails = new Set(subscriptionProblems.map((p) => p.email));
      for (const p of subscriptionProblems) report.subscriptions.failed.push(p);
      report.subscriptions.wouldMigrate = usersWithSubscription.filter((u) => !failedEmails.has(u.email)).length;
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
    // An identity problem's own `.email` is already the normalized value
    // (see computeIdentityEmailProblems()'s comment) -- a document with an
    // APPROVED (not unapproved) identity problem still never gets
    // processed by the loops above (invalidDocIds guards them
    // unconditionally, regardless of disposition), so its email must not
    // be counted as "expected" here either, or a genuinely consistent run
    // could falsely report reconciliation.consistent=false.
    const invalidNormalizedEmails = new Set(identityProblems.filter((p) => p.email).map((p) => p.email));
    const expectedEmails = distinctEmails.filter((e) => !erroredEmails.has(e) && !invalidNormalizedEmails.has(e));
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
    // Round 7, item 6: a relationship WRITE failure (ownership conflict,
    // post-commit verification failure, etc.) is just as real a failure as
    // a plan-time skip -- execute-only, since writeErrors can only ever be
    // populated once Phase B has actually run.
    (report.relationships?.writeErrors?.length ?? 0) > 0 ||
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
