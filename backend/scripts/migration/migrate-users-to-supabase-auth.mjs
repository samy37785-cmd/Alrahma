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
    if (existing.target_id && existingTargetId && String(existing.target_id) !== String(existingTargetId)) {
      throw new Error(
        `migration_source_ledger target mismatch for ${sourceCollection}/${sourceDocumentId} -> ${targetTable}; ` +
        `ledger target ${existing.target_id} does not match existing target ${existingTargetId}`
      );
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

export async function migrateOneUser(supabaseAdmin, pgClient, mongoUser, { execute }) {
  const email = String(mongoUser.email).toLowerCase().trim();

  const existingRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
  let profileId = existingRes.rows[0]?.id ?? null;
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

  if (!profileId) {
    throwIfFaultStage('during_user_creation');
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomThrowawayPassword(),
      email_confirm: true,
      user_metadata: { migrated_from: 'mongodb', migrated_at: new Date().toISOString() },
    });
    if (error) {
      await markFailed(pgClient, ledgerId, error.message);
      return { status: 'error', message: error.message };
    }
    profileId = data.user.id;
    status = 'created';
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
  const persona = await applyPersona(pgClient, profileId, mongoUser);
  await markCreated(pgClient, ledgerId, profileId);
  await markReconciled(pgClient, ledgerId);
  return { status, id: profileId, persona };
}

export async function migrateOneAdmin(supabaseAdmin, pgClient, mongoAdmin, { execute }) {
  const email = String(mongoAdmin.email).toLowerCase().trim();
  const mappedRole = ADMIN_ROLE_MAP[mongoAdmin.role];
  if (!mappedRole) return { status: 'error', message: `unmapped AdminUser role: ${mongoAdmin.role}` };

  const existingRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
  let userId = existingRes.rows[0]?.id ?? null;

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

  if (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomThrowawayPassword(),
      email_confirm: true,
      user_metadata: { migrated_from: 'mongodb_adminuser', migrated_at: new Date().toISOString() },
    });
    if (error) {
      await markFailed(pgClient, ledgerId, error.message);
      return { status: 'error', message: error.message };
    }
    userId = data.user.id;
    await markCreated(pgClient, ledgerId, userId);
  }

  if (!ledger.target_id) await markCreated(pgClient, ledgerId, userId);
  await pgClient.query(`UPDATE profiles SET name = $2, role = 'admin' WHERE id = $1`, [userId, mongoAdmin.name || null]);
  await pgClient.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET role = $2`,
    [userId, mappedRole]
  );
  await markCreated(pgClient, ledgerId, userId);
  await markReconciled(pgClient, ledgerId);

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

  if (priorLedger?.target_id) {
    const attributed = await pgClient.query(
      `SELECT id FROM subscriptions WHERE id = $1 AND user_id = $2`,
      [priorLedger.target_id, profileId]
    );
    if (attributed.rows.length === 0) {
      return { status: 'FAIL', reason: 'subscription ledger target is missing or belongs to a different profile' };
    }
    await markReconciled(pgClient, priorLedger.id);
    return { status: 'migrated', resumed: true, planSlug: slug, derivedStatus: derived.status, reason: derived.reason };
  }

  // A target row with no exact source-document ledger entry is unrelated
  // data, even when its owning profile is itself attributable. Detect it
  // before writing a planned ledger row and before INSERT/ON CONFLICT.
  const unknownExisting = await pgClient.query(`SELECT id FROM subscriptions WHERE user_id = $1 LIMIT 1`, [profileId]);
  if (unknownExisting.rows.length > 0) {
    return {
      status: 'FAIL',
      reason: 'an existing subscription for this profile has no matching source-scoped migration_source_ledger entry',
    };
  }

  const ledgerId = priorLedger?.id ?? await markPlanned(pgClient, {
    ...ledgerKey, contentHash: sourceContentHash,
  });

  // Review round 6, item 3: this used to discard the INSERT's own result
  // entirely and unconditionally report status='migrated' -- including
  // the exact moment `ON CONFLICT (user_id) WHERE status='active' DO
  // NOTHING` actually fired (RETURNING then yields ZERO rows, no
  // exception at all, so the pre-existing `.catch(23505)` never even ran
  // for this path). An UNRELATED pre-existing active subscription for
  // this user -- data this migration never wrote and has no relationship
  // to -- was silently preserved AND falsely reported as this run's own
  // successful migration.
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
    // subscriptions_one_active_per_user only guards status='active' — a
    // non-active derived status always inserts fine; if this DID fail on
    // that unique index, a prior run already created the active row.
    if (err.code === '23505') return { rows: [] };
    throw err;
  });

  if (insertResult.rows.length > 0) {
    const targetId = insertResult.rows[0].id;
    await markCreated(pgClient, ledgerId, targetId);
    await markReconciled(pgClient, ledgerId);
    return { status: 'migrated', planSlug: slug, derivedStatus: derived.status, reason: derived.reason };
  }

  // ON CONFLICT DO NOTHING actually fired: some active subscription
  // already occupies this user's slot. Fixed: this is ONLY ever treated
  // as "migrated" (a genuine resume) if OUR OWN ledger already recorded
  // that exact row for this exact source document -- never merely
  // because a row happens to exist. Otherwise it is unknown/unrelated
  // data this migration must never silently claim as its own.
  await markFailed(pgClient, ledgerId, 'a conflicting active subscription exists for this user and is not attributable to this migration');
  return {
    status: 'FAIL',
    reason: 'a conflicting active subscription already exists for this user and is not attributable to this migration ' +
      '(ON CONFLICT DO NOTHING fired against data with no matching migration_source_ledger entry)',
  };
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
  // Review round 6, item 2: "reject duplicate flags" -- passing
  // --approved-dispositions twice is ambiguous (which one governs?) and
  // is never silently resolved by "last one wins".
  const dispositionsFlags = argv.filter((a) => a === '--approved-dispositions' || a.startsWith('--approved-dispositions='));
  if (dispositionsFlags.length > 1) {
    throw new Error('--approved-dispositions was passed more than once -- pass it exactly once');
  }
  if (dispositionsFlags[0] === '--approved-dispositions' || dispositionsFlags[0] === '--approved-dispositions=') {
    throw new Error('--approved-dispositions requires a non-empty =<path> value');
  }
  const approvedDispositionsPath = dispositionsFlags[0] ? dispositionsFlags[0].slice('--approved-dispositions='.length) : null;
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
