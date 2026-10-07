#!/usr/bin/env node
// Real-Postgres proof for the narrowly pinned production schema-forward
// tool. A disposable local database is built to exact 0000-0027, then:
//   1. a forced failure in 0029 proves 0028 + its journal row roll back;
//   2. the real 0028 and 0029 reach exact 30/30 and all structural probes;
//   3. a re-run is refused before any migration statement.
// No remote host, production credential, API key or user data is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { createLocalAuthRolesAndFunctions, createLocalAuthUsersStub } from '../../../lib/db/test/local-harness.mjs';
import { readExpectedJournal } from '../ops/lib/supabase-state-report-core.mjs';
import {
  applyTailMigrations,
  assertPostflightState,
  assertPreflightState,
  collectSchemaForwardState,
  readTailMigrations,
} from '../ops/lib/supabase-schema-forward-0028-0029-core.mjs';
import { createDb } from '../ops/supabase-schema-forward-0028-0029.mjs';
import { EXPECTED_NEW_TABLES } from '../../../ops/option-a-rehearsal/scripts/lib/new-schema-fingerprint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DRIZZLE_DIR = path.join(REPO_ROOT, 'lib', 'db', 'drizzle');
const PG_NAME = `schema-forward-2829-${crypto.randomBytes(5).toString('hex')}`;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startPostgres() {
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', PG_NAME,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-p', '127.0.0.1::5432',
    'postgres:17',
  ]);
  if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 20 && !port; i++) {
    const found = await runCommand('docker', ['port', PG_NAME, '5432/tcp']);
    const match = found.stdout.trim().match(/:(\d+)\s*$/);
    if (found.code === 0 && match) port = match[1];
    else await sleep(300);
  }
  if (!port) throw new Error('could not discover the disposable Postgres port');
  for (let i = 0; i < 100; i++) {
    const ready = await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres']);
    if (ready.code === 0) return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
    await sleep(300);
  }
  throw new Error('disposable Postgres did not become ready');
}

async function applyPrefix(pool, journal, count) {
  await createLocalAuthUsersStub(pool);
  await createLocalAuthRolesAndFunctions(pool);
  await pool.query('create schema if not exists drizzle');
  await pool.query(`create table drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )`);
  for (const entry of journal.slice(0, count)) {
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    await pool.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [entry.hash, entry.createdAt]);
  }
  // Supabase's platform event trigger enables RLS on every public table.
  // Plain postgres:17 has no such platform trigger, so reproduce that one
  // platform invariant explicitly for this local-only fixture.
  for (const table of EXPECTED_NEW_TABLES) await pool.query(`alter table public."${table}" enable row level security`);
}

async function main() {
  console.log('=== SETUP: disposable local Postgres at exact 0000-0027 ===');
  const dbUrl = await startPostgres();
  const expectedJournal = readExpectedJournal(REPO_ROOT);
  const migrations = readTailMigrations(REPO_ROOT, expectedJournal);
  const setupPool = new pg.Pool({ connectionString: dbUrl });
  const db = createDb(dbUrl);
  try {
    await applyPrefix(setupPool, expectedJournal, 28);
    await setupPool.end();

    await test('forced 0029 failure rolls back 0028, both journal rows and every schema effect', async () => {
      const broken = migrations.map((m, i) => i === 1 ? { ...m, sql: 'select * from relation_that_must_not_exist_0029' } : m);
      await assert.rejects(
        db.inTransaction((client) => applyTailMigrations(client, { expectedJournal, migrations: broken })),
        /relation_that_must_not_exist_0029/
      );
      const after = await db.readOnly((client) => collectSchemaForwardState(client, expectedJournal));
      assertPreflightState(after);
      assert.equal(after.paymob, 0);
      assert.equal(after.dateColumns.length, 0);
    });

    await test('the real pinned transaction applies exactly 0028 and 0029 and verifies exact 30/30', async () => {
      await db.inTransaction((client) => applyTailMigrations(client, { expectedJournal, migrations }));
      const after = await db.readOnly((client) => collectSchemaForwardState(client, expectedJournal));
      assertPostflightState(after);
      assert.equal(after.journal.appliedCount, 30);
      assert.equal(after.paymob, 1);
      assert.equal(after.dateColumns.length, 7);
      assert.equal(after.dateTriggers.length, 5);
    });

    await test('a second run is refused at the repeated preflight and changes no journal row', async () => {
      await assert.rejects(
        db.inTransaction((client) => applyTailMigrations(client, { expectedJournal, migrations })),
        (err) => err?.code === 'WRONG_MIGRATION_STATE'
      );
      const after = await db.readOnly((client) => collectSchemaForwardState(client, expectedJournal));
      assertPostflightState(after);
      assert.equal(after.journal.appliedCount, 30);
    });
  } finally {
    await setupPool.end().catch(() => {});
    await db.end().catch(() => {});
    console.log('\n=== CLEANUP ===');
    await runCommand('docker', ['rm', '-f', '-v', PG_NAME]).catch(() => {});
    const left = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
    if (left.code !== 0 || left.stdout.trim()) throw new Error('cleanup could not verify the disposable Postgres container is absent');
    console.log('cleanup verified: all test containers absent.');
  }

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[schema-forward-0028-0029.test] harness crashed:', err);
  process.exitCode = 1;
});

