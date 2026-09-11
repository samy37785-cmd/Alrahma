#!/usr/bin/env node
// Stage 2J-B Part H, review round 4, item 3 -- integration tests for the
// nested-transaction-ownership fix (lib/admin-rpc.mjs / mongo-to-
// supabase.mjs's invoices domain), against REAL disposable Docker Mongo +
// Postgres containers -- no mocks.
//
// Explicit scope note (this file is the ONLY one in this directory that
// writes anything to the `payments` table, and does so under an explicit,
// narrow, one-time operator approval for this round):
//   - The `payments` row seeded below is a SYNTHETIC fixture written
//     directly via raw SQL into a DISPOSABLE, throwaway local Postgres
//     container, gateway='stripe' with entirely fake values -- it exists
//     ONLY to satisfy issue_invoice_from_payment()'s own precondition
//     (a real, existing succeeded charge to link an invoice to). Nothing
//     here reads real Mongo `payments` data, the real dump, Atlas, or
//     production. The `payments` migration DOMAIN's code
//     (mongo-to-supabase.mjs's own `payments` entry, or the payments
//     controller) is never invoked, imported, or modified by this file --
//     only the ALREADY-EXISTING, already-reviewed issue_invoice_from_
//     payment() RPC and the `invoices` domain (the two things review
//     round 4's item 3 is actually about) are exercised.
//   - The container and its volume are removed and cleanup is
//     independently verified at the end, same as every other test file
//     in this directory. No synthetic data is committed to Git.
//
// Bug being proven fixed: mongo-to-supabase.mjs's invoices domain called
// the transaction-OWNING withImpersonatedAdmin() from INSIDE
// migrateDomain()'s own already-open transaction (the same one that also
// wraps markCreated() -- see that function's own "kill-window 2" comment).
// Postgres does not support real nested transactions: the inner BEGIN was
// a silent no-op, and the inner COMMIT actually committed the OUTER
// transaction, immediately after the invoice write, BEFORE markCreated()
// ever ran. An injected fault (or a real crash) between the invoice write
// and markCreated left a REAL, committed, orphaned invoice with no ledger
// record at all -- kill-window 2's atomicity guarantee did not actually
// hold for this one domain. Fixed via withImpersonatedAdminContext() (no
// BEGIN/COMMIT of its own -- lib/admin-rpc.mjs has the full rationale).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { withImpersonatedAdmin, withImpersonatedAdminContext, ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MONGO_TO_SUPABASE = path.join(__dirname, 'mongo-to-supabase.mjs');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const MONGO_NAME = `stage2jb-h-invoicetest-mongo-${SUFFIX}`;
const PG_NAME = `stage2jb-h-invoicetest-pg-${SUFFIX}`;

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

  // -----------------------------------------------------------------
  // Direct lib/admin-rpc.mjs proofs -- no CLI, no invoices/payments
  // domain involved at all. lib/admin-rpc.mjs has no unconditional
  // main() (unlike mongo-to-supabase.mjs), so it is always safe to
  // import and call directly.
  // -----------------------------------------------------------------

  await test('withImpersonatedAdminContext never owns a transaction -- the CALLER\'s own ROLLBACK undoes a write made inside it', async () => {
    const client = new pg.Client({ connectionString: global.PG_URI });
    await client.connect();
    try {
      await client.query('CREATE TEMP TABLE test_marker_ctx (id int)');
      // A temp table created as postgres is owned by postgres -- SET
      // LOCAL ROLE authenticated below then can't touch it without an
      // explicit grant. Real callers never hit this (they write to real
      // tables authenticated already has RLS-scoped INSERT/SELECT on);
      // it's purely this test's own scratch-table artifact.
      await client.query('GRANT INSERT, SELECT ON test_marker_ctx TO authenticated');
      await client.query('BEGIN');
      let roleDuring;
      await withImpersonatedAdminContext(client, async (c) => {
        roleDuring = (await c.query(`SELECT current_setting('role', true) AS role`)).rows[0].role;
        await c.query('INSERT INTO test_marker_ctx (id) VALUES (1)');
      });
      const roleAfterReset = (await client.query(`SELECT current_setting('role', true) AS role`)).rows[0].role;
      assert.equal(roleDuring, 'authenticated', 'the impersonation must actually be active while fn runs');
      assert.notEqual(roleAfterReset, 'authenticated', 'RESET ROLE must already have taken effect before the caller decides commit vs. rollback');

      // The CALLER (not the helper) decides the transaction's fate --
      // rolling back here must undo the marker insert too. If the helper
      // had secretly issued its own BEGIN/COMMIT (the old, buggy
      // pattern), the insert would already be durably committed and
      // would SURVIVE this rollback.
      await client.query('ROLLBACK');
      const count = (await client.query('SELECT count(*) FROM test_marker_ctx')).rows[0].count;
      assert.equal(Number(count), 0, 'CRITICAL: the marker row survived the caller\'s own ROLLBACK -- withImpersonatedAdminContext must never own/commit its own transaction');
    } finally {
      await client.end();
    }
  });

  await test('withImpersonatedAdmin (transaction-owning) still commits its own standalone work correctly -- unchanged for its real caller (seedCanonicalPlans)', async () => {
    const client = new pg.Client({ connectionString: global.PG_URI });
    await client.connect();
    try {
      await client.query('CREATE TEMP TABLE test_marker_owning (id int)');
      await client.query('GRANT INSERT, SELECT ON test_marker_owning TO authenticated');
      await withImpersonatedAdmin(client, async (c) => {
        await c.query('INSERT INTO test_marker_owning (id) VALUES (1)');
      });
      const count = (await client.query('SELECT count(*) FROM test_marker_owning')).rows[0].count;
      assert.equal(Number(count), 1, 'withImpersonatedAdmin must still commit its own work when used standalone, with no outer transaction open');
    } finally {
      await client.end();
    }
  });

  // -----------------------------------------------------------------
  // Live invoices-domain proof, via the real CLI (child-process
  // invocation only -- never imported directly, same discipline as
  // every other test file in this directory).
  // -----------------------------------------------------------------

  // PR #70 review round 7, item 7: ensureMigrationSeedAdmin() now opens
  // its own real transaction -- it must be called with a single
  // checked-out client, never a bare Pool (see that function's own
  // comment for why a Pool would silently break the atomicity guarantee).
  {
    const seedAdminClient = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(seedAdminClient);
    } finally {
      seedAdminClient.release();
    }
  }

  async function seedBuyerProfile(seq) {
    const email = `invoicebuyer-${seq}-${crypto.randomBytes(3).toString('hex')}@example.invalid`;
    const profileId = crypto.randomUUID();
    await pgPool.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [profileId, email]);
    return { profileId, email };
  }

  // Synthetic-only fixture, approved narrowly for this test: gateway
  // 'stripe', fully fake amount/ids, written directly into the
  // DISPOSABLE local `payments` table via the exact INSERT
  // mongo-to-supabase.mjs's own `payments` domain issues (reused
  // verbatim so this fixture is guaranteed schema-compatible with the
  // real, maintained column list rather than a hand-guessed one). The
  // real `payments` domain's CODE is never invoked.
  async function seedSyntheticPayment(profileId, email, seq) {
    const r = await pgPool.query(
      `INSERT INTO payments
         (user_id, plan_id, kind, amount_minor, currency_snapshot, gateway, gateway_payment_id, gateway_order_id,
          status, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, created_at, updated_at)
       VALUES ($1, NULL, 'charge', 5600, 'EUR', 'stripe', $2, NULL, 'succeeded', 'Test Buyer', $3, NULL, now(), now())
       RETURNING id`,
      [profileId, `test_txn_${seq}_${crypto.randomBytes(3).toString('hex')}`, email]
    );
    return r.rows[0].id;
  }

  async function seedPaymentLedgerEntry(mongoPaymentId, paymentsRowId) {
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash, target_table, status, target_id, migrated_at)
       VALUES ('mongodb', 'al-rahma', 'payments', $1, 'test-fixture-hash', 'payments', 'reconciled', $2, now())`,
      [mongoPaymentId, paymentsRowId]
    );
  }

  async function insertInvoiceDoc(mongoPaymentId) {
    const res = await mongoose.connection.collection('invoices').insertOne({ payment: mongoPaymentId });
    return String(res.insertedId);
  }

  async function invoiceLedgerRow(sourceId) {
    const r = await pgPool.query(
      `SELECT status, target_id FROM migration_source_ledger WHERE source_collection='invoices' AND source_document_id=$1`,
      [sourceId]
    );
    return r.rows[0] ?? null;
  }
  async function totalInvoiceRows() {
    return Number((await pgPool.query('SELECT count(*) FROM invoices')).rows[0].count);
  }

  let seq = 0;

  async function resetInvoicesState() {
    await pgPool.query(`DELETE FROM migration_source_ledger WHERE source_collection = 'invoices'`);
    await pgPool.query('TRUNCATE invoices');
    await mongoose.connection.collection('invoices').deleteMany({});
  }

  await test('review round 4, item 3: kill-window 2 fault -- neither the invoice row nor its ledger target_id may be committed', async () => {
    await resetInvoicesState();
    seq += 1;
    const { profileId, email } = await seedBuyerProfile(seq);
    const mongoPaymentId = crypto.randomBytes(12).toString('hex'); // fake 24-hex-char Mongo-ObjectId-shaped id
    const paymentsRowId = await seedSyntheticPayment(profileId, email, seq);
    await seedPaymentLedgerEntry(mongoPaymentId, paymentsRowId);
    const invoiceSourceId = await insertInvoiceDoc(mongoPaymentId);

    const faulted = runMigrateCLI(['--domain=invoices'], {
      MIGRATION_FAULT_INJECT_STAGE: 'after_target_write_before_marked_created',
    });
    assert.equal(faulted.code, 1, 'the faulted run itself must report a failure');
    assert.match(faulted.stdout, /failed=1/);

    assert.equal(await totalInvoiceRows(), 0, 'CRITICAL: the invoice row was committed even though markCreated never ran -- the nested-transaction bug has regressed');
    const ledgerRow = await invoiceLedgerRow(invoiceSourceId);
    assert.ok(ledgerRow, 'markPlanned must have committed its own ledger row (a separate, already-committed statement)');
    assert.notEqual(ledgerRow.status, 'reconciled');
    assert.equal(ledgerRow.target_id, null, 'CRITICAL: target_id was recorded even though the invoice write itself was never actually committed');
  });

  await test('review round 4, item 3: normal invoice execution completes correctly (real RPC call, real transaction, real role reset)', async () => {
    await resetInvoicesState();
    seq += 1;
    const { profileId, email } = await seedBuyerProfile(seq);
    const mongoPaymentId = crypto.randomBytes(12).toString('hex');
    const paymentsRowId = await seedSyntheticPayment(profileId, email, seq);
    await seedPaymentLedgerEntry(mongoPaymentId, paymentsRowId);
    const invoiceSourceId = await insertInvoiceDoc(mongoPaymentId);

    const run = runMigrateCLI(['--domain=invoices']);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /imported=1/);

    assert.equal(await totalInvoiceRows(), 1);
    const ledgerRow = await invoiceLedgerRow(invoiceSourceId);
    assert.equal(ledgerRow.status, 'reconciled');
    assert.ok(ledgerRow.target_id, 'a real invoice must have been created and recorded');

    const invoiceRow = await pgPool.query('SELECT payment_id FROM invoices WHERE id = $1', [ledgerRow.target_id]);
    assert.equal(invoiceRow.rows[0].payment_id, paymentsRowId, 'the invoice must link back to the exact synthetic payment seeded for this test');

    // Role reset, proven against the REAL migration connection this time
    // (not the isolated admin-rpc-only test above): the migration's own
    // pg.Pool connection was released back to its pool and the process
    // has already exited by now, so the only way to prove this
    // end-to-end is the isolated withImpersonatedAdminContext test
    // above, which exercises the exact same helper this domain now uses.
    // This assertion instead confirms the RPC's own AAL2-gated audit
    // path fired (admin_audit_log gained a row for this invoice), which
    // is itself only possible if the impersonated role/claims were
    // genuinely active at call time -- a real, additional confirmation
    // the impersonation context worked, not just that it was reset after.
    const auditRow = await pgPool.query(
      `SELECT 1 FROM admin_audit_log WHERE action = 'issue_invoice_from_payment' AND resource_id = $1`,
      [ledgerRow.target_id]
    );
    assert.equal(auditRow.rowCount, 1, 'issue_invoice_from_payment() must have recognized a genuine AAL2 admin session and written its own audit row');
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
  console.error('[invoice-atomicity.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', MONGO_NAME]).catch(() => {});
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  process.exitCode = 1;
});
