#!/usr/bin/env node
// Stage 2J-B Part H, review round 2 -- integration tests for the two
// correctness fixes found in mongo-to-supabase.mjs's own local rehearsal
// (ledger-resume tightening, rollback atomicity), against REAL disposable
// Docker Mongo + Postgres containers -- no mocks, no real dump, no real
// credentials, never touches Atlas/real Mongo/the real Supabase project.
//
// Self-contained: spins up its own uniquely-named local mongo:7 +
// postgres:17 containers on Docker-assigned free ports, applies schema via
// lib/db/test/run-migrations.mjs (the local-auth-stub variant -- the
// `trial_requests` domain this file exercises needs no real GoTrue/RLS),
// runs every scenario against the `trial_requests` domain (plain table,
// no user/plan dependency, `id`-keyed, no natural dedup key -- exactly the
// shape that made the duplicate-row risk in kill-window 2 real), tears
// down and verifies cleanup at the end. Safe to run any number of times.
//
// Every scenario drives mongo-to-supabase.mjs ONLY via child-process CLI
// invocation (never imported directly) -- that file's own bottom runs its
// main() unconditionally on import, exactly like production-import-
// orchestrator.mjs's header already documents for the same file.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MONGO_TO_SUPABASE = path.join(__dirname, 'mongo-to-supabase.mjs');
const CHECKPOINT_FILE = path.join(__dirname, '.checkpoints', 'trial_requests.json');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const MONGO_NAME = `stage2jb-h-resumetest-mongo-${SUFFIX}`;
const PG_NAME = `stage2jb-h-resumetest-pg-${SUFFIX}`;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startDisposableMongo() {
  const run = await runCommand('docker', ['run', '--rm', '-d', '--name', MONGO_NAME, '-p', '127.0.0.1::27017', 'mongo:7']);
  if (run.code !== 0) throw new Error(`docker run (mongo) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', MONGO_NAME, '27017/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover Mongo host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', MONGO_NAME, 'mongosh', '--quiet', '--eval', "print('ready')"]);
    if (check.code === 0 && check.stdout.includes('ready')) return port;
    await sleep(1000);
  }
  throw new Error('Mongo did not become ready in time');
}

async function startDisposablePostgres() {
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', PG_NAME, '-e', 'POSTGRES_PASSWORD=postgres', '-p', '127.0.0.1::5432', 'postgres:17',
  ]);
  if (run.code !== 0) throw new Error(`docker run (postgres) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', PG_NAME, '5432/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover Postgres host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres']);
    if (check.code === 0) return port;
    await sleep(500);
  }
  throw new Error('Postgres did not become ready in time');
}

function runMigrateCLI(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [MONGO_TO_SUPABASE, ...args], {
    cwd: __dirname,
    env: { ...process.env, MIGRATION_MONGO_URI: global.MONGO_URI, MIGRATION_DB_URL: global.PG_URI, ...extraEnv },
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function deleteLocalCheckpoint() {
  fs.rmSync(CHECKPOINT_FILE, { force: true });
}

function readLocalCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return {};
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}

async function insertTrialRequest(pgPool_unused, seq) {
  const doc = { name: `Test ${seq}`, email: `test${seq}@example.invalid`, status: 'new' };
  const res = await mongoose.connection.collection('trialrequests').insertOne(doc);
  return String(res.insertedId);
}

async function main() {
  console.log('=== SETUP: disposable Mongo + Postgres, schema applied ===');
  const mongoPort = await startDisposableMongo();
  const pgPort = await startDisposablePostgres();
  global.MONGO_URI = `mongodb://127.0.0.1:${mongoPort}/al-rahma`;
  global.PG_URI = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;

  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], {
    env: { ...process.env, TEST_DATABASE_URL: global.PG_URI },
  });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
  console.log('schema applied.');

  await mongoose.connect(global.MONGO_URI);
  const pgPool = new pg.Pool({ connectionString: global.PG_URI });

  async function ledgerRow(sourceId) {
    const r = await pgPool.query(
      `SELECT status, target_id, source_content_hash FROM migration_source_ledger
       WHERE source_collection='trial_requests' AND source_document_id=$1`,
      [sourceId]
    );
    return r.rows[0] ?? null;
  }
  async function targetRowCount(id) {
    if (!id) return 0;
    const r = await pgPool.query('SELECT count(*) FROM trial_requests WHERE id=$1', [id]);
    return Number(r.rows[0].count);
  }
  async function totalTargetRows() {
    const r = await pgPool.query('SELECT count(*) FROM trial_requests');
    return Number(r.rows[0].count);
  }
  async function resetAll() {
    await pgPool.query('TRUNCATE trial_requests, migration_source_ledger RESTART IDENTITY CASCADE');
    deleteLocalCheckpoint();
    await mongoose.connection.collection('trialrequests').deleteMany({});
  }

  // =====================================================================
  // Item 1: ledger-resume tightening + 3 kill-window tests, each repeated
  // after deleting the local checkpoint.
  // =====================================================================

  await test('baseline: a normal forward migration reaches status=reconciled and is correctly skipped on re-run', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);
    const r1 = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(r1.code, 0, r1.stderr);
    assert.match(r1.stdout, /imported=1/);
    const row = await ledgerRow(sourceId);
    assert.equal(row.status, 'reconciled');
    assert.equal(await totalTargetRows(), 1);

    const r2 = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(r2.code, 0, r2.stderr);
    assert.match(r2.stdout, /unchanged=1/, 'expected the unchanged re-run to actually skip');
    assert.equal(await totalTargetRows(), 1, 'must still be exactly 1 row, not a duplicate');
  });

  for (const repeatAfterCheckpointLoss of [false, true]) {
    const label = repeatAfterCheckpointLoss ? '(local checkpoint deleted before resume)' : '(local checkpoint intact)';

    await test(`kill-window 1: crash after markPlanned, before any target write ${label}`, async () => {
      await resetAll();
      const sourceId = await insertTrialRequest(pgPool, 1);

      const faulted = runMigrateCLI(['--domain=trial_requests'], {
        MIGRATION_FAULT_INJECT_STAGE: 'after_ledger_planned_before_target_write',
      });
      assert.equal(faulted.code, 1, 'the faulted run itself must report a failure');
      assert.match(faulted.stdout, /failed=1/);

      const rowAfterFault = await ledgerRow(sourceId);
      assert.ok(rowAfterFault, 'markPlanned must have committed its ledger row');
      assert.notEqual(rowAfterFault.status, 'reconciled');
      assert.equal(rowAfterFault.target_id, null, 'no target write ever happened');
      assert.equal(await totalTargetRows(), 0, 'the target table must still be empty');

      if (repeatAfterCheckpointLoss) deleteLocalCheckpoint();

      const resumed = runMigrateCLI(['--domain=trial_requests']);
      assert.equal(resumed.code, 0, resumed.stderr);
      assert.match(resumed.stdout, /imported=1/, 'a planned-only entry must never be treated as unchanged');
      assert.equal(await totalTargetRows(), 1, 'resume must create exactly one row, not zero and not a duplicate');
      const finalRow = await ledgerRow(sourceId);
      assert.equal(finalRow.status, 'reconciled');
    });

    await test(`kill-window 2: crash between the target write and markCreated (now one transaction) ${label}`, async () => {
      await resetAll();
      const sourceId = await insertTrialRequest(pgPool, 1);

      const faulted = runMigrateCLI(['--domain=trial_requests'], {
        MIGRATION_FAULT_INJECT_STAGE: 'after_target_write_before_marked_created',
      });
      assert.equal(faulted.code, 1);
      assert.match(faulted.stdout, /failed=1/);

      // The whole point of the fix: the target write itself must have
      // rolled back along with markCreated -- proving genuine atomicity,
      // not merely "resume happens to still work".
      assert.equal(await totalTargetRows(), 0, 'CRITICAL: the target write was not rolled back with markCreated -- an orphan row exists');
      const rowAfterFault = await ledgerRow(sourceId);
      assert.notEqual(rowAfterFault.status, 'reconciled');
      assert.equal(rowAfterFault.target_id, null);

      if (repeatAfterCheckpointLoss) deleteLocalCheckpoint();

      const resumed = runMigrateCLI(['--domain=trial_requests']);
      assert.equal(resumed.code, 0, resumed.stderr);
      assert.equal(await totalTargetRows(), 1, 'resume must produce exactly one row -- a duplicate here means the atomicity fix regressed');
      const finalRow = await ledgerRow(sourceId);
      assert.equal(finalRow.status, 'reconciled');
    });

    await test(`kill-window 3: crash after markCreated, before markReconciled ${label}`, async () => {
      await resetAll();
      const sourceId = await insertTrialRequest(pgPool, 1);

      const faulted = runMigrateCLI(['--domain=trial_requests'], {
        MIGRATION_FAULT_INJECT_STAGE: 'after_marked_created_before_reconciled',
      });
      assert.equal(faulted.code, 1);

      const rowAfterFault = await ledgerRow(sourceId);
      // markCreated committed (inside the transactional block above)
      // before this fault fired, so target_id IS set and the row DOES
      // exist -- but the fault itself, caught by the outer per-document
      // catch, always calls markFailed() (documenting the failure
      // reason), which overwrites status to 'failed'. That's correct,
      // intentional behavior, not a bug: what actually matters for
      // resume-safety is that status is NOT 'reconciled' (never skipped)
      // while target_id/the row itself genuinely still exist (must be
      // REUSED on resume, never re-inserted) -- both checked below.
      assert.notEqual(rowAfterFault.status, 'reconciled');
      assert.ok(rowAfterFault.target_id, 'the target row must exist at this point (markCreated committed before the fault)');
      assert.equal(await totalTargetRows(), 1, 'exactly one row must exist -- written once, not yet reconciled');

      if (repeatAfterCheckpointLoss) deleteLocalCheckpoint();

      const resumed = runMigrateCLI(['--domain=trial_requests']);
      assert.equal(resumed.code, 0, resumed.stderr);
      assert.equal(await totalTargetRows(), 1, 'resume must reuse the existing row (UPDATE), never insert a second one');
      const finalRow = await ledgerRow(sourceId);
      assert.equal(finalRow.status, 'reconciled');
      assert.equal(finalRow.target_id, rowAfterFault.target_id, 'must be the SAME row, not a new one');
    });
  }

  await test('a reconciled entry whose target row was deleted out-of-band is never blindly trusted as unchanged', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);
    const r1 = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(r1.code, 0, r1.stderr);
    const row1 = await ledgerRow(sourceId);
    assert.equal(row1.status, 'reconciled');

    // Simulate the row vanishing without this tool's own rollback path
    // (e.g. a manual DBA action) -- the ledger still says 'reconciled'.
    await pgPool.query('DELETE FROM trial_requests WHERE id=$1', [row1.target_id]);
    deleteLocalCheckpoint();

    const r2 = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(r2.code, 0, r2.stderr);
    assert.match(r2.stdout, /imported=1/, 'a reconciled ledger entry whose target row is verifiably GONE must never be skipped');
    assert.equal(await totalTargetRows(), 1, 'the row must be recreated');
  });

  // =====================================================================
  // Item 2: rollback atomicity + ledger-as-source-of-truth.
  // =====================================================================

  await test('rollback with a missing local checkpoint uses the DB-side ledger as the source of truth', async () => {
    await resetAll();
    const idA = await insertTrialRequest(pgPool, 1);
    const idB = await insertTrialRequest(pgPool, 2);
    const fwd = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(fwd.code, 0, fwd.stderr);
    assert.equal(await totalTargetRows(), 2);

    deleteLocalCheckpoint(); // simulate a lost/never-existed local cache

    const rb = runMigrateCLI(['--domain=trial_requests', '--rollback']);
    assert.equal(rb.code, 0, rb.stderr);
    assert.match(rb.stdout, /source=ledger-fallback/);
    assert.equal(await totalTargetRows(), 0, 'both rows must be gone via the ledger fallback alone');
    assert.equal(await ledgerRow(idA), null);
    assert.equal(await ledgerRow(idB), null);
  });

  await test('a partial DELETE failure leaves the failed row (target + ledger) fully intact and never clears its checkpoint entry, but successfully-deleted rows ARE cleared', async () => {
    await resetAll();
    const idOk = await insertTrialRequest(pgPool, 1);
    const idBlocked = await insertTrialRequest(pgPool, 2);
    const fwd = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(fwd.code, 0, fwd.stderr);
    const rowOk = await ledgerRow(idOk);
    const rowBlocked = await ledgerRow(idBlocked);

    // Force ONE row's DELETE to fail deterministically: an actual FK
    // constraint (real Postgres behavior, not a simulated error) by
    // pointing document_counters' scope at it is awkward -- simplest
    // real mechanism available here is a statement_timeout via an
    // advisory lock held by a second connection on that exact row.
    const blocker = new pg.Client({ connectionString: global.PG_URI });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT * FROM trial_requests WHERE id=$1 FOR UPDATE', [rowBlocked.target_id]);
    try {
      const rbEnv = { PGOPTIONS: '-c lock_timeout=1500' };
      const rb = runMigrateCLI(['--domain=trial_requests', '--rollback'], rbEnv);
      assert.equal(rb.code, 1, 'a run with a genuine per-row deletion failure must exit non-zero');
      assert.match(rb.stdout, /1 FAILED/);
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
    }

    assert.equal(await totalTargetRows(), 1, 'the OK row must be gone; the blocked row must still exist');
    const okStillThere = await pgPool.query('SELECT 1 FROM trial_requests WHERE id=$1', [rowOk.target_id]);
    assert.equal(okStillThere.rowCount, 0);
    const blockedStillThere = await pgPool.query('SELECT 1 FROM trial_requests WHERE id=$1', [rowBlocked.target_id]);
    assert.equal(blockedStillThere.rowCount, 1);

    assert.equal(await ledgerRow(idOk), null, 'the OK row\'s own ledger entry must be cleared');
    const blockedLedger = await ledgerRow(idBlocked);
    assert.ok(blockedLedger, 'the FAILED row\'s ledger entry must be untouched, not cleared');
    assert.equal(blockedLedger.status, 'reconciled');

    const cp = readLocalCheckpoint();
    assert.ok(!cp[idOk], 'the successfully-deleted row must be gone from the checkpoint');
    assert.ok(cp[idBlocked], 'the FAILED row must remain in the checkpoint for retry');
  });

  await test('retrying rollback after the blocking condition is removed completes without duplicating anything', async () => {
    // Continues directly from the previous test's left-behind state
    // (1 row remaining, 1 pending checkpoint entry) -- the blocker
    // connection already released its lock in that test's `finally`.
    const rb2 = runMigrateCLI(['--domain=trial_requests', '--rollback']);
    assert.equal(rb2.code, 0, rb2.stderr);
    assert.equal(await totalTargetRows(), 0, 'the retry must finish rolling back the previously-blocked row');
    const cp = readLocalCheckpoint();
    assert.deepEqual(cp, {}, 'checkpoint must be fully empty after a clean retry');
  });

  await test('a fault injected between the target DELETE and its ledger DELETE proves rollback is one real transaction', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);
    const fwd = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(fwd.code, 0, fwd.stderr);
    const row = await ledgerRow(sourceId);

    const rb = runMigrateCLI(['--domain=trial_requests', '--rollback'], {
      MIGRATION_FAULT_INJECT_STAGE: 'during_rollback_before_ledger_delete',
    });
    assert.equal(rb.code, 1);

    // Genuine atomicity proof: the target DELETE that ran before the
    // fault must have been rolled back along with the (never-reached)
    // ledger DELETE -- the row must still exist, unchanged.
    const stillThere = await pgPool.query('SELECT 1 FROM trial_requests WHERE id=$1', [row.target_id]);
    assert.equal(stillThere.rowCount, 1, 'CRITICAL: the target row was deleted even though its ledger entry was not -- rollback is not actually transactional');
    const ledgerStillThere = await ledgerRow(sourceId);
    assert.ok(ledgerStillThere, 'the ledger entry must also still exist, consistent with the target row surviving');

    // And a normal retry (fault removed) now completes cleanly.
    const rb2 = runMigrateCLI(['--domain=trial_requests', '--rollback']);
    assert.equal(rb2.code, 0, rb2.stderr);
    assert.equal(await totalTargetRows(), 0);
    assert.equal(await ledgerRow(sourceId), null);
  });

  await test('an immutable domain (invoices) still refuses rollback outright, with `failed` staying 0', async () => {
    const rb = runMigrateCLI(['--domain=invoices', '--rollback']);
    assert.equal(rb.code, 0, rb.stderr);
    assert.match(rb.stdout, /NOT SUPPORTED/);
  });

  await pgPool.end();
  await mongoose.disconnect();

  console.log('\n=== CLEANUP ===');
  await runCommand('docker', ['rm', '-f', MONGO_NAME]);
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  const mongoGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${MONGO_NAME}$`, '--format', '{{.Names}}']);
  const pgGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
  if (mongoGone.stdout.trim() || pgGone.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- a test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: both test containers absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[resume-rollback-integrity.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', MONGO_NAME]).catch(() => {});
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  process.exitCode = 1;
});
