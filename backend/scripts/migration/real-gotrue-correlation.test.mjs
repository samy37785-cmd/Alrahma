#!/usr/bin/env node
// PR #70 review round 11, item 1 -- proves the auth.users read-back fix
// against a REAL, disposable local GoTrue instance (not a hand-seeded
// Postgres row standing in for one). Every other test in this directory
// that exercises migrateOneUser()/migrateOneAdmin() pre-seeds auth.users
// directly (no real createUser() call is ever reached), which is exactly
// why this specific bug went unnoticed for ten review rounds: a real
// GoTrue createUser() call adds `provider`/`providers` to
// `raw_app_meta_data` alongside whatever this migration itself writes --
// no hand-seeded fixture ever had a reason to include those keys, so the
// old whole-object comparison (`raw_app_meta_data: {migration_correlation_
// id: X}`) always happened to match in every previous test, and would
// have failed on every single real account this migration ever actually
// created.
//
// This file owns a real, disposable Supabase-CLI stack
// (ops/stage2jb-r11-gotrue -- see that directory's own README) with real
// Postgres + real GoTrue (Auth) + Kong, started and fully torn down
// (`supabase stop --no-backup`, wiping its Docker volumes) by this file
// alone, exactly like every other Docker-backed test here manages its own
// disposable Mongo/Postgres containers.
//
// Failing-before proof (documented here, not re-run every time this file
// runs -- it requires reconstructing commit b3352de's pre-fix
// read-back-verify.mjs/migrate-users-to-supabase-auth.mjs side by side
// with the current ones, which is a one-time investigative step, not a
// repeatable regression test): running b3352de's own migrateOneUser()
// against this exact real GoTrue stack, for a document with no prior
// state at all, produced:
//   read-back: auth.users row (target_id=...) does not match what this
//   migration just wrote -- raw_app_meta_data (expected
//   {"migration_correlation_id":"..."}, found
//   {"provider":"email","providers":["email"],"migration_correlation_id":"..."})
// i.e. the OLD code failed EVERY real account creation, unconditionally.
// The tests below run the CURRENT (fixed) code against the same real
// stack and confirm it succeeds, and that the fix does not accidentally
// widen into "anything goes" -- wrong/missing/forged correlation still
// fail closed.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { verifyReadBack, jsonPathEqual } from './lib/read-back-verify.mjs';
import { migrateOneUser, correlationIdFor } from './migrate-users-to-supabase-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STACK_WORKDIR = path.join(REPO_ROOT, 'ops', 'stage2jb-r11-gotrue');
const RUN_MIGRATIONS_REAL_GOTRUE = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations-real-gotrue.mjs');
const SUPABASE_CLI = 'supabase@2.116.0';

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

function runSupabaseCli(args, { timeout = 300_000 } = {}) {
  // shell:true is required on Windows, where `npx` is a `.cmd` shim a bare
  // spawnSync cannot exec directly -- every argument here is a fixed,
  // hardcoded literal (never user input), so the well-known shell-arg-
  // escaping caveat that flag implies does not apply.
  return spawnSync('npx', ['--yes', SUPABASE_CLI, ...args, '--workdir', STACK_WORKDIR], {
    shell: true, encoding: 'utf8', timeout,
  });
}

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

// `supabase start`'s OWN stdout format is not something to parse --
// confirmed to vary between environments (a single JSON status line
// locally on one run, a human-readable box-drawing table with no JSON at
// all when this exact same file ran in real GitHub Actions CI). The only
// stable, documented, explicitly-flagged machine-readable output this CLI
// offers is `status -o env` (also what ops/stage2f-authtest's own README
// tells a human operator to run) -- used here instead of ever trying to
// guess at `start`'s own format.
function parseEnvOutput(stdout) {
  const env = {};
  for (const line of stdout.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="((?:[^"\\]|\\.)*)"\s*$/);
    if (m) env[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return env;
}

function startStack() {
  const stopFirst = runSupabaseCli(['stop', '--no-backup']); // best-effort; fine if nothing was running
  void stopFirst;
  const start = runSupabaseCli(['start']);
  if (start.status !== 0) {
    throw new Error(`supabase start failed (exit ${start.status}): ${start.stderr}\n${start.stdout}`);
  }
  const statusRun = runSupabaseCli(['status', '-o', 'env'], { timeout: 60_000 });
  if (statusRun.status !== 0) {
    throw new Error(`supabase status -o env failed (exit ${statusRun.status}): ${statusRun.stderr}\n${statusRun.stdout}`);
  }
  const env = parseEnvOutput(statusRun.stdout);
  if (!env.DB_URL || !env.API_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error(`supabase status -o env did not produce the expected DB_URL/API_URL/SERVICE_ROLE_KEY keys:\n${statusRun.stdout}`);
  }
  assertLocalHost(env.DB_URL, 'DB_URL');
  assertLocalHost(env.API_URL, 'API_URL');
  return { dbUrl: env.DB_URL, apiUrl: env.API_URL, serviceRoleKey: env.SERVICE_ROLE_KEY };
}

function applyRepoSchema(dbUrl) {
  const result = spawnSync(process.execPath, [RUN_MIGRATIONS_REAL_GOTRUE], {
    env: { ...process.env, STAGE2F_AUTHTEST_DB_URL: dbUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`applying lib/db/drizzle to the real GoTrue stack failed (exit ${result.status}): ${result.stderr}\n${result.stdout}`);
  }
}

function stopStack() {
  runSupabaseCli(['stop', '--no-backup']); // best-effort cleanup, never throws
}

async function main() {
  console.log('=== SETUP: disposable real Supabase-CLI stack (real Postgres + real GoTrue + Kong) ===');
  const { dbUrl, apiUrl, serviceRoleKey } = startStack();
  console.log(`stack up: API_URL=${apiUrl}`);
  applyRepoSchema(dbUrl);
  console.log('repo schema applied on top of the real GoTrue-managed auth schema.');

  const supabaseAdmin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  const AUTH_USER_SPEC = { table: 'auth.users' };

  async function createRealUser(email, { appMetadata = {}, userMetadata = {} } = {}) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: `Throwaway${Date.now()}${Math.random()}!`,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (error) throw new Error(`real createUser() failed for ${email}: ${error.message}`);
    return data.user.id;
  }

  try {
    await test('a real GoTrue createUser() call really adds provider/providers to raw_app_meta_data, alongside this migration\'s own key', async () => {
      const email = `r11-provider-check-${crypto.randomUUID()}@example.invalid`;
      const correlationId = crypto.randomUUID();
      const userId = await createRealUser(email, { appMetadata: { migration_correlation_id: correlationId } });
      const { rows } = await client.query('SELECT raw_app_meta_data FROM auth.users WHERE id = $1', [userId]);
      const meta = rows[0].raw_app_meta_data;
      assert.equal(meta.provider, 'email', 'real GoTrue always sets provider on a real created account');
      assert.ok(Array.isArray(meta.providers) && meta.providers.includes('email'), 'real GoTrue always sets providers[] too');
      assert.equal(meta.migration_correlation_id, correlationId, 'this migration\'s own key is still present alongside GoTrue\'s');
    });

    await test('THE FIX, end-to-end: the real, unmodified migrateOneUser() succeeds against a real GoTrue account, despite provider/providers being present', async () => {
      // This is the strongest possible proof: the exact production
      // function, completely unmodified, run against a real GoTrue
      // instance for a document it has never seen before -- exercising
      // createUser() for real, the real trigger-created profiles row,
      // applyPersona(), and the item-1 fix's exact-JSON-path auth.users
      // read-back, all in one real, un-mocked pass.
      const mongoUser = {
        _id: `r11-e2e-${crypto.randomUUID()}`,
        email: `r11-e2e-${crypto.randomUUID()}@example.invalid`,
        role: 'student',
        name: 'Round 11 Real GoTrue E2E',
      };
      const result = await migrateOneUser(supabaseAdmin, client, mongoUser, { execute: true });
      assert.equal(result.status, 'created', result.message);
      const ledger = await client.query(
        `SELECT status FROM migration_source_ledger WHERE source_document_id = $1 AND target_table = 'profiles'`,
        [String(mongoUser._id)]
      );
      assert.equal(ledger.rows[0].status, 'reconciled', 'markReconciled() must have actually run -- this is what b3352de could never reach');
      const authRow = await client.query('SELECT raw_app_meta_data FROM auth.users WHERE id = $1', [result.id]);
      assert.equal(authRow.rows[0].raw_app_meta_data.provider, 'email', 'sanity: this real row really does carry provider, same as every other real account');
    });

    await test('the correct correlation succeeds via a direct verifyReadBack() call too (not only through the full migrateOneUser() pipeline)', async () => {
      const email = `r11-correct-${crypto.randomUUID()}@example.invalid`;
      const correlationId = correlationIdFor({ sourceCollection: 'users', sourceDocumentId: 'r11-direct-1', sourceValue: { email } });
      const userId = await createRealUser(email, { appMetadata: { migration_correlation_id: correlationId } });
      const readBack = await verifyReadBack(client, AUTH_USER_SPEC, userId, {
        id: userId,
        email,
        raw_app_meta_data: jsonPathEqual(['migration_correlation_id'], correlationId),
      });
      assert.equal(readBack.ok, true, readBack.reason);
    });

    await test('wrong correlation fails closed against a real GoTrue-created row', async () => {
      const email = `r11-wrong-${crypto.randomUUID()}@example.invalid`;
      const realCorrelationId = crypto.randomUUID();
      const expectedButWrongId = crypto.randomUUID();
      const userId = await createRealUser(email, { appMetadata: { migration_correlation_id: realCorrelationId } });
      const readBack = await verifyReadBack(client, AUTH_USER_SPEC, userId, {
        id: userId,
        email,
        raw_app_meta_data: jsonPathEqual(['migration_correlation_id'], expectedButWrongId),
      });
      assert.equal(readBack.ok, false);
      assert.match(readBack.reason, /migration_correlation_id/);
    });

    await test('missing correlation (real GoTrue account created with no migration_correlation_id at all) fails closed', async () => {
      const email = `r11-missing-${crypto.randomUUID()}@example.invalid`;
      const userId = await createRealUser(email, { appMetadata: {} }); // real account, real provider/providers, but never touched by this migration
      const readBack = await verifyReadBack(client, AUTH_USER_SPEC, userId, {
        id: userId,
        email,
        raw_app_meta_data: jsonPathEqual(['migration_correlation_id'], crypto.randomUUID()),
      });
      assert.equal(readBack.ok, false);
      assert.match(readBack.reason, /migration_correlation_id/);
    });

    await test('explicit null correlation at the exact path fails closed (not treated as "absent, so skip")', async () => {
      const email = `r11-null-${crypto.randomUUID()}@example.invalid`;
      const userId = await createRealUser(email, { appMetadata: {} });
      // No real createUser() call ever produces a literal JSON null at this
      // path -- simulated directly to prove the comparator itself, not
      // just "key absent", correctly treats null as a real mismatch.
      await client.query(
        `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"migration_correlation_id": null}'::jsonb WHERE id = $1`,
        [userId]
      );
      const readBack = await verifyReadBack(client, AUTH_USER_SPEC, userId, {
        id: userId,
        email,
        raw_app_meta_data: jsonPathEqual(['migration_correlation_id'], crypto.randomUUID()),
      });
      assert.equal(readBack.ok, false);
    });

    await test('user_metadata forgery still fails against a real GoTrue-created row: the correct value in raw_user_meta_data does not forge the check', async () => {
      const email = `r11-forge-${crypto.randomUUID()}@example.invalid`;
      const correctCorrelationId = crypto.randomUUID();
      // Real account: the forge attempt puts the CORRECT value where an
      // account holder's own `supabase.auth.updateUser()` call could
      // reach it (user_metadata), while app_metadata -- the only thing
      // this migration's read-back ever inspects -- carries nothing this
      // migration wrote.
      const userId = await createRealUser(email, {
        appMetadata: {},
        userMetadata: { migration_correlation_id: correctCorrelationId },
      });
      const { rows } = await client.query('SELECT raw_user_meta_data, raw_app_meta_data FROM auth.users WHERE id = $1', [userId]);
      assert.equal(rows[0].raw_user_meta_data.migration_correlation_id, correctCorrelationId, 'sanity: the forged value really is sitting in raw_user_meta_data on this real row');
      assert.equal(rows[0].raw_app_meta_data.migration_correlation_id, undefined, 'sanity: it is genuinely absent from raw_app_meta_data');
      const readBack = await verifyReadBack(client, AUTH_USER_SPEC, userId, {
        id: userId,
        email,
        raw_app_meta_data: jsonPathEqual(['migration_correlation_id'], correctCorrelationId),
      });
      assert.equal(readBack.ok, false, 'raw_user_meta_data must NEVER be consulted -- only raw_app_meta_data is admin-only/unforgeable');
    });
  } finally {
    client.release();
    await pool.end();
    console.log('\n=== CLEANUP: stopping and wiping the disposable real GoTrue stack ===');
    stopStack();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[real-gotrue-correlation.test] FAILED:', err);
  stopStack();
  process.exitCode = 1;
});
