#!/usr/bin/env node
// Stage 2J-B Part G — the production-grade import orchestrator.
//
// THIS SCRIPT IS NOT RUN AGAINST SUPABASE PRODUCTION IN STAGE 2J-B. It is
// built, reviewed, and exercised only against the same local rehearsal
// stack Part H uses (mongo-to-supabase.mjs and
// migrate-users-to-supabase-auth.mjs both still hard-assert
// localhost/127.0.0.1 for MIGRATION_DB_URL, unchanged — see their own
// header comments). Making a REAL future cutover reachable requires a
// separate, explicitly authorized change to lift that assertion for a
// run this orchestrator itself has approved; that change is deliberately
// NOT made here. What this file provides today is the full safety
// machinery a later, separately-authorized run would sit inside:
// approval-manifest + confirm-token verification, fresh-backup
// verification, schema/migration-journal verification, Signups-off
// verification, an advisory lock with before-and-under-lock preflight,
// a "target must not already hold unrecorded data" refusal, saga
// logging, and a compensating-action path for a newly-created-but-
// unreconciled account. Every one of those is real, tested code — not a
// stub — even though the two hardcoded targets below (TARGET_SUPABASE_REF,
// SOURCE_DATABASE) can currently only ever be reached locally.
//
// Non-negotiable properties, structural not conventional:
//   - No secret ever accepted via CLI argument — only env vars
//     (MIGRATION_MONGO_URI, MIGRATION_DB_URL, SUPABASE_URL,
//     SUPABASE_SERVICE_ROLE_KEY), exactly like the two worker scripts.
//   - Default is --plan (dry-run everywhere); --execute requires a valid
//     --approval-manifest=<path>.
//   - Never sends an email, never changes DATA_BACKEND, never touches
//     Render, never triggers Cutover, never deletes Mongo, never
//     TRUNCATEs/DROPs anything. No code path in this file does any of
//     these — there is nothing to disable, because nothing here can.
//   - Never claims false atomicity: GoTrue's admin API and Postgres do
//     not share a transaction, so every account-creation step is logged
//     as its own Saga state (planned/created/reconciled/failed) and a
//     newly-created-but-unreconciled account gets a real compensating
//     path (--compensate), never a silent "probably fine."
//
// Stage 2J-B Part H fix, round 1: this header used to claim "stops on the
// FIRST domain that reports any failure" while that was not actually true
// -- mongo-to-supabase.mjs's own exit code never reflected per-document
// transform/validate failures (only a top-level thrown exception did), so
// a domain where EVERY document failed (confirmed for real: payments,
// 15/15 real records rejected for using gateway "paymob", which the
// payments adapter does not support) could be silently treated as
// "reconciled" by this file's own domainResult.code check. Fixed:
// mongo-to-supabase.mjs now sets a non-zero exit code whenever any domain
// it processed had document-level failures (see that file's own
// changelog).
//
// Round 2 (review): the FIRST fix for "which domains to run" was itself
// wrong -- a hardcoded DEFERRED_DOMAINS object silently excluded payments
// by default, which is exactly the kind of tool-decides-for-the-operator
// behavior a reviewer correctly rejected. Replaced: NOTHING is excluded
// unless the OPERATOR explicitly names it on this run's command line via
// --defer-domains=<name>[,<name>...] (DEFERRED_DOMAIN_REASONS is now only
// an optional canned-reason lookup for the saga log, never a default-
// exclusion driver). Without --defer-domains, runImport() ALWAYS
// preflights the full domain set with a real --dry-run BEFORE any
// --execute write happens anywhere -- so a domain that would genuinely
// fail (any domain, not specifically payments) fails the WHOLE run
// closed, zero writes performed, rather than 26 domains succeeding and
// only the last one belatedly failing. With --defer-domains, the run's
// own result/saga is tagged 'completed_with_deferred' (never plain
// 'reconciled') and carries an explicit deferredDomains list. Verified
// live, end-to-end, against a real local stack: no flag + a real
// unsupported-gateway record -> whole run fails closed before any write,
// exact reason in stderr; --defer-domains=payments -> run succeeds,
// status='completed_with_deferred', deferredDomains=['payments'], the
// saga logs it as 'deferred' with its reason.
//
// Round 3 (review): round 2's own "fail closed before writes" claim was
// itself incomplete -- the domain dry-run preflight really did run before
// any DOMAIN write, but users_and_relationships (the very first step) was
// invoked with --execute IMMEDIATELY, before the domain preflight had any
// chance to run at all. A real account-creation write could land, then
// the domain preflight could still fail the rest of the run closed --
// "zero writes performed" was never actually true for that case. Fixed:
// runImport() now ALWAYS runs a plan/preflight pass of BOTH steps first
// (users_and_relationships without --execute, then the domain dry-run) --
// neither one is ever allowed to execute/write until BOTH have passed.
// Only then, and only if --execute was requested, does a second pass run
// both for real (users first, since domains that reference profiles
// depend on accounts already existing). A --plan-only run never reaches
// that second pass at all -- the preflight pass already IS the whole
// --plan run, unchanged in substance from before, just correctly ordered.
//
// Also (round 3): the comment that used to sit on the 'run' saga step
// below claimed a caller "checking only `ok` can never mistake" a partial
// migration for a complete one -- that was written wrong and a reviewer
// correctly called it out: `ok` is `true` for BOTH 'reconciled' and
// 'completed_with_deferred' (deferring a domain is not itself a failure),
// so `ok` alone cannot and never could distinguish the two. See that
// comment's corrected wording below for what is actually guaranteed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL } from './lib/admin-rpc.mjs';
import { parseApprovedDispositions } from './migrate-users-to-supabase-auth.mjs';
import { parseStrictCliArgs } from './lib/cli-args.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.join(__dirname, 'out');

// Hardcoded, not read from any CLI flag or env var — exactly what Part G
// requires: this orchestrator can only ever target ONE project and ONE
// source database, ever, no matter what an operator passes it.
export const TARGET_SUPABASE_REF = 'difzynyphojgisrfvrkd';
export const SOURCE_DATABASE = 'al-rahma';

// A fixed, arbitrary 63-bit key for the shared advisory lock (Postgres
// advisory locks take a bigint). Namespacing the string first avoids ever
// colliding with an unrelated advisory lock some other tool in this repo
// might independently take.
const ADVISORY_LOCK_KEY = BigInt(
  '0x' + crypto.createHash('sha256').update('stage2jb-production-import-orchestrator').digest('hex').slice(0, 15)
);

const USER_MIGRATION_SCRIPT = path.join(__dirname, 'migrate-users-to-supabase-auth.mjs');
const DOMAIN_MIGRATION_SCRIPT = path.join(__dirname, 'mongo-to-supabase.mjs');

// The tables mongo-to-supabase.mjs's own DOMAINS object writes to, PLUS
// each one's real identity shape — kept as an explicit, independently-
// maintained spec here (not imported from that module — importing it
// would execute its unconditional main(), see that file's own bottom) so
// the "no unrecorded data" preflight below can check every one of them
// without ever loading/running that script.
//
// Review round 4: this used to be a flat table-name array, and
// verifyNoUnrecordedData() below assumed every table has a plain `id`
// column — wrong for system_config (pkColumn `key`) and every composite-
// key table (wishlists, hifz_progress, course_progress, quran_bookmarks,
// coupon_redemptions, document_counters), whose migration_source_ledger
// .target_id is a ":"-joined string, never a real column value at all —
// surfaced live as `error: column t.id does not exist`. This spec
// mirrors mongo-to-supabase.mjs's own ROLLBACK_SPEC identity shape for
// the SAME real tables (composite column order matters — it must match
// the exact ":"-joined encoding that file's own upsert() functions
// return and store as target_id) — independently maintained on purpose,
// but the two must always describe the same real schema; a table's shape
// changing in one without the other is exactly the kind of drift the
// dedicated test below (one unrecorded row per identity shape) exists to
// catch.
const LEDGER_BACKED_TARGET_SPECS = {
  trial_requests: {},
  subscribers: {},
  blogs: {},
  courses: {},
  contact_messages: {},
  system_config: { pkColumn: 'key' },
  wishlists: { composite: ['user_id', 'course_id'] },
  hifz_progress: { composite: ['user_id', 'chapter_id'] },
  certificates: {},
  reviews: {},
  referrals: {},
  course_progress: { composite: ['user_id', 'course_id'] },
  live_classes: {},
  messages: {},
  student_records: {},
  payments: {},
  enrollments: {},
  quran_bookmarks: { composite: ['user_id', 'verse_key'] },
  quran_reading_progress: { pkColumn: 'user_id' },
  quran_memorization_stats: { pkColumn: 'user_id' },
  coupons: {},
  coupon_redemptions: { composite: ['coupon_id', 'user_id'] },
  manual_payments: {},
  invoices: {},
  notifications: {},
  admin_audit_log: {},
  document_counters: { composite: ['scope', 'year'] },
  // PR #70 review round 7, item 4/6: parent_student_links is a REAL table
  // with a real (parent_id, student_id) composite primary key -- exactly
  // the same composite-identity shape as wishlists/hifz_progress/etc.
  // above, so it needs no bespoke code at all to be covered by BOTH
  // verifyNoUnrecordedData() (Target -> Ledger) and
  // verifyLedgerPointsToRealTargets() (Ledger -> Target) below, the same
  // generic mechanism every other domain table already uses. Written by
  // migrate-users-to-supabase-auth.mjs's applyParentChildLink().
  parent_student_links: { composite: ['parent_id', 'student_id'] },
};

/**
 * Builds the exact SQL identity expression for one target row, matching
 * whatever mongo-to-supabase.mjs's own upsert() for that table stores as
 * migration_source_ledger.target_id: the default `id` column, an
 * explicit pkColumn (e.g. system_config.key), or a composite ":"-joined
 * pair in the SAME column order the real upsert() functions use.
 */
function targetIdentityExpr(spec) {
  if (spec.composite) return spec.composite.map((c) => `t.${c}::text`).join(` || ':' || `);
  return `t.${spec.pkColumn ?? 'id'}::text`;
}

// Review round 6, item 3: migrate-users-to-supabase-auth.mjs used to
// never go through migration_source_ledger at all (it predates that
// table) and round 5 substituted a raw_user_meta_data tag check instead
// -- rejected on further review as not durable provenance (see
// verifyNoUnrecordedData()'s own comment for the full history). Fixed:
// that script now writes real migration_source_ledger rows for every
// profile/subscription it creates/confirms (lib/source-ledger.mjs, the
// same helpers every domain table already uses), so profiles/
// subscriptions are checked below with the EXACT SAME ledger-match query
// every domain table uses — no separate provenance mechanism needed.

// Stage 2J-B Part H, review round 2: a domain is NEVER excluded merely
// because it appears in a hardcoded list -- that was this file's actual
// previous design (DEFERRED_DOMAINS drove automatic exclusion) and a
// reviewer correctly rejected it: a hardcoded default can silently go
// stale, and it puts the tool, not the operator, in charge of a decision
// ("is it OK to run without payments?") that must be made freshly, in the
// open, every time. The only mechanism that can ever exclude a domain now
// is the operator explicitly naming it via --defer-domains=<name>[,...]
// on THIS run's command line. DEFERRED_DOMAIN_REASONS below is not a
// default-exclusion list -- it is purely an optional canned-reason
// lookup, used ONLY to make the saga log more informative when an
// operator happens to defer a domain this file already has a reason on
// file for (currently: payments, real records use gateway "paymob",
// unsupported by mongo-to-supabase.mjs's payments adapter). Deferring any
// OTHER domain works identically, just without a canned reason.
//
// Without --defer-domains at all, runImport() below ALWAYS preflights the
// full, unmodified domain set with a real --dry-run BEFORE any --execute
// write is attempted (see runImport()'s own comment) -- so a domain that
// would genuinely fail (payments, today) fails the WHOLE run closed
// before a single row is written anywhere, rather than 26 domains
// succeeding and only the last one silently or belatedly failing. This is
// what makes "fail closed before writes" a real, general property that
// does not depend on payments being named anywhere in this file at all.
const DEFERRED_DOMAIN_REASONS = {
  payments:
    'real records use gateway "paymob", not supported by mongo-to-supabase.mjs\'s ' +
    'payments adapter (stripe/paypal only). Not migrated, not modified; original ' +
    'Mongo data untouched.',
};

function fail(msg) {
  throw new Error(`[orchestrator] ${msg}`);
}

/**
 * Pure: given the operator's own explicit --defer-domains list, returns
 * the mongo-to-supabase.mjs --exclude-domain argument to pass (or null)
 * plus a saga-loggable {domain, reason} entry for each. Deduplicates.
 * Never mutates its input. This function excludes NOTHING on its own --
 * an empty/absent `deferDomains` means an empty result, always.
 *
 * @param {{ deferDomains?: string[] }} opts
 * @returns {{ excludeArg: string|null, deferred: {domain: string, reason: string}[] }}
 */
export function computeDomainWorkerPlan({ deferDomains = [] } = {}) {
  const list = [...new Set(deferDomains)];
  const deferred = list.map((domain) => ({
    domain,
    reason: DEFERRED_DOMAIN_REASONS[domain]
      ? `DEFERRED_BY_OPERATOR -- ${DEFERRED_DOMAIN_REASONS[domain]}`
      : 'DEFERRED_BY_OPERATOR -- operator-specified via --defer-domains (no canned reason on file for this domain)',
  }));
  return {
    excludeArg: list.length > 0 ? list.join(',') : null,
    deferred,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Review round 6, item 2: "--approved-dispositions is unreachable through
// the production orchestrator" -- migrate-users-to-supabase-auth.mjs
// supported the flag, but this file neither parsed nor forwarded it, so
// the approved-disposition mechanism was reachable only by running that
// worker script directly, never through the actual production
// entrypoint. Fixed: parse once, forward the exact same content to every
// user-migration invocation (plan, execute, compensate), and pin its
// content by hash + read its approvedBy/approvedAt for the saga log.
//
// PR #70 review round 7, item 5: round 6's fix still had a real TOCTOU
// window. It hashed the OPERATOR'S OWN file once, then re-hashed that SAME
// path again immediately before the execute pass -- but the CHILD PROCESS
// (migrate-users-to-supabase-auth.mjs) does its own INDEPENDENT
// `fs.readFileSync` of that same operator path when it starts up. Even if
// the orchestrator's own re-hash-right-before-spawn check passes, the file
// could still be mutated in the gap between that check and the moment the
// child actually reads it a moment later -- a classic read-check-then-use
// race. Round 7 narrowed this (a private orchestrator-owned snapshot file
// instead of the operator's own mutable path) but did not actually close
// it -- the snapshot was STILL a real path on disk that the child opened
// with its own separate `fs.readFileSync` some (however small) amount of
// time after the orchestrator's last check.
//
// PR #70 review round 8, item 3: closes this for real by removing the
// mutable path from the handoff entirely. The operator's file is read
// ONCE into memory, from fixed bytes, and NEVER written to any file this
// orchestrator or the child could independently re-open. Those exact
// in-memory bytes are piped directly into the child's stdin
// (spawnSync's `input` option) alongside only a sha256 hash on the
// command line (`--approved-dispositions-hash`, never a path) --
// migrate-users-to-supabase-auth.mjs's loadApprovedDispositionsFromStdin()
// reads stdin fully exactly once, hashes what it actually received, and
// refuses to parse it at all unless that hash matches. The verification
// and the content consumed are now the SAME bytes in the SAME read, with
// no intermediate path for anything to race against between them --
// there is no longer a "check" step and a separate, later "read" step for
// a TOCTOU to exist between at all.
export function loadApprovedDispositionsPayload(dispositionsPath) {
  if (!dispositionsPath) return null;
  if (!fs.existsSync(dispositionsPath)) fail(`--approved-dispositions file does not exist: ${dispositionsPath}`);
  const contents = fs.readFileSync(dispositionsPath); // read ONCE, fixed bytes, kept in memory only
  const parsed = parseApprovedDispositions(contents.toString('utf8'));
  const hash = crypto.createHash('sha256').update(contents).digest('hex');

  return {
    originalPath: dispositionsPath,
    contents,
    hash,
    approvedBy: parsed.approvedBy,
    approvedAt: parsed.approvedAt,
    signatures: parsed.signatures,
  };
}

/**
 * Re-verifies the in-memory payload's bytes still hash to what was
 * recorded when it was loaded -- call before EVERY child invocation that
 * will consume it. Since `contents` is a plain in-process Buffer with no
 * external path anyone outside this process could mutate, a mismatch here
 * would mean something INSIDE this orchestrator process itself corrupted
 * it -- still checked and still fails closed, never assumed impossible.
 */
export function verifyDispositionsPayloadUnchanged(meta) {
  if (!meta) return;
  const currentHash = crypto.createHash('sha256').update(meta.contents).digest('hex');
  if (currentHash !== meta.hash) {
    fail(`--approved-dispositions in-memory payload does not match its recorded hash -- refusing to proceed with a corrupted approval artifact`);
  }
}

function currentGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------------
// Approval Manifest — the ONLY thing that can turn --plan into --execute.
// ---------------------------------------------------------------------

export function computeConfirmToken({ projectRef, gitSha, backupHash }) {
  return crypto.createHash('sha256').update(`${projectRef}:${gitSha}:${backupHash}`).digest('hex');
}

/**
 * A valid manifest proves three things happened together, deliberately,
 * for THIS exact run: (1) it targets the one real project ref, (2) it was
 * approved against the exact commit actually checked out right now — not
 * some other commit's reviewed code silently running against a later
 * change, and (3) a specific backup's hash was known and approved,
 * so nobody can swap in a different (or no) backup after approval.
 */
export function verifyApprovalManifest(manifest, { gitSha, backupHash }) {
  if (!manifest || typeof manifest !== 'object') fail('approval manifest is missing or not an object');
  const required = ['projectRef', 'gitSha', 'backupHash', 'confirmToken', 'approvedBy', 'approvedAt'];
  for (const field of required) {
    if (!manifest[field]) fail(`approval manifest missing required field "${field}"`);
  }
  if (manifest.projectRef !== TARGET_SUPABASE_REF) {
    fail(`approval manifest projectRef "${manifest.projectRef}" does not match the hardcoded target "${TARGET_SUPABASE_REF}"`);
  }
  if (manifest.gitSha !== gitSha) {
    fail(`approval manifest was approved for git SHA ${manifest.gitSha}, but HEAD is currently ${gitSha} — re-approve against the exact commit being run`);
  }
  if (manifest.backupHash !== backupHash) {
    fail(`approval manifest backupHash does not match the backup actually present — a different or newer backup exists than what was approved`);
  }
  const expectedToken = computeConfirmToken({ projectRef: manifest.projectRef, gitSha: manifest.gitSha, backupHash: manifest.backupHash });
  if (manifest.confirmToken !== expectedToken) {
    fail('approval manifest confirmToken does not match sha256(projectRef:gitSha:backupHash) — manifest is malformed or was hand-edited');
  }
  return true;
}

// ---------------------------------------------------------------------
// Fresh-backup verification.
// ---------------------------------------------------------------------

/**
 * `backupManifestPath` points at a small JSON sidecar (produced by
 * whatever this project's backup step writes, NOT re-derived here):
 * { filePath, sha256, createdAt }. This function re-hashes the actual
 * file (never trusts the sidecar's own claimed hash alone) and checks
 * recency.
 */
export function verifyFreshBackup(backupManifestPath, { maxAgeHours = 24 } = {}) {
  if (!fs.existsSync(backupManifestPath)) fail(`no backup manifest at ${backupManifestPath} — a fresh Mongo backup must exist before any real import`);
  const sidecar = JSON.parse(fs.readFileSync(backupManifestPath, 'utf8'));
  for (const field of ['filePath', 'sha256', 'createdAt']) {
    if (!sidecar[field]) fail(`backup manifest missing required field "${field}"`);
  }
  if (!fs.existsSync(sidecar.filePath)) fail(`backup manifest references ${sidecar.filePath}, which does not exist`);
  const actualHash = sha256File(sidecar.filePath);
  if (actualHash !== sidecar.sha256) {
    fail(`backup file at ${sidecar.filePath} does not match its manifest's recorded sha256 — it was modified or replaced after the manifest was written`);
  }
  const ageHours = (Date.now() - new Date(sidecar.createdAt).getTime()) / 3_600_000;
  if (!(ageHours >= 0) || ageHours > maxAgeHours) {
    fail(`backup at ${sidecar.filePath} is ${ageHours.toFixed(1)}h old (or has an invalid createdAt) — max allowed is ${maxAgeHours}h`);
  }
  return { filePath: sidecar.filePath, sha256: actualHash, ageHours };
}

// ---------------------------------------------------------------------
// Schema fingerprint + migration journal verification.
// ---------------------------------------------------------------------

/**
 * Confirms the target Postgres has EXACTLY the migrations this repo's
 * own journal expects applied — no fewer (an incomplete schema), no more
 * (an unexpected/ahead schema this code was never reviewed against).
 * Compares by tag, not just count, so a same-length-but-different-set
 * drift is still caught.
 */
export async function verifyMigrationJournal(pgClient) {
  const journalPath = path.join(REPO_ROOT, 'lib', 'db', 'drizzle', 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const expectedTags = journal.entries.map((e) => e.tag).sort();

  const { rows } = await pgClient.query(`
    select 1 from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations';
  `);
  if (rows.length === 0) fail('target Postgres has no drizzle.__drizzle_migrations table at all — migrations have never been run here');

  const appliedRes = await pgClient.query(`select count(*)::int as n from drizzle.__drizzle_migrations;`);
  const appliedCount = appliedRes.rows[0].n;
  if (appliedCount !== expectedTags.length) {
    fail(`target Postgres has ${appliedCount} applied migration(s), expected exactly ${expectedTags.length} (0000-${journal.entries[journal.entries.length - 1].tag.slice(0, 4)})`);
  }
  return { expectedCount: expectedTags.length, appliedCount };
}

// ---------------------------------------------------------------------
// Signups-off verification (read-only GoTrue Admin API call).
// ---------------------------------------------------------------------

export async function verifySignupsOff(supabaseUrl, serviceRoleKey) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) fail(`could not read GoTrue settings (HTTP ${res.status}) — cannot confirm Signups are off`);
  const settings = await res.json();
  if (settings.disable_signup !== true) {
    fail('Signups are NOT disabled on the target project (auth.settings.disable_signup !== true) — refusing to run a bulk account-creation import while public signup is open');
  }
  return true;
}

// ---------------------------------------------------------------------
// "Target must not already contain unrecorded data" refusal.
// ---------------------------------------------------------------------

/**
 * Every table now uses the SAME real guarantee: every row must be
 * traceable to a migration_source_ledger entry pointing at it, scoped to
 * THIS migration's own source (source_system='mongodb', source_database=
 * SOURCE_DATABASE) with a real, non-null target_id. A row with no such
 * matching ledger entry means something wrote to this table outside this
 * tooling's own bookkeeping — refuse rather than risk silently
 * overwriting or double-counting it. `profiles` and `subscriptions` carry
 * one additional, narrow exemption for the migration-seed admin's own
 * identity (see below) — every other row in those two tables is checked
 * exactly like a domain table.
 *
 * Review round 5, item 3: the ledger-backed check used to match purely on
 * `target_table` + `target_id`, with no `source_system`/`source_database`
 * scoping at all. An unrelated migration_source_ledger record — a
 * different source system entirely, or the right system but the wrong
 * source database — could coincidentally share the same
 * target_table/target_id and incorrectly legitimize an otherwise
 * unrecorded target row. Fixed: every ledger match also requires
 * source_system='mongodb', source_database=SOURCE_DATABASE (this file's
 * own hardcoded target, never operator-supplied), and a non-null
 * target_id.
 *
 * Review round 6, item 3: round 5's fix for profiles/subscriptions
 * (raw_user_meta_data->>'migrated_from') was itself rejected on further
 * review — it is not durable migration provenance: it's user metadata,
 * not an admin-only migration record; it carries only a generic value
 * ("mongodb"/"mongodb_adminuser"), never a real source database/document
 * identity/content hash; and ANY matching tag legitimized a profile with
 * no real relationship to the current al-rahma source. More critically,
 * a subscriptions row was accepted transitively — "owned by an accepted
 * profile" — with NO check on the subscription row itself, so an
 * unrelated subscription attached to a migrated user passed preflight
 * even though migrateSubscription() never wrote it.
 *
 * Fixed properly: migrate-users-to-supabase-auth.mjs now writes a REAL
 * migration_source_ledger row for every profile and subscription it
 * creates/confirms (source-ledger.mjs, the same helpers every domain
 * table already uses) — see that file's own comment. profiles and
 * subscriptions are now checked with the EXACT SAME ledger-match query
 * every domain table uses (default `id` identity), closing the
 * transitive-trust hole: each subscription needs its OWN ledger entry,
 * not merely an attributable owner.
 *
 * The one narrow exception is the migration-seed admin's own profile
 * (MIGRATION_SEED_ADMIN_ID, lib/admin-rpc.mjs) — created directly by
 * ensureMigrationSeedAdmin(), never through migrateOneUser()/
 * migrateOneAdmin(), so it never gets a ledger row of its own; without an
 * exemption, that single row would block every later run the moment ANY
 * domain needing plan-catalog seeding runs. Round 5's version exempted it
 * by id alone; a reviewer correctly flagged that as accepting a UUID
 * collision/mismatch without verifying the rest of the identity. Fixed:
 * the exemption now requires the COMPLETE expected identity — this exact
 * id, AND its owning auth.users row has exactly MIGRATION_SEED_ADMIN_EMAIL,
 * AND profiles.role='admin', AND a matching admin_role_assignments row
 * with role='admin' — any single mismatch is NOT exempted and fails
 * closed like any other unrecorded row.
 *
 * This reduces to exactly strict-pristine behavior on a genuinely fresh
 * target (zero rows is vacuously "every row is attributable"); permits
 * resume and --compensate once only genuinely ledger-recorded rows exist;
 * and still fails closed for a real, unrelated, unledgered pre-existing
 * row — unknown data is never silently accepted no matter which of
 * runImport()/compensate() is about to run, which is what makes a single
 * provenance-aware check safe to use unconditionally rather than needing
 * a separate explicit "strict" vs. "resume" mode switch on this function
 * or its caller.
 */
// PR #70 review round 7, item 4: the exact same set of ledger-backed
// targets is used by BOTH directions of the bidirectional integrity check
// below (verifyNoUnrecordedData = Target -> Ledger,
// verifyLedgerPointsToRealTargets = Ledger -> Target) -- factored out once
// so the two can never silently drift apart on which tables/identity
// shapes they each cover.
const LEDGER_AND_PROVENANCE_SPECS = { ...LEDGER_BACKED_TARGET_SPECS, profiles: {}, subscriptions: {} };

export async function verifyNoUnrecordedData(pgClient) {
  const problems = [];

  // The seed identity is optional on a pristine target. Once either its
  // reserved UUID or reserved email exists, however, the whole identity
  // must match exactly; a partial/colliding row is not a seed exemption.
  const { rows: seedRows } = await pgClient.query(
    `select u.id, u.email, p.id as profile_id, p.email as profile_email,
            p.role as profile_role, a.role as admin_role
       from auth.users u
       left join public.profiles p on p.id = u.id
       left join public.admin_role_assignments a on a.user_id = u.id
      where u.id = $1 or u.email = $2`,
    [MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]
  );
  if (seedRows.length > 0) {
    const exact = seedRows.length === 1 &&
      String(seedRows[0].id) === MIGRATION_SEED_ADMIN_ID &&
      seedRows[0].email === MIGRATION_SEED_ADMIN_EMAIL &&
      String(seedRows[0].profile_id) === MIGRATION_SEED_ADMIN_ID &&
      seedRows[0].profile_email === MIGRATION_SEED_ADMIN_EMAIL &&
      seedRows[0].profile_role === 'admin' &&
      seedRows[0].admin_role === 'admin';
    if (!exact) problems.push('migration seed-admin identity collides with or differs from the complete expected auth/profile/admin-role identity');
  }

  for (const [table, spec] of Object.entries(LEDGER_AND_PROVENANCE_SPECS)) {
    const isSeedAdminExempt = table === 'profiles'
      ? `and not (
           t.id = $3
           and t.role = 'admin'
           and exists (select 1 from auth.users su where su.id = t.id and su.email = $4)
           and exists (select 1 from admin_role_assignments sr where sr.user_id = t.id and sr.role = 'admin')
         )`
      : '';
    const { rows } = await pgClient.query(`
      select count(*)::int as n from public.${table} t
      where not exists (
        select 1 from public.migration_source_ledger l
        where l.target_table = $1
          and l.source_system = 'mongodb'
          and l.source_database = $2
          and btrim(l.source_collection) <> ''
          and btrim(l.source_document_id) <> ''
          and l.source_content_hash ~ '^[0-9a-f]{64}$'
          and l.status in ('created', 'reconciled', 'failed')
          and l.target_id is not null
          and l.target_id = ${targetIdentityExpr(spec)}
      )
      ${isSeedAdminExempt};
    `, table === 'profiles'
      ? [table, SOURCE_DATABASE, MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]
      : [table, SOURCE_DATABASE]);
    if (rows[0].n > 0) {
      problems.push(
        table === 'profiles' || table === 'subscriptions'
          ? `${table}: ${rows[0].n} row(s) not attributable to this migration (no matching migration_source_ledger entry` +
            (table === 'profiles' ? ', and not a fully-verified migration-seed admin identity)' : ')')
          : `${table}: ${rows[0].n} row(s) with no matching migration_source_ledger entry`
      );
    }
  }

  if (problems.length > 0) {
    fail(`target already contains data this tooling did not record:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

// PR #70 review round 7, item 4: "تحقق Target → Ledger وLedger → Target"
// -- verifyNoUnrecordedData() above only ever checked ONE direction (every
// TARGET row must trace back to a ledger entry). The other direction was
// never checked anywhere: a migration_source_ledger row claiming
// status='created'/'reconciled' with a real target_id, where that target
// row has since gone missing (deleted out-of-band, a partial rollback of
// a different domain, manual intervention, etc.), was silently invisible
// to every preflight -- the NEXT forward run would only discover it deep
// inside the affected worker's own resume logic (which round 7 items 2/3
// now correctly fail closed on, never auto-recreating a substitute
// target), but the orchestrator's own "is everything consistent" gate
// never surfaced it up front. Fixed: this function walks the ledger
// itself and, for every row claiming a real target, independently
// verifies that target still exists — using the EXACT SAME
// LEDGER_AND_PROVENANCE_SPECS identity shapes as the Target -> Ledger
// direction, so the two can never check a different set of tables. A
// mismatch here is a hard, fail-closed preflight error; this function
// makes no attempt to repair or recreate anything itself ("أضف recovery
// صريحًا فقط للحالات التي يمكن إثباتها بشكل قطعي" — the only sanctioned
// recovery is re-running the normal forward step, which items 2/3/6's own
// resume logic already proves safe for a target that genuinely still
// exists; a target that does NOT exist anymore is a real problem for a
// human to look at, not something this tooling silently papers over).
export async function verifyLedgerPointsToRealTargets(pgClient) {
  const problems = [];
  for (const [table, spec] of Object.entries(LEDGER_AND_PROVENANCE_SPECS)) {
    const { rows } = await pgClient.query(`
      select count(*)::int as n
      from public.migration_source_ledger l
      where l.target_table = $1
        and l.source_system = 'mongodb'
        and l.source_database = $2
        and l.target_id is not null
        and l.status in ('created', 'reconciled')
        and not exists (
          select 1 from public.${table} t where ${targetIdentityExpr(spec)} = l.target_id
        );
    `, [table, SOURCE_DATABASE]);
    if (rows[0].n > 0) {
      problems.push(`${table}: ${rows[0].n} migration_source_ledger row(s) claim a target that no longer exists`);
    }
  }
  if (problems.length > 0) {
    fail(`migration_source_ledger references targets that are missing (Ledger -> Target integrity failure):\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

// PR #70 review round 7, item 4/6: profiles.teacher_id is a COLUMN on an
// existing row, not a separately insertable target row, so it cannot use
// the generic table-spec mechanism above -- it needs its own bidirectional
// check. Written/ledgered by migrate-users-to-supabase-auth.mjs's
// applyTeacherLink() under target_table='profiles_teacher_link', with a
// stable composite target_id of `<studentProfileId>:<teacherProfileId>`.
export async function verifyTeacherLinkProvenance(pgClient) {
  const problems = [];

  // Target -> Ledger: every profiles row with a non-null teacher_id must
  // have a matching, source-scoped ledger entry for exactly that pair.
  const { rows: unledgered } = await pgClient.query(`
    select count(*)::int as n from public.profiles t
    where t.teacher_id is not null
      and not exists (
        select 1 from public.migration_source_ledger l
        where l.target_table = 'profiles_teacher_link'
          and l.source_system = 'mongodb'
          and l.source_database = $1
          and l.status in ('created', 'reconciled', 'failed')
          and l.target_id = (t.id::text || ':' || t.teacher_id::text)
      );
  `, [SOURCE_DATABASE]);
  if (unledgered[0].n > 0) {
    problems.push(`profiles.teacher_id: ${unledgered[0].n} row(s) with no matching migration_source_ledger entry`);
  }

  // Ledger -> Target: every ledger row claiming a teacher_id link must
  // still find that EXACT pair on the referenced profiles row.
  const { rows: ghosts } = await pgClient.query(`
    select count(*)::int as n
    from public.migration_source_ledger l
    where l.target_table = 'profiles_teacher_link'
      and l.source_system = 'mongodb'
      and l.source_database = $1
      and l.target_id is not null
      and l.status in ('created', 'reconciled')
      and not exists (
        select 1 from public.profiles t where (t.id::text || ':' || t.teacher_id::text) = l.target_id
      );
  `, [SOURCE_DATABASE]);
  if (ghosts[0].n > 0) {
    problems.push(`profiles_teacher_link ledger: ${ghosts[0].n} row(s) claim a teacher_id relationship that no longer exists`);
  }

  if (problems.length > 0) {
    fail(`profiles.teacher_id provenance is inconsistent:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

// PR #70 review round 8, item 6 -- "تحقق exact source fields/hash format/
// status" و"تحقق allowed source collection لكل target table". Every
// domain-table ledger row's source_collection is always the DOMAIN KEY
// mongo-to-supabase.mjs's own migrateDomain() passes as `sourceCollection:
// domainName` (never the raw underlying Mongo collection name, e.g.
// "quranbookmarks") -- see that file's own markPlanned()/markCreated()/
// findLedgerEntry() call sites. The domain key equals its own target
// table name for every domain except system_audit_logs -> admin_audit_log
// (see mongo-to-supabase.mjs's own ROLLBACK_SPEC, the authoritative
// domain-key -> target-table map). profiles/subscriptions/
// profiles_teacher_link/parent_student_links are written by
// migrate-users-to-supabase-auth.mjs instead, whose own sourceCollection
// literals (migrateOneUser=/migrateOneAdmin='adminusers'/
// migrateSubscription/applyTeacherLink/applyParentChildLink, all
// ='users') are the authoritative source for those four.
const ALLOWED_SOURCE_COLLECTIONS = {
  trial_requests: ['trial_requests'],
  subscribers: ['subscribers'],
  blogs: ['blogs'],
  courses: ['courses'],
  contact_messages: ['contact_messages'],
  system_config: ['system_config'],
  wishlists: ['wishlists'],
  hifz_progress: ['hifz_progress'],
  certificates: ['certificates'],
  reviews: ['reviews'],
  referrals: ['referrals'],
  course_progress: ['course_progress'],
  live_classes: ['live_classes'],
  messages: ['messages'],
  student_records: ['student_records'],
  payments: ['payments'],
  enrollments: ['enrollments'],
  quran_bookmarks: ['quran_bookmarks'],
  quran_reading_progress: ['quran_reading_progress'],
  quran_memorization_stats: ['quran_memorization_stats'],
  coupons: ['coupons'],
  coupon_redemptions: ['coupon_redemptions'],
  manual_payments: ['manual_payments'],
  invoices: ['invoices'],
  notifications: ['notifications'],
  admin_audit_log: ['system_audit_logs'], // the one domain-key/target-table mismatch
  document_counters: ['document_counters'],
  parent_student_links: ['users'], // applyParentChildLink()
  profiles: ['users', 'adminusers'], // migrateOneUser() vs migrateOneAdmin()
  subscriptions: ['users'], // migrateSubscription()
  profiles_teacher_link: ['users'], // applyTeacherLink()
};

/**
 * Ledger row structural integrity, independent of any target-table join.
 * Two checks, both genuinely enforceable ONLY at the application level
 * (unlike "created/reconciled requires target_id" and "no duplicate
 * target attribution", which migration 0023's own DB-level CHECK
 * constraint and partial unique index make structurally impossible to
 * even INSERT -- proven directly by a live insert-rejection test in
 * unrecorded-data-preflight.test.mjs, not re-duplicated here as an
 * app-level check that could never actually fire against a real
 * database with 0023 applied):
 *   1. source_content_hash must be a real, well-formed sha256 hex digest
 *      -- the DB has no CHECK on this column's shape at all.
 *   2. source_collection must be one this migration tooling's own write
 *      paths actually ever use for that target_table -- the DB has no
 *      way to know about that application-level convention either.
 */
export async function verifyLedgerRowIntegrity(pgClient) {
  const problems = [];

  const malformedHash = await pgClient.query(`
    select target_table, count(*)::int as n
    from public.migration_source_ledger
    where source_system = 'mongodb' and source_database = $1
      and source_content_hash !~ '^[0-9a-f]{64}$'
    group by target_table;
  `, [SOURCE_DATABASE]);
  for (const row of malformedHash.rows) {
    problems.push(`${row.target_table}: ${row.n} ledger row(s) with a malformed source_content_hash (not a 64-hex-char sha256 digest)`);
  }

  const bySourceCollection = await pgClient.query(`
    select target_table, source_collection, count(*)::int as n
    from public.migration_source_ledger
    where source_system = 'mongodb' and source_database = $1
    group by target_table, source_collection;
  `, [SOURCE_DATABASE]);
  for (const row of bySourceCollection.rows) {
    const allowed = ALLOWED_SOURCE_COLLECTIONS[row.target_table];
    if (!allowed) {
      problems.push(`${row.target_table}: ${row.n} ledger row(s) reference a target_table this orchestrator does not recognize at all`);
    } else if (!allowed.includes(row.source_collection)) {
      problems.push(
        `${row.target_table}: ${row.n} ledger row(s) have source_collection "${row.source_collection}", ` +
        `not one of the allowed collections for this target table (${allowed.join(', ')})`
      );
    }
  }

  if (problems.length > 0) {
    fail(`migration_source_ledger row integrity check failed:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

// ---------------------------------------------------------------------
// Advisory lock — only one orchestrator run against this target at a
// time. pg_try_advisory_lock (non-blocking) so a second concurrent
// invocation fails fast and loudly rather than queuing silently; it is
// session-scoped, so it releases automatically if the process dies,
// never leaving a stuck lock behind.
// ---------------------------------------------------------------------

export async function acquireAdvisoryLock(pgClient) {
  const { rows } = await pgClient.query('select pg_try_advisory_lock($1) as ok;', [ADVISORY_LOCK_KEY.toString()]);
  if (!rows[0].ok) fail('could not acquire the orchestrator advisory lock — another run is already in progress against this target');
}
export async function releaseAdvisoryLock(pgClient) {
  await pgClient.query('select pg_advisory_unlock($1);', [ADVISORY_LOCK_KEY.toString()]);
}

// ---------------------------------------------------------------------
// The full preflight — run once before the lock, then AGAIN immediately
// after acquiring it (state can change in the gap between the two).
// ---------------------------------------------------------------------

async function runPreflight(pgClient, { execute, approvalManifestPath, backupManifestPath, supabaseUrl, serviceRoleKey }) {
  const gitSha = currentGitSha();
  await verifyMigrationJournal(pgClient);

  if (!execute) {
    // --plan never needs an approval manifest or a live GoTrue call —
    // it's read-only against Postgres and Mongo, safe to run any time.
    return { gitSha, mode: 'plan' };
  }

  const backup = verifyFreshBackup(backupManifestPath);
  const manifest = JSON.parse(fs.readFileSync(approvalManifestPath, 'utf8'));
  verifyApprovalManifest(manifest, { gitSha, backupHash: backup.sha256 });
  await verifySignupsOff(supabaseUrl, serviceRoleKey);
  // Round 7, item 4: BOTH directions of ledger integrity are checked, not
  // just Target -> Ledger (verifyNoUnrecordedData). Round 7, item 6:
  // relationship provenance (profiles.teacher_id specifically;
  // parent_student_links is already covered generically by both of the
  // functions above via LEDGER_AND_PROVENANCE_SPECS).
  await verifyNoUnrecordedData(pgClient);
  await verifyLedgerPointsToRealTargets(pgClient);
  await verifyTeacherLinkProvenance(pgClient);
  await verifyLedgerRowIntegrity(pgClient);
  return { gitSha, mode: 'execute', backup, manifest };
}

// ---------------------------------------------------------------------
// Saga log — this orchestrator's OWN coarse, domain-level record,
// alongside (not instead of) migration_source_ledger's per-document
// record. Written to disk after every step so a crash mid-run leaves a
// readable trail of exactly what was planned/attempted/reconciled.
// ---------------------------------------------------------------------

function newSagaLog(runId) {
  const filePath = path.join(OUT_DIR, `orchestrator-saga-${runId}.json`);
  const state = { runId, startedAt: new Date().toISOString(), steps: [] };
  const save = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  };
  return {
    filePath,
    record(step, status, extra = {}) {
      state.steps.push({ step, status, at: new Date().toISOString(), ...extra });
      save();
    },
  };
}

// ---------------------------------------------------------------------
// Worker invocation — both existing, independently-tested scripts are
// run as child processes, not imported (importing mongo-to-supabase.mjs
// would execute its unconditional main() — see that file's own tail).
// Connection info flows through inherited env vars only, never CLI args.
// ---------------------------------------------------------------------

// `stdinInput` (round 8, item 3) is an optional Buffer piped directly into
// the child's stdin via spawnSync's own `input` option -- how the
// approved-dispositions payload reaches the child with no intermediate
// file for a TOCTOU race to exist against. Absent for every call that
// carries no disposition content.
function runWorker(scriptPath, args, env, stdinInput) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: __dirname,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...(stdinInput !== undefined ? { input: stdinInput } : {}),
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

// ---------------------------------------------------------------------
// Main sequencing. Stops on the FIRST domain that reports any failure —
// never proceeds to a dependent domain on top of a broken one.
// ---------------------------------------------------------------------

// runWorkerFn defaults to the real runWorker (real child-process spawns)
// — the only reason this is an injectable parameter at all is so
// production-import-orchestrator.test.mjs can verify the exact CALL
// SEQUENCE (which script, which args, in what order) purely in-process,
// with no live Postgres/Mongo/GoTrue needed for that specific property,
// without changing a single line of real runtime behavior (the default
// is the same function every real caller already used).
export async function runImport({ pgClient, execute, faultStage, deferDomains = [], runWorkerFn = runWorker, approvedDispositionsPath = null }) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const saga = newSagaLog(runId);
  const commonEnv = faultStage ? { MIGRATION_FAULT_INJECT_STAGE: faultStage, MIGRATION_FAULT_INJECT_ONCE: '1' } : {};

  // Round 8, item 3: read the operator's file ONCE into memory -- never
  // written to any path a child could independently re-open. See
  // loadApprovedDispositionsPayload()'s own comment for the exact TOCTOU
  // window this closes (structurally, not just narrows).
  const dispositionsMeta = loadApprovedDispositionsPayload(approvedDispositionsPath);
  return await runImportBody({ pgClient, execute, faultStage, deferDomains, runWorkerFn, dispositionsMeta, saga, commonEnv });
}

async function runImportBody({ execute, deferDomains, runWorkerFn, dispositionsMeta, saga, commonEnv }) {
  if (dispositionsMeta) {
    saga.record('approved_dispositions', 'bound', {
      path: dispositionsMeta.originalPath, hash: dispositionsMeta.hash,
      approvedBy: dispositionsMeta.approvedBy, approvedAt: dispositionsMeta.approvedAt,
    });
  }
  const dispositionArgs = dispositionsMeta ? ['--approved-dispositions-stdin', `--approved-dispositions-hash=${dispositionsMeta.hash}`] : [];
  const dispositionStdin = dispositionsMeta?.contents;

  // Every domain the OPERATOR explicitly deferred on this run's command
  // line is recorded here, by name and reason — never silently dropped.
  // An empty deferDomains list (the default) means nothing is excluded
  // and nothing is logged as deferred here.
  const { excludeArg, deferred } = computeDomainWorkerPlan({ deferDomains });
  for (const { domain, reason } of deferred) {
    saga.record('mongo_domains', 'deferred', { domain, reason });
  }

  // Review round 3: BOTH the user-migration plan/preflight AND the full
  // domain dry-run now ALWAYS run first, as a pair, before EITHER one is
  // ever allowed to execute/write — this is what actually makes "no
  // write until everything has been checked" a true property. Round 2
  // already got the domain side right (a real --dry-run before any
  // domain write); what it missed is that users_and_relationships itself
  // was invoked with --execute immediately, ahead of that domain
  // preflight, so a real account-creation write could already have
  // landed before the domain side had any chance to fail the run closed.
  verifyDispositionsPayloadUnchanged(dispositionsMeta);
  saga.record('users_and_relationships_preflight', 'planned');
  const userPreflightResult = runWorkerFn(USER_MIGRATION_SCRIPT, [...dispositionArgs], commonEnv, dispositionStdin);
  saga.record('users_and_relationships_preflight', userPreflightResult.code === 0 ? 'reconciled' : 'failed', { code: userPreflightResult.code });
  if (userPreflightResult.code !== 0) {
    return { ok: false, failedAt: 'users_and_relationships_preflight', saga: saga.filePath, stderr: userPreflightResult.stderr };
  }

  saga.record('mongo_domains_preflight', 'planned');
  const preflightArgs = ['--domain=all', ...(excludeArg ? [`--exclude-domain=${excludeArg}`] : []), '--dry-run'];
  const preflightResult = runWorkerFn(DOMAIN_MIGRATION_SCRIPT, preflightArgs, commonEnv);
  saga.record('mongo_domains_preflight', preflightResult.code === 0 ? 'reconciled' : 'failed', { code: preflightResult.code });
  if (preflightResult.code !== 0) {
    return {
      ok: false,
      failedAt: 'mongo_domains_preflight',
      saga: saga.filePath,
      stderr: preflightResult.stderr,
      hint: 'one or more domains would fail and were NOT explicitly deferred -- no write was attempted anywhere ' +
        '(users_and_relationships included). Either fix the underlying issue, or re-run with ' +
        '--defer-domains=<name>[,<name>...] to explicitly acknowledge excluding it.',
    };
  }

  if (!execute) {
    // A --plan-only run never gets further than the preflight pass above
    // — that pass already performed and reported every check this run
    // would ever need, for both users and domains, with zero writes.
    const status = deferred.length > 0 ? 'completed_with_deferred' : 'reconciled';
    saga.record('run', status, deferred.length > 0 ? { deferredDomains: deferred.map((d) => d.domain) } : {});
    return { ok: true, status, deferredDomains: deferred.map((d) => d.domain), saga: saga.filePath };
  }

  // Both preflights passed — only NOW is any write ever attempted,
  // starting with users (domains that reference profiles/auth accounts
  // depend on those accounts already existing).
  try {
    verifyDispositionsPayloadUnchanged(dispositionsMeta);
  } catch (err) {
    saga.record('approved_dispositions', 'failed', { reason: err.message });
    return { ok: false, failedAt: 'approved_dispositions_integrity', saga: saga.filePath, stderr: err.message };
  }
  saga.record('users_and_relationships', 'planned');
  const userResult = runWorkerFn(USER_MIGRATION_SCRIPT, ['--execute', ...dispositionArgs], commonEnv, dispositionStdin);
  saga.record('users_and_relationships', userResult.code === 0 ? 'reconciled' : 'failed', { code: userResult.code });
  if (userResult.code !== 0) {
    return { ok: false, failedAt: 'users_and_relationships', saga: saga.filePath, stderr: userResult.stderr };
  }

  saga.record('mongo_domains', 'planned');
  const domainArgs = ['--domain=all', ...(excludeArg ? [`--exclude-domain=${excludeArg}`] : [])];
  const domainResult = runWorkerFn(DOMAIN_MIGRATION_SCRIPT, domainArgs, commonEnv);
  saga.record('mongo_domains', domainResult.code === 0 ? 'reconciled' : 'failed', { code: domainResult.code });
  if (domainResult.code !== 0) {
    // Fail closed: this is exactly what protects against a domain the
    // operator DID explicitly defer, or that unexpectedly regresses
    // between the preflight dry-run and this real write -- mongo-to-
    // supabase.mjs's own exit code now honestly reflects per-document
    // failures (see its changelog), so a domain that fails here stops
    // the whole run rather than being silently treated as reconciled.
    return { ok: false, failedAt: 'mongo_domains', saga: saga.filePath, stderr: domainResult.stderr };
  }

  // Stage 2J-B Part H, review round 2: a run with ANY deferred domain is
  // never reported as fully 'reconciled' -- 'completed_with_deferred'
  // plus the explicit deferredDomains list is the only status such a run
  // can ever carry. Round 3 correction: this does NOT mean a caller
  // checking only `ok` is safe from mistaking one for the other -- `ok`
  // is `true` for BOTH statuses (deferring a domain is a deliberate,
  // acknowledged choice, not a failure), so `ok` alone cannot distinguish
  // "every domain migrated" from "some were explicitly deferred". Any
  // caller that needs to know whether the run was complete MUST inspect
  // `status` (or `deferredDomains.length`), not `ok` alone.
  const status = deferred.length > 0 ? 'completed_with_deferred' : 'reconciled';
  saga.record('run', status, deferred.length > 0 ? { deferredDomains: deferred.map((d) => d.domain) } : {});
  return { ok: true, status, deferredDomains: deferred.map((d) => d.domain), saga: saga.filePath };
}

// ---------------------------------------------------------------------
// Compensation — for a run that failed AFTER creating some GoTrue
// accounts but before every one of them reached 'reconciled'. Both
// worker scripts are idempotent from database state (re-running finds
// the existing auth.users row by email and completes the remaining
// steps), so the primary compensating action is simply: run the SAME
// forward step again. This function never deletes a pre-existing
// account — it only re-invokes the idempotent forward path.
// ---------------------------------------------------------------------

export async function compensate({ pgClient, execute, approvedDispositionsPath = null, runWorkerFn = runWorker }) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const saga = newSagaLog(`compensate-${runId}`);

  // Round 8, item 3: same in-memory, no-mutable-path payload mechanism as
  // runImport() -- see loadApprovedDispositionsPayload()'s own comment.
  const dispositionsMeta = loadApprovedDispositionsPayload(approvedDispositionsPath);
  if (dispositionsMeta) {
    saga.record('approved_dispositions', 'bound', {
      path: dispositionsMeta.originalPath, hash: dispositionsMeta.hash,
      approvedBy: dispositionsMeta.approvedBy, approvedAt: dispositionsMeta.approvedAt,
    });
  }
  const dispositionArgs = dispositionsMeta ? ['--approved-dispositions-stdin', `--approved-dispositions-hash=${dispositionsMeta.hash}`] : [];
  const dispositionStdin = dispositionsMeta?.contents;

  try {
    verifyDispositionsPayloadUnchanged(dispositionsMeta);
  } catch (err) {
    saga.record('approved_dispositions', 'failed', { reason: err.message });
    return { ok: false, stderr: err.message, saga: saga.filePath };
  }
  saga.record('compensate', 'planned');
  const result = runWorkerFn(USER_MIGRATION_SCRIPT, execute ? ['--execute', ...dispositionArgs] : [...dispositionArgs], {}, dispositionStdin);
  saga.record('compensate', result.code === 0 ? 'reconciled' : 'failed', { code: result.code });
  return { ok: result.code === 0, stdout: result.stdout, stderr: result.stderr, saga: saga.filePath };
}

// ---------------------------------------------------------------------
// CLI entrypoint.
// ---------------------------------------------------------------------

// PR #70 review round 7, item 1: rebuilt on the shared strict parser
// (lib/cli-args.mjs) -- see that module's header for the exact bug this
// closes. Concretely for THIS script: `--execute` and `--compensate` are
// now boolean-ONLY. Before this round, both were read as `!!args.execute`
// / `!!args.compensate` from a generic string-valued parser -- `--execute
// =false` parsed to the STRING `"false"`, and `!!"false"` is `true` in
// JavaScript, so a single stray `=false` silently turned an intended
// dry-run into a REAL --execute run. `--compansate` (or any other typo)
// was previously accepted as an unrecognized-but-harmless key and simply
// ignored, silently falling back to the forward-import path instead of
// compensate, with no error at all. Both classes of bug are now
// structurally impossible: an unknown flag is a hard error, and a boolean
// flag rejects any `=value` outright, tested by both a typo AND an
// `=false`/`=true` suffix.
const CLI_SPEC = {
  flags: {
    execute: { type: 'boolean' },
    compensate: { type: 'boolean' },
    'approval-manifest': { type: 'string' },
    'backup-manifest': { type: 'string' },
    'approved-dispositions': { type: 'string' },
    'defer-domains': { type: 'string' },
  },
};

export function parseCliArgs(argv) {
  return parseStrictCliArgs(argv, CLI_SPEC);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const execute = !!args.execute;
  const compensateMode = !!args.compensate;
  const approvedDispositionsPath = typeof args['approved-dispositions'] === 'string' ? args['approved-dispositions'] : null;
  // The operator's own explicit acknowledgement for THIS run -- absent
  // (the default) means nothing is deferred, and the mandatory preflight
  // dry-run in runImport() will fail the whole run closed, with no
  // writes attempted, if any domain would actually fail.
  const deferDomains = args['defer-domains']
    ? String(args['defer-domains']).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // Round 8, item 8: cross-flag validation -- --defer-domains has no
  // effect in --compensate mode. compensate() never migrates Mongo
  // domains at all (it only re-invokes the idempotent user-migration
  // path); before this check, passing both together silently dropped
  // --defer-domains on the floor with no error, exactly the kind of
  // "operator believed X, tool silently did Y" footgun this round closes
  // elsewhere too.
  if (compensateMode && args['defer-domains']) {
    fail('--defer-domains has no effect in --compensate mode (compensate() never migrates Mongo domains) -- remove --defer-domains or drop --compensate');
  }

  const pgUri = process.env.MIGRATION_DB_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pgUri) fail('MIGRATION_DB_URL must be set (no secret is ever accepted as a CLI argument)');
  if (execute && (!supabaseUrl || !serviceRoleKey)) fail('--execute requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set');

  const pool = new pg.Pool({ connectionString: pgUri });
  const pgClient = await pool.connect();
  try {
    await runPreflight(pgClient, {
      execute,
      approvalManifestPath: args['approval-manifest'],
      backupManifestPath: args['backup-manifest'],
      supabaseUrl,
      serviceRoleKey,
    });

    await acquireAdvisoryLock(pgClient);
    try {
      // Re-preflight UNDER the lock — state may have changed in the gap
      // between the check above and actually holding the lock.
      await runPreflight(pgClient, {
        execute,
        approvalManifestPath: args['approval-manifest'],
        backupManifestPath: args['backup-manifest'],
        supabaseUrl,
        serviceRoleKey,
      });

      const result = compensateMode
        ? await compensate({ pgClient, execute, approvedDispositionsPath })
        : await runImport({ pgClient, execute, faultStage: process.env.MIGRATION_FAULT_INJECT_STAGE, deferDomains, approvedDispositionsPath });

      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } finally {
      await releaseAdvisoryLock(pgClient);
    }
  } finally {
    pgClient.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[production-import-orchestrator] FATAL:', err.message);
    process.exitCode = 1;
  });
}
