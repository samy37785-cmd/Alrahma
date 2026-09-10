#!/usr/bin/env node
// Stage 2J-B Part H, review round 4, item 1 -- integration tests for
// verifyNoUnrecordedData(), against a REAL disposable Docker Postgres
// (no Mongo needed -- this preflight is Postgres-only). No mocks.
//
// Bug being proven fixed: verifyNoUnrecordedData() used to assume every
// LEDGER_BACKED_TARGET_TABLES entry has a plain `id` column and matched
// migration_source_ledger.target_id against `t.id::text` unconditionally
// -- wrong for system_config (pkColumn `key`) and every composite-key
// table (wishlists, hifz_progress, course_progress, quran_bookmarks,
// coupon_redemptions, document_counters), whose target_id is a
// ":"-joined string, never a real column value at all. Surfaced live
// (round 3) as `error: column t.id does not exist` the moment the full
// CLI/preflight path was exercised for real. Fixed via
// LEDGER_BACKED_TARGET_SPECS, an explicit per-table identity spec
// (default id / pkColumn / composite, with the exact same ":"-joined
// column order mongo-to-supabase.mjs's own upsert() functions use) --
// see that file's own comment for the full rationale.
//
// This file drives the REAL main preflight path (verifyNoUnrecordedData,
// imported directly -- production-import-orchestrator.mjs IS guarded
// with `if (process.argv[1] === fileURLToPath(import.meta.url))`, unlike
// mongo-to-supabase.mjs, so importing it here does not also run main()),
// never a workaround that calls runImport() directly instead, against
// every LEDGER_BACKED_TARGET_TABLES entry on a pristine schema, plus one
// deliberately unrecorded row for each of the three identity shapes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { verifyNoUnrecordedData } from './production-import-orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const PG_NAME = `stage2jb-h-unrecordedtest-pg-${SUFFIX}`;

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

  async function addLedgerEntry(table, sourceId, targetId) {
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash, target_table, status, target_id, migrated_at)
       VALUES ('mongodb', 'al-rahma', $1, $2, 'test-fixture-hash', $1, 'reconciled', $3, now())`,
      [table, sourceId, targetId]
    );
  }
  async function clearLedgerFor(table) {
    await pgPool.query(`DELETE FROM migration_source_ledger WHERE target_table = $1`, [table]);
  }

  // -----------------------------------------------------------------
  // Pristine schema -- exercises the real SQL for EVERY
  // LEDGER_BACKED_TARGET_SPECS entry (all 26 tables, all three identity
  // shapes among them) in one call. If any single table's identity
  // expression were syntactically or referentially wrong (the exact
  // class of bug being fixed here), this call would throw a Postgres
  // error even with zero rows in every table.
  // -----------------------------------------------------------------

  await test('verifyNoUnrecordedData passes cleanly on a pristine (freshly-migrated, all-empty) schema -- every table, every identity shape', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true);
    } finally {
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // One unrecorded row per identity shape.
  // -----------------------------------------------------------------

  await test('default `id` shape (trial_requests): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'unrecorded@example.invalid', 'new') RETURNING id`
      );
      const rowId = r.rows[0].id;

      await assert.rejects(() => verifyNoUnrecordedData(client), /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/);

      await addLedgerEntry('trial_requests', 'fake-mongo-id-1', rowId);
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching ledger entry must never be flagged');
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('pkColumn shape (system_config.key): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO system_config (key, value) VALUES ('test_unrecorded_key', 'x')`);

      await assert.rejects(() => verifyNoUnrecordedData(client), /system_config: 1 row\(s\) with no matching migration_source_ledger entry/);

      await addLedgerEntry('system_config', 'fake-mongo-id-2', 'test_unrecorded_key');
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching ledger entry (matched via pkColumn, not `id`) must never be flagged');
    } finally {
      await client.query('DELETE FROM system_config');
      await clearLedgerFor('system_config');
      client.release();
    }
  });

  await test('composite shape (document_counters.scope:year): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO document_counters (scope, year, seq) VALUES ('test_scope', 2099, 0)`);

      await assert.rejects(() => verifyNoUnrecordedData(client), /document_counters: 1 row\(s\) with no matching migration_source_ledger entry/);

      // MUST be the exact same ":"-joined encoding and column ORDER
      // mongo-to-supabase.mjs's own document_counters.upsert() returns
      // (`${row.scope}:${row.year}`) -- a wrong order here would prove
      // the spec itself has drifted from the real encoding, which is
      // exactly what this assertion exists to catch.
      await addLedgerEntry('document_counters', 'fake-mongo-id-3', 'test_scope:2099');
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching composite-key ledger entry (correct column order) must never be flagged');
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  await test('composite shape, wrong column order: proves the identity expression is order-sensitive, not accidentally order-agnostic', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO document_counters (scope, year, seq) VALUES ('test_scope2', 2098, 0)`);
      // Deliberately swapped order ("year:scope" instead of "scope:year")
      // -- must NOT match, proving the check really does compare the
      // full, order-sensitive string, not just "same values present".
      await addLedgerEntry('document_counters', 'fake-mongo-id-4', '2098:test_scope2');

      await assert.rejects(() => verifyNoUnrecordedData(client), /document_counters: 1 row\(s\) with no matching migration_source_ledger entry/);
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  await test('after all fixtures are cleaned up, the schema is pristine again', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true);
    } finally {
      client.release();
    }
  });

  await pgPool.end();

  console.log('\n=== CLEANUP ===');
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

main().catch(async (err) => {
  console.error('[unrecorded-data-preflight.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  process.exitCode = 1;
});
