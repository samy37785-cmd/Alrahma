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
// Review round 3 additions (mongo-to-supabase.mjs's own changelog has the
// full rationale for each fix; summarized here):
//   - rollback's ledger-fallback query now also matches status='failed'
//     rows with a target_id set (kill-window 3's real shape) -- proven by
//     a dedicated kill-window-3 -> delete-checkpoint -> rollback test.
//   - rollback's target-row verification now runs INSIDE the transaction,
//     before the ledger-row delete and before COMMIT -- proven with a
//     REAL BEFORE DELETE trigger that vetoes a delete (not a mock), which
//     must leave both the target row and its ledger row intact.
//   - resumeTargetId is now an ENFORCED adapter contract, not a
//     convention two plain-INSERT domains (notifications,
//     system_audit_logs) silently didn't honor -- proven against exactly
//     those two domains, each with the local checkpoint intact and
//     deleted, asserting exactly one row survives a kill-window-3 resume.
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
import { decodeCompositeTargetId } from './lib/composite-target-id.mjs';
import { verifyReadBack } from './lib/read-back-verify.mjs';

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
  // PR #70 review round 9, item 5: markReconciled() must never run without
  // a real, content-comparing read-back. Round 8's own comment here
  // claimed an "INDEPENDENT re-verification that promotes it to
  // 'reconciled'" existed right before markReconciled() -- it did not;
  // markReconciled() was called directly. Proven with REAL Postgres
  // triggers (not mocks), matching this file's own established style for
  // the BEFORE DELETE veto trigger above: a trigger that silently
  // rewrites a value, and a trigger that deletes the row within the same
  // transaction, must BOTH prevent status='reconciled' and make the run
  // exit non-zero.
  // =====================================================================

  await test('review round 9, item 5: a trigger that silently rewrites a column value is caught by read-back -- never marked reconciled, exits non-zero', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);

    // A real BEFORE INSERT trigger that silently substitutes a DIFFERENT
    // status than what mongo-to-supabase.mjs's own `row` object intended
    // to write ('new') -- simulates ANY mechanism (a trigger, a default,
    // a concurrent process) that causes the persisted content to diverge
    // from what this migration believes it wrote. Must be a value the
    // real trial_requests_status_allowlist CHECK constraint still
    // accepts ('new'/'contacted'/'scheduled') -- an arbitrary string
    // would be rejected by Postgres at INSERT time (a CHECK violation),
    // which never reaches read-back at all and proves nothing about it;
    // a different but VALID value is what actually proves read-back's
    // CONTENT comparison (not bare existence) catches a silent, valid-
    // looking corruption.
    await pgPool.query(`
      CREATE OR REPLACE FUNCTION test_mutate_trial_request_status() RETURNS trigger AS $$
      BEGIN
        NEW.status := 'scheduled';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pgPool.query(`
      CREATE TRIGGER test_mutate_trial_request_status_trigger
      BEFORE INSERT ON trial_requests
      FOR EACH ROW EXECUTE FUNCTION test_mutate_trial_request_status();
    `);
    try {
      const fwd = runMigrateCLI(['--domain=trial_requests']);
      assert.equal(fwd.code, 1, 'a read-back content mismatch must make the whole run exit non-zero');
      assert.match(fwd.stdout, /failed=1/);

      const row = await ledgerRow(sourceId);
      assert.notEqual(row.status, 'reconciled', 'must never be marked reconciled when the persisted content does not match what was written');
      assert.equal(row.status, 'failed');
      assert.ok(row.target_id, 'the row itself was really written (and really exists) -- only its CONTENT was wrong, which is exactly what bare existence checks miss');

      const persisted = await pgPool.query('SELECT status FROM trial_requests WHERE id = $1', [row.target_id]);
      assert.equal(persisted.rows[0].status, 'scheduled', 'sanity: the trigger really did rewrite the value -- this is a real corruption, not a hypothetical one');
    } finally {
      await pgPool.query('DROP TRIGGER IF EXISTS test_mutate_trial_request_status_trigger ON trial_requests');
      await pgPool.query('DROP FUNCTION IF EXISTS test_mutate_trial_request_status()');
    }

    // With the trigger gone, a normal retry (resume) now completes
    // cleanly -- proving the earlier failure really was the trigger, not
    // a wider regression, and that resume correctly reuses the same row.
    const resumed = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(await totalTargetRows(), 1, 'resume must reuse the same row, never insert a duplicate');
    const finalRow = await ledgerRow(sourceId);
    assert.equal(finalRow.status, 'reconciled');
  });

  await test('review round 9, item 5: a trigger that deletes the row within the same transaction is caught by read-back -- never marked reconciled, exits non-zero', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);

    // A real AFTER INSERT trigger that deletes the row it just inserted,
    // within the SAME transaction -- by the time COMMIT completes, the
    // row this migration believes it just created is already gone.
    // Simulates "a concurrent delete before reconciliation" (this
    // engagement's own local sandbox has no way to inject genuine
    // wall-clock concurrency mid-process; a same-transaction self-delete
    // reproduces the exact same observable state read-back must catch:
    // the row is gone by the time it runs).
    await pgPool.query(`
      CREATE OR REPLACE FUNCTION test_self_delete_trial_request() RETURNS trigger AS $$
      BEGIN
        DELETE FROM trial_requests WHERE id = NEW.id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pgPool.query(`
      CREATE TRIGGER test_self_delete_trial_request_trigger
      AFTER INSERT ON trial_requests
      FOR EACH ROW EXECUTE FUNCTION test_self_delete_trial_request();
    `);
    try {
      const fwd = runMigrateCLI(['--domain=trial_requests']);
      assert.equal(fwd.code, 1, 'a read-back "row is gone" must make the whole run exit non-zero');
      assert.match(fwd.stdout, /failed=1/);

      const row = await ledgerRow(sourceId);
      assert.notEqual(row.status, 'reconciled');
      assert.equal(row.status, 'failed');
      assert.equal(await totalTargetRows(), 0, 'sanity: the row really is gone -- the trigger really deleted it');
    } finally {
      await pgPool.query('DROP TRIGGER IF EXISTS test_self_delete_trial_request_trigger ON trial_requests');
      await pgPool.query('DROP FUNCTION IF EXISTS test_self_delete_trial_request()');
    }

    const resumed = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(await totalTargetRows(), 1, 'resume must recreate the row (the ledger correctly does not trust a "created" status whose target vanished)');
    const finalRow = await ledgerRow(sourceId);
    assert.equal(finalRow.status, 'reconciled');
  });

  // =====================================================================
  // PR #70 review round 10, item 2: verifyReadBack() used to silently
  // `continue` past any `expectedFields` key that was not a real column
  // on the re-read row (`if (!(key in dbRow)) continue`) -- a typo'd
  // column name in a caller's expected fields was simply never checked
  // at all, with no error anywhere, defeating the entire point of an
  // exact read-back. Proven directly against verifyReadBack() itself,
  // against a REAL Postgres row, with a genuinely misspelled column name
  // that is not declared in spec.nonColumnFields.
  // =====================================================================

  await test('review round 10, item 2: verifyReadBack fails closed on a typo\'d expected-field name that is not a real column and not in spec.nonColumnFields', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);
    const fwd = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(fwd.code, 0, fwd.stderr);
    const row = await ledgerRow(sourceId);

    const result = await verifyReadBack(pgPool, { table: 'trial_requests' }, row.target_id, {
      name: 'Test 1',
      // Genuine typo: the real column is `status`, not `statuss`. No
      // nonColumnFields declared for this call, so this must fail, not
      // be silently skipped.
      statuss: 'new',
    });
    assert.equal(result.ok, false, 'a typo\'d expected field name must fail read-back, never be silently ignored');
    assert.match(result.reason, /statuss/);
    assert.match(result.reason, /not a real column/);

    // Sanity/contrast: the SAME typo'd key, when explicitly declared in
    // spec.nonColumnFields, is correctly treated as a real, intentional
    // non-column helper field and never flagged.
    const allowlisted = await verifyReadBack(
      pgPool, { table: 'trial_requests', nonColumnFields: ['statuss'] }, row.target_id,
      { name: 'Test 1', statuss: 'new' }
    );
    assert.equal(allowlisted.ok, true, 'a field explicitly declared in spec.nonColumnFields must never be required to exist as a column');
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

  await test('review round 3, item 2: kill-window 3 -> delete checkpoint -> rollback -> both target and ledger must disappear', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);

    // Crash between markCreated and markReconciled -- the outer catch
    // always calls markFailed() (even for an injected fault), so the
    // ledger row ends up status='failed' with target_id STILL SET
    // (markFailed() never touches target_id) and the target row genuinely
    // exists. This is exactly the row shape the round-2 rollback fallback
    // query silently ignored (it only matched 'created'/'reconciled').
    const faulted = runMigrateCLI(['--domain=trial_requests'], {
      MIGRATION_FAULT_INJECT_STAGE: 'after_marked_created_before_reconciled',
    });
    assert.equal(faulted.code, 1);
    const rowAfterFault = await ledgerRow(sourceId);
    assert.equal(rowAfterFault.status, 'failed');
    assert.ok(rowAfterFault.target_id, 'markCreated committed before the fault -- target_id must be set');
    assert.equal(await totalTargetRows(), 1);

    deleteLocalCheckpoint();

    const rb = runMigrateCLI(['--domain=trial_requests', '--rollback']);
    assert.equal(rb.code, 0, rb.stderr);
    assert.match(rb.stdout, /source=ledger-fallback/, 'must have used the ledger fallback (no local checkpoint)');
    assert.equal(await totalTargetRows(), 0, 'the target row must be gone -- a status=failed ledger row with a target_id is NOT a no-op for rollback');
    assert.equal(await ledgerRow(sourceId), null, 'the ledger row must be gone too -- no orphan left behind');
  });

  await test('review round 3, item 3: a real BEFORE DELETE trigger that vetoes the delete is never mistaken for success -- both target and ledger survive', async () => {
    await resetAll();
    const sourceId = await insertTrialRequest(pgPool, 1);
    const fwd = runMigrateCLI(['--domain=trial_requests']);
    assert.equal(fwd.code, 0, fwd.stderr);
    const row = await ledgerRow(sourceId);

    // A real trigger, not a mock: BEFORE DELETE ... RETURN NULL is a
    // legal Postgres way to silently veto a delete -- the DELETE command
    // itself reports rowCount=0 for that row, exactly like "already
    // gone". Only an explicit, independent re-check (verifyTargetRowExists
    // run INSIDE the transaction, before the ledger row is touched and
    // before COMMIT) can tell the two apart.
    await pgPool.query(`
      CREATE OR REPLACE FUNCTION test_veto_trial_request_delete() RETURNS trigger AS $$
      BEGIN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pgPool.query(`
      CREATE TRIGGER test_veto_trial_request_delete_trigger
      BEFORE DELETE ON trial_requests
      FOR EACH ROW EXECUTE FUNCTION test_veto_trial_request_delete();
    `);
    try {
      const rb = runMigrateCLI(['--domain=trial_requests', '--rollback']);
      assert.equal(rb.code, 1, 'a vetoed delete must be reported as a genuine rollback failure, never silent success');
      assert.match(rb.stdout, /1 FAILED/);

      // The row was never actually removed (the trigger vetoed it) -- but
      // prove the STRONGER property: even if it briefly "looked" deleted
      // to the DELETE statement, the whole transaction rolled back, so
      // its ledger row was never touched either.
      const stillThere = await pgPool.query('SELECT 1 FROM trial_requests WHERE id=$1', [row.target_id]);
      assert.equal(stillThere.rowCount, 1, 'the target row must still exist -- the trigger vetoed its deletion');
      const ledgerStillThere = await ledgerRow(sourceId);
      assert.ok(ledgerStillThere, 'the ledger row must also still exist -- it must never be deleted ahead of a confirmed target deletion');
    } finally {
      // Must be removed even on assertion failure -- every later test in
      // this file reuses the same trial_requests table.
      await pgPool.query('DROP TRIGGER IF EXISTS test_veto_trial_request_delete_trigger ON trial_requests');
      await pgPool.query('DROP FUNCTION IF EXISTS test_veto_trial_request_delete()');
    }

    // With the trigger gone, a normal retry now completes cleanly --
    // proving the earlier "failure" really was just the trigger, not a
    // wider regression.
    const rb2 = runMigrateCLI(['--domain=trial_requests', '--rollback']);
    assert.equal(rb2.code, 0, rb2.stderr);
    assert.equal(await totalTargetRows(), 0);
    assert.equal(await ledgerRow(sourceId), null);
  });

  // =====================================================================
  // Item 4: resumeTargetId as an ENFORCED adapter contract -- proven
  // against the two plain-INSERT domains (no natural dedup key, no
  // checkpoint-aware upsert() before this round's fix) the reviewer
  // specifically named: notifications and system_audit_logs.
  // =====================================================================

  const DOMAIN_TABLE = { notifications: 'notifications', system_audit_logs: 'admin_audit_log' };

  function checkpointFileFor(domain) {
    return path.join(__dirname, '.checkpoints', `${domain}.json`);
  }
  function deleteCheckpointFor(domain) {
    fs.rmSync(checkpointFileFor(domain), { force: true });
  }
  async function domainLedgerRow(domain, sourceId) {
    const r = await pgPool.query(
      `SELECT status, target_id, source_content_hash FROM migration_source_ledger
       WHERE source_collection=$1 AND source_document_id=$2`,
      [domain, sourceId]
    );
    return r.rows[0] ?? null;
  }
  async function domainTotalRows(domain) {
    const r = await pgPool.query(`SELECT count(*) FROM ${DOMAIN_TABLE[domain]}`);
    return Number(r.rows[0].count);
  }
  async function resetPlainInsertDomainsState() {
    await pgPool.query('TRUNCATE notifications, admin_audit_log, profiles, auth.users, migration_source_ledger RESTART IDENTITY CASCADE');
    deleteCheckpointFor('notifications');
    deleteCheckpointFor('system_audit_logs');
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('adminusers').deleteMany({});
    await mongoose.connection.collection('notifications').deleteMany({});
    await mongoose.connection.collection('systemauditlogs').deleteMany({});
  }
  async function seedNotificationPrereqs() {
    const email = `notifuser-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
    const profileId = crypto.randomUUID();
    await pgPool.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [profileId, email]);
    const res = await mongoose.connection.collection('users').insertOne({ email });
    return String(res.insertedId);
  }
  async function insertNotificationDoc(recipientMongoId, seq) {
    const res = await mongoose.connection.collection('notifications').insertOne({
      recipient: recipientMongoId, type: 'admin_announcement', title: `Notice ${seq}`,
    });
    return String(res.insertedId);
  }
  async function seedAdminPrereqs() {
    const email = `adminuser-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
    const profileId = crypto.randomUUID();
    await pgPool.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [profileId, email]);
    const res = await mongoose.connection.collection('adminusers').insertOne({ email });
    return String(res.insertedId);
  }
  async function insertAuditLogDoc(adminMongoId, seq) {
    const res = await mongoose.connection.collection('systemauditlogs').insertOne({
      adminId: adminMongoId, action: `test_action_${seq}`, resource: 'test_resource', severity: 'info',
    });
    return String(res.insertedId);
  }

  for (const domainName of ['notifications', 'system_audit_logs']) {
    for (const repeatAfterCheckpointLoss of [false, true]) {
      const label = repeatAfterCheckpointLoss ? '(checkpoint deleted before resume)' : '(checkpoint intact)';
      await test(`review round 3, item 4: kill-window 3 recovery for plain-insert domain ${domainName} -- exactly one row must remain ${label}`, async () => {
        await resetPlainInsertDomainsState();

        let sourceId;
        if (domainName === 'notifications') {
          const recipientMongoId = await seedNotificationPrereqs();
          sourceId = await insertNotificationDoc(recipientMongoId, 1);
        } else {
          const adminMongoId = await seedAdminPrereqs();
          sourceId = await insertAuditLogDoc(adminMongoId, 1);
        }

        const faulted = runMigrateCLI([`--domain=${domainName}`], {
          MIGRATION_FAULT_INJECT_STAGE: 'after_marked_created_before_reconciled',
        });
        assert.equal(faulted.code, 1, faulted.stderr);

        const rowAfterFault = await domainLedgerRow(domainName, sourceId);
        assert.notEqual(rowAfterFault.status, 'reconciled');
        assert.ok(rowAfterFault.target_id, 'the target row must exist at this point (markCreated committed before the fault)');
        assert.equal(await domainTotalRows(domainName), 1, 'exactly one row must exist before resume');

        if (repeatAfterCheckpointLoss) deleteCheckpointFor(domainName);

        const resumed = runMigrateCLI([`--domain=${domainName}`]);
        assert.equal(resumed.code, 0, resumed.stderr);
        assert.equal(
          await domainTotalRows(domainName), 1,
          `CONTRACT VIOLATION: ${domainName} must reuse the existing row on resume, never insert a duplicate -- ` +
          `this is exactly the bug the resumeTargetId adapter-contract fix closes`
        );
        const finalRow = await domainLedgerRow(domainName, sourceId);
        assert.equal(finalRow.status, 'reconciled');
        assert.equal(finalRow.target_id, rowAfterFault.target_id, 'must be the SAME row, not a new one');
      });
    }
  }

  // =====================================================================
  // PR #70 review round 9, item 1: composite target_id encoding. The old
  // `${a}:${b}` / `.split(':')` scheme was not reversible whenever a
  // component's own value contains the delimiter -- exactly
  // quran_bookmarks.verse_key's real shape ("2:255", surah:ayah). Proven
  // here against a REAL live migrate -> resume (checkpoint deleted) ->
  // rollback cycle, not just the pure codec unit tests
  // (lib/composite-target-id.test.mjs).
  // =====================================================================

  async function seedQuranUserPrereqs() {
    const email = `quranuser-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
    const profileId = crypto.randomUUID();
    await pgPool.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [profileId, email]);
    const res = await mongoose.connection.collection('users').insertOne({ email });
    return { profileId, mongoUserId: String(res.insertedId) };
  }
  async function insertQuranBookmarkDoc(mongoUserId, verseKey) {
    const [chapterId, verseNum] = verseKey.split(':').map(Number);
    const res = await mongoose.connection.collection('quranbookmarks').insertOne({
      user: mongoUserId, verseKey, chapterId, verseNum,
    });
    return String(res.insertedId);
  }
  async function resetQuranBookmarksState() {
    await pgPool.query('TRUNCATE quran_bookmarks, profiles, auth.users, migration_source_ledger RESTART IDENTITY CASCADE');
    deleteCheckpointFor('quran_bookmarks');
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('quranbookmarks').deleteMany({});
  }

  await test('review round 9, item 1: quran_bookmarks composite target_id with a delimiter INSIDE its own value (verse_key="2:255") -- migrate, resume (checkpoint deleted), and rollback all correctly round-trip the encoding', async () => {
    await resetQuranBookmarksState();
    const { profileId, mongoUserId } = await seedQuranUserPrereqs();
    const verseKey = '2:255'; // real shape: "<surah>:<ayah>" -- contains the OLD delimiter
    const sourceId = await insertQuranBookmarkDoc(mongoUserId, verseKey);

    const fwd = runMigrateCLI(['--domain=quran_bookmarks']);
    assert.equal(fwd.code, 0, fwd.stderr);
    assert.match(fwd.stdout, /imported=1/);

    const bookmarkRow = await pgPool.query('SELECT user_id, verse_key FROM quran_bookmarks WHERE user_id=$1', [profileId]);
    assert.equal(bookmarkRow.rowCount, 1);
    assert.equal(bookmarkRow.rows[0].verse_key, verseKey, 'the real verse_key must be stored whole -- unaffected by how target_id is encoded');

    const ledger = await domainLedgerRow('quran_bookmarks', sourceId);
    assert.equal(ledger.status, 'reconciled');
    // THE fix, proven directly: the stored target_id must decode back to
    // the exact (profileId, verseKey) pair, not a truncated/corrupted one
    // (the old split(':') scheme would have decoded this to
    // [profileId, "2"], silently dropping ":255").
    assert.deepEqual(decodeCompositeTargetId(ledger.target_id), [profileId, verseKey]);

    deleteCheckpointFor('quran_bookmarks');
    const resumed = runMigrateCLI(['--domain=quran_bookmarks']);
    assert.equal(resumed.code, 0, resumed.stderr);
    const totalAfterResume = await pgPool.query('SELECT count(*) FROM quran_bookmarks');
    assert.equal(Number(totalAfterResume.rows[0].count), 1, 'resume (checkpoint lost) must never duplicate the row');
    const ledgerAfterResume = await domainLedgerRow('quran_bookmarks', sourceId);
    assert.equal(ledgerAfterResume.status, 'reconciled');

    const rb = runMigrateCLI(['--domain=quran_bookmarks', '--rollback']);
    assert.equal(rb.code, 0, rb.stderr);
    // THE critical assertion the old bug would have failed: independently
    // re-query for the EXACT real row (not the corrupted (profileId, "2")
    // identity the old split(':') bug would have looked for/deleted
    // instead) and prove it is genuinely gone -- not merely that
    // rollback's own exit code claimed success.
    const stillThere = await pgPool.query('SELECT 1 FROM quran_bookmarks WHERE user_id=$1 AND verse_key=$2', [profileId, verseKey]);
    assert.equal(
      stillThere.rowCount, 0,
      'CRITICAL: the real quran_bookmarks row (verse_key="2:255") must be gone after rollback -- with the old split(\':\') bug this exact row would silently survive while rollback still reported success'
    );
    assert.equal(await totalTargetRowsGeneric('quran_bookmarks'), 0, 'no orphaned quran_bookmarks row of any shape must remain');
    assert.equal(await domainLedgerRow('quran_bookmarks', sourceId), null, 'the ledger row must be gone too -- no orphan left behind');
  });

  async function totalTargetRowsGeneric(table) {
    const r = await pgPool.query(`SELECT count(*) FROM ${table}`);
    return Number(r.rows[0].count);
  }

  // =====================================================================
  // PR #70 review round 10, item 4: composite decoder arity. Rollback's
  // composite branch destructures `const [a, b] = decodeCompositeTargetId
  // (pgId)` -- before this round's fix, a target_id with THREE (or more)
  // decoded parts decoded SUCCESSFULLY (the old check only required "at
  // least 2"), and the destructure silently kept only the first two,
  // dropping the rest with no error. rollbackDomain() would then issue
  // `DELETE ... WHERE col0=a AND col1=b` using only 2 of the real 3 (or
  // more) values -- for today's 2-column composite tables this happened
  // to still target the "right" row by coincidence, but it was never a
  // real guarantee, and a malformed/tampered/future 3-part value could
  // have matched and deleted a row that only shares 2 of 3 true key
  // values with the intended target. Proven here: a hand-crafted 3-part
  // target_id must reject BEFORE any DELETE (target row) or ledger
  // mutation -- both survive completely untouched.
  // =====================================================================

  await test('review round 10, item 4: rollback on a target_id with THREE decoded parts rejects BEFORE any DELETE or ledger mutation -- never silently drops a real row using only 2 of 3 components', async () => {
    await resetQuranBookmarksState();
    const { profileId } = await seedQuranUserPrereqs();
    const verseKey = '2:255';
    // A REAL quran_bookmarks row -- this is what must survive completely
    // untouched; with the old ">=2" decode this row's own (user_id,
    // verse_key) would be exactly what a truncated 3-part target_id's
    // first two components resolve to, making it a real deletion target.
    await pgPool.query(
      `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num) VALUES ($1,$2,2,255)`,
      [profileId, verseKey]
    );
    // A hand-crafted, malformed ledger row: a THREE-part composite
    // target_id -- this codec's own encodeCompositeTargetId() can never
    // produce one (see lib/composite-target-id.test.mjs's own arity
    // tests); this simulates a tampered/corrupted value reaching
    // rollback regardless of how it got there. No local checkpoint entry
    // exists for this domain (resetQuranBookmarksState() deletes it), so
    // rollbackDomain() uses the DB-side ledger as its source of truth --
    // the exact path that decodes target_id.
    const sourceId = 'malformed-three-part-target';
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash,
          target_table, target_id, status, migrated_at)
       VALUES ('mongodb', 'al-rahma', 'quran_bookmarks', $1, $2, 'quran_bookmarks', $3, 'reconciled', now())`,
      [sourceId, 'a'.repeat(64), JSON.stringify([profileId, verseKey, 'extra-third-part'])]
    );

    const rb = runMigrateCLI(['--domain=quran_bookmarks', '--rollback']);
    assert.equal(rb.code, 1, 'a malformed composite target_id must be reported as a genuine rollback failure, never silent success');
    assert.match(rb.stdout, /1 FAILED/);

    const stillThere = await pgPool.query('SELECT 1 FROM quran_bookmarks WHERE user_id=$1 AND verse_key=$2', [profileId, verseKey]);
    assert.equal(
      stillThere.rowCount, 1,
      'CRITICAL: the real row must survive completely untouched -- a malformed 3-part target_id must never be silently truncated into a real 2-part DELETE'
    );
    const ledgerStillThere = await pgPool.query(`SELECT target_id FROM migration_source_ledger WHERE source_document_id=$1`, [sourceId]);
    assert.equal(ledgerStillThere.rowCount, 1, 'the ledger row must also survive -- never mutated ahead of a confirmed, successful target deletion');
  });

  // =====================================================================
  // PR #70 review round 10, item 1: exact timestamp read-back. Round 9's
  // comparator treated any two non-null Date values as a match ("presence
  // only") -- a trigger silently changing a REAL, source-carried
  // timestamp would have passed completely unnoticed. Proven here against
  // notifications.created_at, seeded with a REAL source createdAt (so
  // __generatedFields is empty and no exemption applies) -- a trigger
  // that rewrites it from 2020 to 2035 must be caught by exact,
  // millisecond-epoch comparison.
  // =====================================================================

  async function insertNotificationDocWithCreatedAt(recipientMongoId, seq, createdAt) {
    const res = await mongoose.connection.collection('notifications').insertOne({
      recipient: recipientMongoId, type: 'admin_announcement', title: `Notice ${seq}`, createdAt,
    });
    return String(res.insertedId);
  }

  await test('review round 10, item 1: a trigger that changes a REAL (non-generated) timestamp from 2020 to 2035 is caught by exact read-back -- never marked reconciled, exits non-zero', async () => {
    await resetPlainInsertDomainsState();
    const recipientMongoId = await seedNotificationPrereqs();
    const sourceId = await insertNotificationDocWithCreatedAt(recipientMongoId, 1, new Date('2020-01-01T00:00:00Z'));

    await pgPool.query(`
      CREATE OR REPLACE FUNCTION test_mutate_notification_created_at() RETURNS trigger AS $$
      BEGIN
        NEW.created_at := '2035-06-15T00:00:00Z'::timestamptz;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pgPool.query(`
      CREATE TRIGGER test_mutate_notification_created_at_trigger
      BEFORE INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION test_mutate_notification_created_at();
    `);
    try {
      const fwd = runMigrateCLI(['--domain=notifications']);
      assert.equal(fwd.code, 1, 'a real timestamp corruption (2020 -> 2035) must make the whole run exit non-zero');
      assert.match(fwd.stdout, /failed=1/);

      const row = await domainLedgerRow('notifications', sourceId);
      assert.notEqual(row.status, 'reconciled', 'must never be marked reconciled when a real, source-carried timestamp was silently rewritten');
      assert.equal(row.status, 'failed');
      assert.ok(row.target_id, 'the row itself was really written -- only its created_at CONTENT was wrong');

      const persisted = await pgPool.query('SELECT created_at FROM notifications WHERE id = $1', [row.target_id]);
      assert.equal(new Date(persisted.rows[0].created_at).getUTCFullYear(), 2035, 'sanity: the trigger really did rewrite the year');
    } finally {
      await pgPool.query('DROP TRIGGER IF EXISTS test_mutate_notification_created_at_trigger ON notifications');
      await pgPool.query('DROP FUNCTION IF EXISTS test_mutate_notification_created_at()');
    }

    // With the trigger gone, resume reuses the ledger-verified existing
    // row (still really there, only wrong content) and overwrites
    // created_at back to the correct 2020 value -- proving the earlier
    // failure really was the trigger, not a wider regression.
    const resumed = runMigrateCLI(['--domain=notifications']);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(await domainTotalRows('notifications'), 1, 'resume must reuse the same row, never insert a duplicate');
    const finalRow = await domainLedgerRow('notifications', sourceId);
    assert.equal(finalRow.status, 'reconciled');
    const finalPersisted = await pgPool.query('SELECT created_at FROM notifications WHERE id = $1', [finalRow.target_id]);
    assert.equal(new Date(finalPersisted.rows[0].created_at).getUTCFullYear(), 2020, 'resume must correct the content back to the real source value');
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
