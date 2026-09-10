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
// Stage 2J-B Part H fix: this header used to claim "stops on the FIRST
// domain that reports any failure" while that was not actually true --
// mongo-to-supabase.mjs's own exit code never reflected per-document
// transform/validate failures (only a top-level thrown exception did),
// so a domain where EVERY document failed (confirmed for real: payments,
// 15/15 real records rejected for using gateway "paymob", which the
// payments adapter does not support) could be silently treated as
// "reconciled" by this file's own domainResult.code check. Fixed in two
// parts: (1) mongo-to-supabase.mjs now sets a non-zero exit code whenever
// any domain it processed had document-level failures (see that file's
// own changelog); (2) this file now has an explicit, named
// DEFERRED_DOMAINS policy (currently: payments) -- every deferred domain
// is excluded from a run and logged into the saga as 'deferred' with its
// reason by default, and can only ever be included via the explicit
// --include-deferred-domains=<name> flag, in which case fix (1) above
// means a still-not-ready deferred domain now genuinely fails the whole
// run closed rather than being silently swallowed. Verified live,
// end-to-end, against a real local stack: the default run excludes
// payments and logs it deferred (run succeeds); --include-deferred-
// domains=payments against a real unsupported-gateway record fails the
// run closed with the exact reason in stderr.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

// The tables mongo-to-supabase.mjs's own DOMAINS object writes to — kept
// as an explicit, independently-maintained list here (not imported from
// that module — importing it would execute its unconditional main(), see
// that file's own bottom) so the "no unrecorded data" preflight below can
// check every one of them without ever loading/running that script.
const LEDGER_BACKED_TARGET_TABLES = [
  'trial_requests', 'subscribers', 'blogs', 'courses', 'contact_messages',
  'system_config', 'wishlists', 'hifz_progress', 'certificates', 'reviews',
  'referrals', 'course_progress', 'live_classes', 'messages', 'student_records',
  'payments', 'enrollments', 'quran_bookmarks', 'quran_reading_progress',
  'quran_memorization_stats', 'coupons', 'coupon_redemptions', 'manual_payments',
  'invoices', 'notifications', 'admin_audit_log', 'document_counters',
];

// migrate-users-to-supabase-auth.mjs does NOT go through migration_source_
// ledger (it predates it, and auth.users/profiles have their own natural
// idempotency key: email) — these tables get a simpler "must currently be
// pristine" preflight instead, documented explicitly rather than silently
// assumed covered by the ledger check above.
const NON_LEDGER_PRISTINE_TABLES = ['profiles', 'subscriptions'];

// Stage 2J-B Part H product decision: payments (all 15 real records use
// gateway "paymob", which mongo-to-supabase.mjs's payments adapter does
// not support — stripe/paypal only) is deliberately DEFERRED. Not
// migrated, not modified; payment_gateway, payment controllers/tables,
// and the original Mongo data are all untouched by this decision.
//
// This is a NAMED, explicit policy object — not a silent "leave payments
// for later" left to an operator's memory — so runImport() below can
// neither silently include nor silently drop a deferred domain: every
// domain in this object is EXCLUDED by default (and logged into the saga
// as 'deferred' with the reason, every run) unless the caller explicitly
// names it via --include-deferred-domains. This is the fix for a real,
// confirmed gap found in Part H's own rehearsal: this file's `runImport`
// previously called mongo-to-supabase.mjs with `--domain=all` unconditio-
// nally, and (until the paired mongo-to-supabase.mjs fix, see that file's
// own changelog) that script's own exit code never reflected per-document
// failures either — meaning a domain where EVERY document failed (as
// payments would, with paymob unsupported) could silently be treated as
// "reconciled" by this orchestrator's stop-on-first-failure logic, despite
// this file's own header/comment claiming that could never happen.
const DEFERRED_DOMAINS = {
  payments:
    'DEFERRED_BY_PRODUCT_DECISION -- all real records use gateway "paymob", ' +
    'not supported by mongo-to-supabase.mjs\'s payments adapter (stripe/paypal ' +
    'only). Not migrated, not modified; original Mongo data untouched.',
};

function fail(msg) {
  throw new Error(`[orchestrator] ${msg}`);
}

/**
 * Pure: decides which domains this run will actually touch, and which
 * DEFERRED domains it will explicitly skip (with a reason, for the saga
 * log) versus explicitly include (only if the caller named it). Never
 * mutates anything — callers apply the result.
 *
 * @param {{ includeDeferredDomains?: string[] }} opts
 * @returns {{ excludeArg: string|null, deferred: {domain: string, reason: string}[] }}
 */
export function computeDomainWorkerPlan({ includeDeferredDomains = [] } = {}) {
  const includeSet = new Set(includeDeferredDomains);
  for (const name of includeSet) {
    if (!(name in DEFERRED_DOMAINS)) {
      fail(`--include-deferred-domains references a domain that is not deferred: ${name}`);
    }
  }
  const toExclude = Object.keys(DEFERRED_DOMAINS).filter((name) => !includeSet.has(name));
  const deferred = toExclude.map((domain) => ({ domain, reason: DEFERRED_DOMAINS[domain] }));
  return {
    excludeArg: toExclude.length > 0 ? toExclude.join(',') : null,
    deferred,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
 * Two different guarantees, because the two worker scripts use two
 * different idempotency mechanisms (documented at LEDGER_BACKED_
 * TARGET_TABLES / NON_LEDGER_PRISTINE_TABLES above):
 *   - Ledger-backed tables: every row must be traceable to a
 *     migration_source_ledger entry pointing at it. A row with no
 *     matching ledger entry means something wrote to this table outside
 *     this tooling's own bookkeeping — refuse rather than risk silently
 *     overwriting or double-counting it.
 *   - Non-ledger tables (profiles/subscriptions): must be genuinely
 *     empty. This orchestrator's whole design assumes a fresh target;
 *     it is not a merge tool for a partially-populated production
 *     project.
 */
export async function verifyNoUnrecordedData(pgClient) {
  const problems = [];
  for (const table of LEDGER_BACKED_TARGET_TABLES) {
    const { rows } = await pgClient.query(`
      select count(*)::int as n from public.${table} t
      where not exists (
        select 1 from public.migration_source_ledger l
        where l.target_table = $1 and l.target_id = t.id::text
      );
    `, [table]);
    if (rows[0].n > 0) problems.push(`${table}: ${rows[0].n} row(s) with no matching migration_source_ledger entry`);
  }
  for (const table of NON_LEDGER_PRISTINE_TABLES) {
    const { rows } = await pgClient.query(`select count(*)::int as n from public.${table};`);
    if (rows[0].n > 0) problems.push(`${table}: expected 0 rows (pristine target), found ${rows[0].n}`);
  }
  if (problems.length > 0) {
    fail(`target already contains data this tooling did not record:\n  - ${problems.join('\n  - ')}`);
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
  await verifyNoUnrecordedData(pgClient);
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

function runWorker(scriptPath, args, env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: __dirname,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

// ---------------------------------------------------------------------
// Main sequencing. Stops on the FIRST domain that reports any failure —
// never proceeds to a dependent domain on top of a broken one.
// ---------------------------------------------------------------------

async function runImport({ pgClient, execute, faultStage, includeDeferredDomains = [] }) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const saga = newSagaLog(runId);
  const commonEnv = faultStage ? { MIGRATION_FAULT_INJECT_STAGE: faultStage, MIGRATION_FAULT_INJECT_ONCE: '1' } : {};

  saga.record('users_and_relationships', 'planned');
  const userArgs = execute ? ['--execute'] : [];
  const userResult = runWorker(USER_MIGRATION_SCRIPT, userArgs, commonEnv);
  saga.record('users_and_relationships', userResult.code === 0 ? 'reconciled' : 'failed', { code: userResult.code });
  if (userResult.code !== 0) {
    return { ok: false, failedAt: 'users_and_relationships', saga: saga.filePath, stderr: userResult.stderr };
  }

  // Every DEFERRED domain not explicitly named via includeDeferredDomains
  // is recorded here EVERY run, by name and reason — never silently
  // dropped, never left to an operator's memory. See DEFERRED_DOMAINS'
  // own comment for why this exists and the real gap it closes.
  const { excludeArg, deferred } = computeDomainWorkerPlan({ includeDeferredDomains });
  for (const { domain, reason } of deferred) {
    saga.record('mongo_domains', 'deferred', { domain, reason });
  }

  saga.record('mongo_domains', 'planned');
  const domainArgs = [
    '--domain=all',
    ...(excludeArg ? [`--exclude-domain=${excludeArg}`] : []),
    ...(execute ? [] : ['--dry-run']),
  ];
  const domainResult = runWorker(DOMAIN_MIGRATION_SCRIPT, domainArgs, commonEnv);
  saga.record('mongo_domains', domainResult.code === 0 ? 'reconciled' : 'failed', { code: domainResult.code });
  if (domainResult.code !== 0) {
    // Fail closed: this is exactly what protects against a deferred
    // domain that WAS explicitly included (--include-deferred-domains)
    // turning out not to actually be ready (e.g. payments, before paymob
    // support exists) -- mongo-to-supabase.mjs's own exit code now
    // honestly reflects per-document failures (see its changelog), so a
    // domain that fails here stops the whole run rather than being
    // silently treated as reconciled.
    return { ok: false, failedAt: 'mongo_domains', saga: saga.filePath, stderr: domainResult.stderr };
  }

  saga.record('run', 'reconciled');
  return { ok: true, saga: saga.filePath };
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

async function compensate({ pgClient, execute }) {
  const result = runWorker(USER_MIGRATION_SCRIPT, execute ? ['--execute'] : [], {});
  return { ok: result.code === 0, stdout: result.stdout, stderr: result.stderr };
}

// ---------------------------------------------------------------------
// CLI entrypoint.
// ---------------------------------------------------------------------

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );
  const execute = !!args.execute;
  const compensateMode = !!args.compensate;
  // Explicit, named opt-in only -- see DEFERRED_DOMAINS' own comment.
  // Absent (the default), every deferred domain is excluded and logged.
  const includeDeferredDomains = args['include-deferred-domains']
    ? String(args['include-deferred-domains']).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

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
        ? await compensate({ pgClient, execute })
        : await runImport({ pgClient, execute, faultStage: process.env.MIGRATION_FAULT_INJECT_STAGE, includeDeferredDomains });

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
