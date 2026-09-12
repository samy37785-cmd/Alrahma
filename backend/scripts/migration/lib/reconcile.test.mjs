#!/usr/bin/env node
// PR #70 review round 12, item 2 -- direct unit/integration tests for
// lib/reconcile.mjs's verifyThenReconcile() and lib/source-ledger.mjs's
// markCreated()/markReconciled()/markFailed(), against a REAL disposable
// Postgres container (no mocks, no real dump, no real credentials, never
// touches Atlas/real Mongo/the real Supabase project). No Mongo needed at
// all -- these functions only ever touch migration_source_ledger, so this
// file is deliberately lighter-weight than the other tests in this
// directory (Postgres only).
//
// Scenario D: markReconciled() (lib/source-ledger.mjs) now asserts its own
// UPDATE affected exactly 1 row, and throws a clear error otherwise -- a
// ledger row deleted between the last passing check and this call (or an
// invalid/nonexistent ledgerId reaching verifyThenReconcile() at all) must
// never be silently treated as a successful reconciliation. Before this
// round, markReconciled()'s own UPDATE affecting 0 rows was
// indistinguishable from affecting 1: verifyThenReconcile() still returned
// `{ok: true}` either way.
//
// Scenario E: verifyThenReconcile() itself must fail closed on `checks=[]`
// (nothing was actually verified) and on a check returning a malformed
// result (`{}`, `null`, or anything without an explicit `ok: true`) --
// never treat "we don't know" as "it passed".
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../../lib/db/test/orchestrator-lib.mjs';
import { verifyThenReconcile } from './reconcile.mjs';
import { markPlanned, markCreated, markReconciled, markFailed, findLedgerEntry } from './source-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const PG_NAME = `stage2jb-r12-reconciletest-pg-${SUFFIX}`;

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

async function main() {
  console.log('=== SETUP: disposable Postgres, schema applied ===');
  const pgPort = await startDisposablePostgres();
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;

  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], {
    env: { ...process.env, TEST_DATABASE_URL: pgUri },
  });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
  console.log('schema applied.');

  const pgPool = new pg.Pool({ connectionString: pgUri });
  let seq = 0;
  async function plannedLedgerRow() {
    seq += 1;
    const id = await markPlanned(pgPool, {
      sourceDatabase: 'al-rahma', sourceCollection: 'reconcile_test', sourceDocumentId: `doc-${seq}`,
      targetTable: 'reconcile_test_target', contentHash: 'a'.repeat(64),
    });
    return id;
  }

  // ---------------------------------------------------------------------
  // Item 2 core: markCreated/markReconciled/markFailed each assert exactly
  // one row affected, and throw a clear error otherwise.
  // ---------------------------------------------------------------------

  await test('markReconciled(): throws when the ledger row does not exist -- never silently succeeds on a 0-row UPDATE', async () => {
    // migration_source_ledger.id is a real uuid column -- a syntactically
    // VALID but nonexistent id, not a bare integer (which Postgres itself
    // would reject at the type-cast level, before ever reaching the
    // rowCount check this test actually means to exercise).
    await assert.rejects(
      () => markReconciled(pgPool, crypto.randomUUID()),
      /markReconciled\(\): UPDATE affected 0 row\(s\)/,
    );
  });

  await test('markCreated(): throws when the ledger row does not exist', async () => {
    await assert.rejects(
      () => markCreated(pgPool, crypto.randomUUID(), 'some-target-id'),
      /markCreated\(\): UPDATE affected 0 row\(s\)/,
    );
  });

  await test('markFailed(): throws when the ledger row does not exist', async () => {
    await assert.rejects(
      () => markFailed(pgPool, crypto.randomUUID(), 'some reason'),
      /markFailed\(\): UPDATE affected 0 row\(s\)/,
    );
  });

  await test('markCreated()/markReconciled()/markFailed(): each succeeds normally (exactly 1 row) against a real, existing ledger row', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'real-target-1');
    await markReconciled(pgPool, ledgerId);
    const row = await pgPool.query('SELECT status, target_id FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'reconciled');
    assert.equal(row.rows[0].target_id, 'real-target-1');

    const ledgerId2 = await plannedLedgerRow();
    await markFailed(pgPool, ledgerId2, 'a real failure reason');
    const row2 = await pgPool.query('SELECT status, error_reason FROM migration_source_ledger WHERE id = $1', [ledgerId2]);
    assert.equal(row2.rows[0].status, 'failed');
    assert.equal(row2.rows[0].error_reason, 'a real failure reason');
  });

  // ---------------------------------------------------------------------
  // Scenario D -- ledger disappearance: verification succeeds, but the
  // ledger row is deleted before markReconciled() runs, or an invalid
  // ledgerId is passed. verifyThenReconcile() must fail, never ok:true.
  // ---------------------------------------------------------------------

  await test('scenario D: verifyThenReconcile() never returns ok:true when the ledger row was deleted before markReconciled() could run', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-d1');
    // Every check passes, but the ledger row itself is gone by the time
    // markReconciled() would run -- simulates a genuine race (a
    // concurrent rollback/compensate, a manual DBA delete) between the
    // last check succeeding and this function's own final UPDATE.
    await pgPool.query('DELETE FROM migration_source_ledger WHERE id = $1', [ledgerId]);

    const result = await verifyThenReconcile(pgPool, ledgerId, [
      async () => ({ ok: true }),
    ]);
    assert.equal(result.ok, false, 'must never return ok:true once the ledger row is gone');
    assert.match(result.reason, /markReconciled|ledger reconciliation/i);

    const row = await pgPool.query('SELECT * FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows.length, 0, 'sanity: the row really is gone -- this is not testing anything else');
  });

  await test('scenario D: verifyThenReconcile() never returns ok:true when passed a ledgerId that never existed at all', async () => {
    const result = await verifyThenReconcile(pgPool, crypto.randomUUID(), [
      async () => ({ ok: true }),
    ]);
    assert.equal(result.ok, false, 'must never return ok:true for a ledgerId with no backing row');
    assert.match(result.reason, /markReconciled|ledger reconciliation/i);
  });

  // ---------------------------------------------------------------------
  // Scenario E -- empty/malformed checks must fail closed.
  // ---------------------------------------------------------------------

  await test('scenario E: verifyThenReconcile() with checks=[] fails closed -- never reconciles having verified nothing', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e1');

    const result = await verifyThenReconcile(pgPool, ledgerId, []);
    assert.equal(result.ok, false);
    assert.match(result.reason, /zero checks/);

    const row = await findLedgerEntry(pgPool, {
      sourceDatabase: 'al-rahma', sourceCollection: 'reconcile_test', sourceDocumentId: `doc-${seq}`, targetTable: 'reconcile_test_target',
    });
    assert.equal(row.status, 'created', 'must remain exactly as it was -- never silently promoted to reconciled');
  });

  await test('scenario E: a check returning {} (no explicit ok:true) fails closed, never treated as passing', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e2');

    const result = await verifyThenReconcile(pgPool, ledgerId, [async () => ({})]);
    assert.equal(result.ok, false, 'a malformed {} result must never count as a pass');
    assert.match(result.reason, /malformed result/);

    const row = await pgPool.query('SELECT status FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'created', 'must remain exactly as it was -- never silently promoted to reconciled');
  });

  await test('scenario E: a check returning null fails closed, never treated as passing', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e3');

    const result = await verifyThenReconcile(pgPool, ledgerId, [async () => null]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /malformed result/);

    const row = await pgPool.query('SELECT status FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'created');
  });

  await test('scenario E: a check returning a truthy-but-not-exactly-true `ok` (e.g. {ok: 1}) fails closed', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e4');

    const result = await verifyThenReconcile(pgPool, ledgerId, [async () => ({ ok: 1 })]);
    assert.equal(result.ok, false, 'only ok === true (exactly) may count as a pass -- a truthy non-boolean must not slip through');

    const row = await pgPool.query('SELECT status FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'created');
  });

  await test('scenario E control case: a real, well-formed, all-passing check list still reconciles normally (the fix is not over-broad)', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e5');

    const result = await verifyThenReconcile(pgPool, ledgerId, [
      async () => ({ ok: true }),
      async () => ({ ok: true }),
    ]);
    assert.equal(result.ok, true);

    const row = await pgPool.query('SELECT status FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'reconciled');
  });

  await test('verifyThenReconcile() short-circuits on the first failing check -- a later check is never even attempted', async () => {
    const ledgerId = await plannedLedgerRow();
    await markCreated(pgPool, ledgerId, 'target-e6');
    let secondChecked = false;

    const result = await verifyThenReconcile(pgPool, ledgerId, [
      async () => ({ ok: false, reason: 'first check fails on purpose' }),
      async () => { secondChecked = true; return { ok: true }; },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'first check fails on purpose');
    assert.equal(secondChecked, false, 'the second check must never run once an earlier one has already failed');

    const row = await pgPool.query('SELECT status FROM migration_source_ledger WHERE id = $1', [ledgerId]);
    assert.equal(row.rows[0].status, 'created');
  });

  await pgPool.end();

  console.log('\n=== CLEANUP: stopping and removing the disposable Postgres container ===');
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  const pgGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
  if (pgGone.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- the test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: test container absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[lib/reconcile.test] FATAL:', err.stack || err.message);
  process.exitCode = 1;
});
