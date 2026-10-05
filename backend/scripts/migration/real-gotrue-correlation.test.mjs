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
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { verifyReadBack, jsonPathEqual } from './lib/read-back-verify.mjs';
import { migrateOneUser, correlationIdFor } from './migrate-users-to-supabase-auth.mjs';
import { prepareIsolatedStack } from './lib/disposable-supabase-stack.mjs';
import { readBootstrapState } from './lib/bootstrap-allowlist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// The committed stack definition is only a template: every run starts its
// own copy with a unique project_id and random free host ports
// (lib/disposable-supabase-stack.mjs), so it can never collide with another
// stack, a leftover container, or a port the host already holds.
const STACK_TEMPLATE = path.join(REPO_ROOT, 'ops', 'stage2jb-r11-gotrue');
let stack = null;
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
  return spawnSync('npx', ['--yes', SUPABASE_CLI, ...args, '--workdir', stack.workdir], {
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

async function startStack() {
  stack = await prepareIsolatedStack(STACK_TEMPLATE, { prefix: 'r11-gotrue' });
  console.log(`isolated stack: project_id=${stack.projectId} ports=${JSON.stringify(stack.ports)}`);
  const start = runSupabaseCli(['start']);
  if (start.status !== 0) {
    throw new Error(`supabase start failed (exit ${start.status}): ${start.stderr}\n${start.stdout}`);
  }
  const statusRun = runSupabaseCli(['status', '-o', 'env'], { timeout: 60_000 });
  if (statusRun.status !== 0) {
    throw new Error(`supabase status -o env failed (exit ${statusRun.status}): ${statusRun.stderr}\n${statusRun.stdout}`);
  }
  const env = parseEnvOutput(statusRun.stdout);
  if (!env.DB_URL || !env.API_URL || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) {
    throw new Error('supabase status -o env did not produce the expected DB_URL/API_URL/SERVICE_ROLE_KEY/ANON_KEY keys');
  }
  assertLocalHost(env.DB_URL, 'DB_URL');
  assertLocalHost(env.API_URL, 'API_URL');
  return { dbUrl: env.DB_URL, apiUrl: env.API_URL, serviceRoleKey: env.SERVICE_ROLE_KEY, anonKey: env.ANON_KEY };
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
  if (!stack) return;
  runSupabaseCli(['stop', '--no-backup']); // best-effort cleanup, never throws
  const left = spawnSync('docker', ['ps', '-a', '--filter', `name=${stack.projectId}`, '--format', '{{.Names}}'], { encoding: 'utf8' });
  console.log(left.stdout.trim() ? `WARNING: containers left for ${stack.projectId}:
${left.stdout}` : `cleanup verified: no container left for ${stack.projectId}`);
  stack.remove();
  stack = null;
}

async function main() {
  console.log('=== SETUP: disposable real Supabase-CLI stack (real Postgres + real GoTrue + Kong) ===');
  const { dbUrl, apiUrl, serviceRoleKey, anonKey } = await startStack();
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
        password: bcrypt.hashSync(`fixture-${crypto.randomUUID()}`, 4),
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
    // PASSWORD_DECISION=IMPORT_BCRYPT_HASHES, against real GoTrue: the
    // account is created from the source bcrypt hash (the same bcryptjs
    // cost-12 `$2a$` format the old backend writes), and the person signs
    // in with their ORIGINAL password through the normal public endpoint.
    // No password is generated, no reset is sent.
    const anon = () => createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ORIGINAL_PASSWORD = `Original-${crypto.randomUUID()}`;
    const sourceHash = bcrypt.hashSync(ORIGINAL_PASSWORD, 12);

    await test('bcrypt login fixture: the original password signs in after migration; a wrong one is refused', async () => {
      const createdAt = new Date('2025-11-02T09:08:07.654Z');
      const updatedAt = new Date('2026-03-04T05:06:07.890Z');
      const mongoUser = {
        _id: `bcrypt-login-${crypto.randomUUID()}`,
        email: `bcrypt-login-${crypto.randomUUID()}@example.invalid`,
        role: 'student',
        name: 'Bcrypt Login Fixture',
        password: sourceHash,
        createdAt,
        updatedAt,
      };
      const result = await migrateOneUser(supabaseAdmin, client, mongoUser, { execute: true });
      assert.equal(result.status, 'created', result.message);
      assert.equal(result.emailConfirmationBasis, 'source_had_no_verification_step');

      const authRow = await client.query('SELECT encrypted_password, email_confirmed_at FROM auth.users WHERE id = $1', [result.id]);
      assert.equal(authRow.rows[0].encrypted_password, sourceHash, 'GoTrue stores the imported hash verbatim -- nothing re-hashed or generated');
      assert.ok(authRow.rows[0].email_confirmed_at, 'confirmed per the source-data contract (the old system had no verification step)');

      const ok = await anon().auth.signInWithPassword({ email: mongoUser.email, password: ORIGINAL_PASSWORD });
      assert.equal(ok.error, null, `the original password must sign in: ${ok.error?.message}`);
      assert.ok(ok.data.session?.access_token, 'a real session is issued');
      assert.equal(ok.data.user.id, result.id);

      const bad = await anon().auth.signInWithPassword({ email: mongoUser.email, password: `${ORIGINAL_PASSWORD}-wrong` });
      assert.ok(bad.error, 'a wrong password must be refused');
      assert.equal(bad.data.session, null);

      const profile = await client.query('SELECT created_at, updated_at FROM profiles WHERE id = $1', [result.id]);
      assert.equal(profile.rows[0].created_at.toISOString(), createdAt.toISOString(), 'profiles.created_at is the source createdAt');
      assert.equal(profile.rows[0].updated_at.toISOString(), updatedAt.toISOString(), 'profiles.updated_at is the source updatedAt, not the trigger stamp');
    });

    await test('bcrypt login fixture: $2b$ and $2y$ spellings of the same hash also import and sign in', async () => {
      for (const prefix of ['$2b$', '$2y$']) {
        const mongoUser = {
          _id: `bcrypt-variant-${crypto.randomUUID()}`,
          email: `bcrypt-variant-${crypto.randomUUID()}@example.invalid`,
          role: 'student',
          password: `${prefix}${sourceHash.slice(4)}`,
        };
        const result = await migrateOneUser(supabaseAdmin, client, mongoUser, { execute: true });
        assert.equal(result.status, 'created', `${prefix}: ${result.message}`);
        const ok = await anon().auth.signInWithPassword({ email: mongoUser.email, password: ORIGINAL_PASSWORD });
        assert.equal(ok.error, null, `${prefix}: the original password must sign in: ${ok.error?.message}`);
      }
    });

    await test('no importable hash -> no account at all (never a generated password)', async () => {
      const email = `bcrypt-missing-${crypto.randomUUID()}@example.invalid`;
      const result = await migrateOneUser(supabaseAdmin, client, { _id: `bcrypt-missing-${crypto.randomUUID()}`, email, role: 'student' }, { execute: true });
      assert.equal(result.status, 'error');
      assert.match(result.message, /no importable bcrypt password hash/);
      const rows = await client.query('SELECT 1 FROM auth.users WHERE email = $1', [email]);
      assert.equal(rows.rows.length, 0, 'no GoTrue account was created');
    });

    // SUPER_ADMIN_SAFETY_GATE on the real GoTrue auth schema: the approved
    // Super Admin's row fingerprints must not change because the owner
    // signs in (last_sign_in_at, sessions, refresh tokens), but must change
    // when the account itself changes (here: a ban).
    await test('bootstrap allowlist on real GoTrue: Super Admin fingerprints survive a real sign-in, and a ban changes them', async () => {
      const email = `super-admin-${crypto.randomUUID()}@example.invalid`;
      const password = crypto.randomBytes(18).toString('base64url');
      const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null, created.error?.message);
      const id = created.data.user.id;
      await client.query(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [id]);
      await client.query(`INSERT INTO admin_role_assignments (user_id, role, assigned_by) VALUES ($1, 'super-admin', NULL)`, [id]);
      const fingerprints = async () => {
        const state = await readBootstrapState(client);
        return {
          authUser: state.authUsers.find((u) => u.id === id)?.fingerprint,
          profile: state.profiles.find((p) => p.id === id)?.fingerprint,
          role: state.roleAssignments.find((r) => r.user_id === id)?.fingerprint,
        };
      };
      const before = await fingerprints();
      for (const [k, v] of Object.entries(before)) assert.match(String(v), /^sha256:[0-9a-f]{64}$/, k);

      const signIn = await anon().auth.signInWithPassword({ email, password });
      assert.equal(signIn.error, null, signIn.error?.message);
      const lastSignIn = await client.query('SELECT last_sign_in_at FROM auth.users WHERE id = $1', [id]);
      assert.ok(lastSignIn.rows[0].last_sign_in_at, 'the sign-in really happened');
      assert.deepEqual(await fingerprints(), before, 'a sign-in must not change the approved fingerprints');

      const ban = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '24h' });
      assert.equal(ban.error, null, ban.error?.message);
      const banned = await fingerprints();
      assert.notEqual(banned.authUser, before.authUser, 'a ban is a change to the approved account');
      assert.equal(banned.role, before.role);
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
