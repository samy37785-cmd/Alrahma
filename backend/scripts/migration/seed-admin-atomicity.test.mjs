#!/usr/bin/env node
// Stage 2J-B Part H -- PR #70 review round 7, item 7: integration tests
// for ensureMigrationSeedAdmin()'s transaction atomicity
// (lib/admin-rpc.mjs), against a REAL disposable Docker Postgres -- no
// mocks.
//
// Bug being proven fixed: the three writes ensureMigrationSeedAdmin()
// makes (auth.users, profiles, admin_role_assignments) used to be three
// independent, separately-committed statements. A crash between any two
// of them left a PARTIAL seed admin behind -- e.g. an auth.users row with
// no profiles row yet, or profiles.role='admin' with no
// admin_role_assignments row -- which is exactly the kind of "real
// identity, but incomplete" state verifyNoUnrecordedData()'s seed-admin
// exemption (production-import-orchestrator.mjs) deliberately REJECTS (it
// requires all four conditions simultaneously: id + email + profiles.role
// + admin_role_assignments.role, all at once). A partial seed admin from
// a prior crash therefore became a permanently-unrecorded, never-exempted
// row blocking every later run, with no single write to point at as "the"
// failure and no way to automatically recover (ensureMigrationSeedAdmin()'s
// own "collision" check would fire forever afterward, since the row then
// matches neither 'absent' nor 'exact').
//
// Fixed: all three writes, plus the pre-/post-write identity checks, now
// happen inside ONE real transaction (BEGIN/COMMIT/ROLLBACK). The complete
// identity is independently re-verified before COMMIT; any failure at any
// point -- a real error, a collision, or a fault-injection throw -- rolls
// back the WHOLE transaction, leaving either the complete correct identity
// or nothing at all, never a partial one.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { ensureMigrationSeedAdmin, inspectMigrationSeedAdmin, MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL } from './lib/admin-rpc.mjs';
import { verifyNoUnrecordedData } from './production-import-orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const PG_NAME = `stage2jb-h-seedadmintest-pg-${SUFFIX}`;

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

  async function resetSeedAdmin() {
    await pgPool.query('DELETE FROM auth.users WHERE id = $1 OR email = $2', [MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]);
  }

  // -------------------------------------------------------------------
  // Happy path -- no fault injected, prevents false positives from the
  // kill-window tests below (proves the normal path still fully succeeds
  // and produces the exact expected identity).
  // -------------------------------------------------------------------

  await test('happy path: ensureMigrationSeedAdmin creates the complete identity in one commit', async () => {
    await resetSeedAdmin();
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(client);
      const state = await inspectMigrationSeedAdmin(client);
      assert.equal(state.state, 'exact');
      assert.equal(await verifyNoUnrecordedData(client), true, 'the freshly-created seed admin must be exempt immediately');
    } finally {
      client.release();
    }
  });

  await test('happy path: calling ensureMigrationSeedAdmin a second time is a safe, idempotent no-op', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(client); // already exists from the previous test's state carried forward on purpose
      const state = await inspectMigrationSeedAdmin(client);
      assert.equal(state.state, 'exact');
    } finally {
      client.release();
    }
    await resetSeedAdmin();
  });

  // -------------------------------------------------------------------
  // Kill-window tests -- fault injected after EACH of the three writes,
  // proving a crash at any point rolls back the WHOLE transaction, never
  // leaving a partial identity behind.
  // -------------------------------------------------------------------

  const KILL_WINDOWS = [
    'after_seed_admin_auth_user_insert',
    'after_seed_admin_profile_insert',
    'after_seed_admin_role_assignment_insert',
  ];

  for (const stage of KILL_WINDOWS) {
    await test(`kill window: a crash ${stage} rolls back the WHOLE transaction -- no partial identity survives`, async () => {
      await resetSeedAdmin();
      const client = await pgPool.connect();
      try {
        process.env.MIGRATION_FAULT_INJECT_STAGE = stage;
        try {
          await assert.rejects(() => ensureMigrationSeedAdmin(client), new RegExp(stage));
        } finally {
          delete process.env.MIGRATION_FAULT_INJECT_STAGE;
        }

        // Nothing at all must have survived -- not the auth.users row,
        // not a profiles row, not an admin_role_assignments row.
        const authRows = await client.query('SELECT id FROM auth.users WHERE id = $1', [MIGRATION_SEED_ADMIN_ID]);
        assert.equal(authRows.rows.length, 0, 'auth.users must be completely rolled back');
        const profileRows = await client.query('SELECT id FROM profiles WHERE id = $1', [MIGRATION_SEED_ADMIN_ID]);
        assert.equal(profileRows.rows.length, 0, 'profiles must be completely rolled back');
        const roleRows = await client.query('SELECT user_id FROM admin_role_assignments WHERE user_id = $1', [MIGRATION_SEED_ADMIN_ID]);
        assert.equal(roleRows.rows.length, 0, 'admin_role_assignments must be completely rolled back');

        const state = await inspectMigrationSeedAdmin(client);
        assert.equal(state.state, 'absent', 'the identity must be entirely absent, never "collision" (which would mean a partial row survived)');

        // A retry on a clean connection must fully succeed -- the rollback
        // did not leave anything behind that would make a later attempt
        // see a false collision.
        await ensureMigrationSeedAdmin(client);
        const after = await inspectMigrationSeedAdmin(client);
        assert.equal(after.state, 'exact');
      } finally {
        client.release();
      }
    });
  }

  await resetSeedAdmin();
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
  console.error('[seed-admin-atomicity.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  process.exitCode = 1;
});
