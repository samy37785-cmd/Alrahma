#!/usr/bin/env node
// FIRST_SUPER_ADMIN_RECOVERY, end to end on a REAL, disposable, local
// Supabase stack (Postgres + GoTrue + Kong + the Mailpit mail catcher,
// ops/operator-tools-gotrue): the exact code the owner will run --
// supabase-recover-first-super-admin -- driven through a scripted terminal,
// against the exact situation it exists for: the first-Super-Admin
// bootstrap sent its one invite, nobody accepted it in time, and the link is
// now expired. Nothing here can reach a remote host: every URL comes from
// `supabase status` and is checked to be 127.0.0.1.
//
// It proves, against real GoTrue and the real schema:
//   - the stuck account (invited, aged 9 hours, never used) is exactly the
//     state the tool recovers, and a real read-only state report agrees;
//   - every deviation stops the tool with the database unchanged: a leftover
//     auth audit row, a second auth user, an id that is not the account, a
//     wrong id prefix, a mismatched or weak password, a wrong phrase;
//   - the happy run sets the password and confirms the email of that ONE
//     account: it sends NO email (the Mailpit count is unchanged), creates no
//     user, profile, role, token, session or MFA factor, and signs nobody in;
//   - the expired link stays dead afterwards, the new password then works for
//     a normal sign-in (is_admin), and a second run is refused;
//   - every line the tool printed, every error, and the secrets of the run
//     (password, ids, keys, URLs, the old invite link) never meet.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { prepareIsolatedStack } from '../migration/lib/disposable-supabase-stack.mjs';
import { runBootstrapCli } from './lib/supabase-first-super-admin-bootstrap-core.mjs';
import { runOwnerCli } from './lib/supabase-owner-bootstrap-core.mjs';
import { runRecoveryCli } from './lib/supabase-recover-first-super-admin-core.mjs';
import { readExpectedJournal, runStateReportCli } from './lib/supabase-state-report-core.mjs';
import { createAuthAdmin, createDb } from './supabase-first-super-admin-bootstrap.mjs';
import { createOwnerClient } from './supabase-owner-bootstrap.mjs';
import { createReadOnlyDb, gitFreshness } from './supabase-state-report.mjs';
import { createRecoveryAuthAdmin } from './supabase-recover-first-super-admin.mjs';
import { OperatorError, gitState, makeRedactor } from './lib/operator-io.mjs';
import { scriptedIo, assertNoLeaks } from '../../tests/helpers/operator-fakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STACK_TEMPLATE = path.join(REPO_ROOT, 'ops', 'operator-tools-gotrue');
const RUN_MIGRATIONS_REAL_GOTRUE = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations-real-gotrue.mjs');
const SUPABASE_CLI = 'supabase@2.116.0';

const OWNER_EMAIL = 'dedicated.admin@example.org';
const OTHER_EMAIL = 'someone.else@example.org';
const NEW_PASSWORD = `Recovered-${crypto.randomBytes(6).toString('hex')}-Pass`;
const WEAK_PASSWORD = 'z'.repeat(30);

let stack = null;
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
  // shell:true for the Windows npx shim; every argument is a fixed literal.
  return spawnSync('npx', ['--yes', SUPABASE_CLI, ...args, '--workdir', stack.workdir], { shell: true, encoding: 'utf8', timeout });
}

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`Refusing to run: ${label} host "${host}" is not 127.0.0.1.`);
}

async function startStack() {
  stack = await prepareIsolatedStack(STACK_TEMPLATE, { prefix: 'recover-super-admin' });
  console.log(`isolated stack: project_id=${stack.projectId}`);
  const start = runSupabaseCli(['start']);
  if (start.status !== 0) throw new Error(`supabase start failed (exit ${start.status}): ${start.stderr}`);
  const status = runSupabaseCli(['status', '-o', 'env'], { timeout: 60_000 });
  const env = {};
  for (const line of status.stdout.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="((?:[^"\\]|\\.)*)"\s*$/);
    if (m) env[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  for (const key of ['DB_URL', 'API_URL', 'MAILPIT_URL', 'SERVICE_ROLE_KEY', 'ANON_KEY']) {
    if (!env[key]) throw new Error(`supabase status -o env did not report ${key}`);
  }
  for (const key of ['DB_URL', 'API_URL', 'MAILPIT_URL']) assertLocalHost(env[key], key);
  return env;
}

function stopStack() {
  if (!stack) return;
  runSupabaseCli(['stop', '--no-backup']);
  const left = spawnSync('docker', ['ps', '-a', '--filter', `name=${stack.projectId}`, '--format', '{{.Names}}'], { encoding: 'utf8' });
  console.log(left.stdout.trim() ? `WARNING: containers left for ${stack.projectId}:\n${left.stdout}` : `cleanup verified: no container left for ${stack.projectId}`);
  stack.remove();
  stack = null;
}

async function main() {
  console.log('=== SETUP: disposable real Supabase stack (Postgres + GoTrue + Kong + Mailpit) ===');
  const env = await startStack();
  const schema = spawnSync(process.execPath, [RUN_MIGRATIONS_REAL_GOTRUE], { env: { ...process.env, STAGE2F_AUTHTEST_DB_URL: env.DB_URL }, encoding: 'utf8' });
  if (schema.status !== 0) throw new Error(`applying lib/db/drizzle failed: ${schema.stderr}`);
  console.log('repo schema applied.');

  const pool = new pg.Pool({ connectionString: env.DB_URL });
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];
  const serviceAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const outputs = [];
  const secrets = [OWNER_EMAIL, OTHER_EMAIL, NEW_PASSWORD, WEAK_PASSWORD, env.SERVICE_ROLE_KEY, env.ANON_KEY, env.DB_URL, new URL(env.DB_URL).password];
  const sessionTokens = [];

  const mails = async () => (await (await fetch(`${env.MAILPIT_URL}/api/v1/messages`)).json()).messages ?? [];
  const inviteLinkFor = async (to) => {
    const msg = (await mails()).find((m) => m.To.some((t) => t.Address === to));
    const full = await (await fetch(`${env.MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
    return /href="([^"]+)"/.exec(full.HTML)[1].replace(/&amp;/g, '&');
  };

  // The one-time switches of each tool, exactly as the owner sets them.
  const bootstrapEnv = { ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1', SUPABASE_BOOTSTRAP_TARGET_ENV: 'local', SUPABASE_URL: env.API_URL };
  const recoveryEnv = { ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: '1', SUPABASE_RECOVERY_TARGET_ENV: 'local', SUPABASE_URL: env.API_URL };

  // Setup only: its output is NOT scanned. By design the bootstrap tool prints the new account's full id
  // (SUPER_ADMIN_USER_ID=...); the scan below covers the tool under test and the report/accept tools.
  const bootstrap = (io) => runBootstrapCli({
    argv: ['--apply', '--confirm-create-first-super-admin', '--target=local', '--backup-manifest=synthetic-fresh.json'],
    env: bootstrapEnv, io, redactor: makeRedactor(),
    deps: {
      gitState: () => gitState(REPO_ROOT),
      verifyFreshBackup: () => ({ sha256: 'e'.repeat(64), ageHours: 0.5 }),
      collisionCheck: async () => false,
      createDb, createAuthAdmin,
    },
  });

  let userId = null;
  let prefix = null;
  const contacted = { createAuthAdmin: 0, createDb: 0 };
  const recoverArgv = (p = prefix) => ['--apply', '--confirm-recover-super-admin-account', '--target=local', `--expect-id-prefix=${p}`];
  const recover = async ({ id = userId, password = NEW_PASSWORD, again = password, phrase = null, argv = recoverArgv() } = {}) => {
    const io = scriptedIo({
      hidden: [id, env.DB_URL, env.SERVICE_ROLE_KEY, password, again],
      visible: [phrase ?? `RECOVER SUPER-ADMIN local ${prefix}`],
    });
    const redactor = makeRedactor();
    try {
      const result = await runRecoveryCli({
        argv, env: recoveryEnv, io, redactor,
        deps: {
          gitState: () => gitState(REPO_ROOT),
          createDb: (u) => { contacted.createDb++; return createReadOnlyDb(u); },
          createAuthAdmin: (u, k) => { contacted.createAuthAdmin++; return createRecoveryAuthAdmin(u, k); },
        },
      });
      return { ...result, io };
    } catch (error) {
      return { error, io };
    } finally {
      outputs.push(...io.log);
    }
  };
  const expectStop = (r, code, pattern = null) => {
    assert.ok(r.error instanceof OperatorError, `expected ${code}, got ${r.error ? `${r.error.name}: ${r.error.message}` : `success ${JSON.stringify(r.status)}`}`);
    assert.equal(r.error.code, code, r.error.message);
    if (pattern) assert.match(r.error.message, pattern);
    outputs.push(r.error.message);
  };
  const accept = async (link, password) => {
    const redactor = makeRedactor();
    const io = scriptedIo({ hidden: [env.ANON_KEY, link, password, password] });
    try {
      return await runOwnerCli({
        argv: ['accept-invite', '--target=local', `--expect-user-id=${userId}`],
        env: bootstrapEnv, io, redactor,
        deps: { gitState: () => gitState(REPO_ROOT), createClient: (url, key) => createOwnerClient(url, key), renderQr: async () => '' },
      });
    } catch (error) {
      return { error };
    }
    // io.log is not scanned: accept-invite prints the --expect-user-id it is given, by its own design.
  };
  const stateReport = async () => {
    const io = scriptedIo({ hidden: [env.DB_URL] });
    try {
      await runStateReportCli({
        argv: ['--target=local'], env: { SUPABASE_URL: env.API_URL }, io, redactor: makeRedactor(),
        deps: { gitState: () => gitFreshness(REPO_ROOT), createDb: createReadOnlyDb, expectedJournal: () => readExpectedJournal(REPO_ROOT) },
      });
    } finally {
      outputs.push(...io.log);
    }
    return io.log.join('\n');
  };
  // Everything the tool must NOT touch: whole auth.users rows (but updated_at, which GoTrue sets itself, is compared
  // separately), profiles, role rows, plans, audit, MFA, sessions, and the number of emails.
  const world = async () => ({
    users: (await q('select count(*)::int as n from auth.users'))[0].n,
    profiles: await q('select * from public.profiles order by id'),
    roles: await q('select * from public.admin_role_assignments order by user_id'),
    identities: await q('select user_id::text, provider, (identity_data - \'email_verified\' - \'phone_verified\') as data from auth.identities order by 1'),
    sessions: (await q('select count(*)::int as n from auth.sessions'))[0].n,
    mfa: (await q('select count(*)::int as n from auth.mfa_factors'))[0].n,
    plans: (await q('select count(*)::int as n from public.plans'))[0].n,
    auditLog: (await q('select count(*)::int as n from public.admin_audit_log'))[0].n,
    mails: (await mails()).length,
  });
  const userRow = async () => one(
    `select email_confirmed_at is not null as confirmed, last_sign_in_at is not null as signed_in, coalesce(encrypted_password, '') <> '' as has_password,
            banned_until is not null as banned, invited_at is not null as invited, email = $2 as email_unchanged
       from auth.users where id = $1`,
    [userId, OWNER_EMAIL]
  );
  const tokensFor = async () => (await one(`select count(*)::int as n from auth.one_time_tokens where user_id = $1`, [userId])).n;

  let oldInviteLink = null;
  let stuck = null;

  try {
    await test('setup: the first-Super-Admin bootstrap sends its ONE invite; 9 hours later it is expired and unused', async () => {
      const io = scriptedIo({ hidden: [OWNER_EMAIL, OWNER_EMAIL, env.DB_URL, env.SERVICE_ROLE_KEY], visible: ['INVITE SUPER-ADMIN local'] });
      const r = await bootstrap(io);
      assert.equal(r.status, 'success');
      userId = r.userId;
      prefix = userId.slice(0, 8);
      assert.equal((await mails()).length, 1);
      oldInviteLink = await inviteLinkFor(OWNER_EMAIL);
      secrets.push(oldInviteLink, new URL(oldInviteLink).searchParams.get('token'), userId);
      await pool.query(
        `update auth.users set invited_at = now() - interval '9 hours', confirmation_sent_at = now() - interval '9 hours', created_at = created_at - interval '9 hours' where id = $1`,
        [userId]
      );
      await pool.query(`update auth.one_time_tokens set created_at = now() - interval '9 hours', updated_at = now() - interval '9 hours' where user_id = $1`, [userId]);
      assert.deepEqual(await userRow(), { confirmed: false, signed_in: false, has_password: false, banned: false, invited: true, email_unchanged: true });
      assert.equal(await tokensFor(), 1, 'the expired invite token is still stored');
    });

    await test('state report agrees: INVITE_PENDING_NOT_USED and INVITE_LIKELY_EXPIRED=true', async () => {
      const text = await stateReport();
      for (const expected of ['AUTH_USERS=1', `id_prefix=${prefix}`, 'INVITE_STATE=INVITE_PENDING_NOT_USED', 'INVITE_LIKELY_EXPIRED=true', 'SUPER_ADMIN_ASSIGNMENT_COUNT=1 ADMIN_PROFILES=1']) {
        assert.ok(text.includes(expected), `report lacks ${expected}`);
      }
    });

    await test('the real GoTrue wrote an audit row for the invite: the tool refuses (AUTH_AUDIT_ROWS) and changes nothing', async () => {
      // Production reports AUTH_AUDIT_ROWS=0 (hosted projects keep no rows in auth.audit_log_entries); this local stack does.
      const audit = (await one(`select count(*)::int as n from auth.audit_log_entries where payload->>'actor_id' = $1 or payload->'traits'->>'user_id' = $1`, [userId])).n;
      assert.ok(audit >= 1, 'the local GoTrue audited the invite');
      const before = await world();
      const r = await recover();
      expectStop(r, 'STATE_MISMATCH', new RegExp(`AUTH_AUDIT_ROWS=${audit}`));
      assert.deepEqual(await world(), before);
      assert.deepEqual(contacted, { createAuthAdmin: 0, createDb: 1 }, 'the Auth Admin client was never created');
    });

    // From here on the stack matches production's reported state: no audit rows for the account.
    await pool.query('delete from auth.audit_log_entries');

    await test('stops with nothing changed: wrong id prefix, an id that is not the account, a second auth user', async () => {
      const before = await world();
      const row = await userRow();
      let r = await recover({ argv: recoverArgv('00000000') });
      expectStop(r, 'ACCOUNT_ID_MISMATCH');

      const strangerId = `${prefix}-0000-4000-8000-000000000000`;
      r = await recover({ id: strangerId });
      expectStop(r, 'STATE_MISMATCH', /ACCOUNT_EXISTS=NO/);
      secrets.push(strangerId);

      const { data } = await serviceAdmin.auth.admin.createUser({ email: OTHER_EMAIL, password: crypto.randomUUID(), email_confirm: true });
      r = await recover();
      expectStop(r, 'STATE_MISMATCH', /AUTH_USERS=2/);
      await serviceAdmin.auth.admin.deleteUser(data.user.id);

      assert.deepEqual(await userRow(), row);
      assert.deepEqual(await world(), before);
    });

    await test('stops with nothing changed: a different role, a banned account', async () => {
      const before = await world();
      const bad = [
        [`update public.admin_role_assignments set role = 'admin' where user_id = $1`, `update public.admin_role_assignments set role = 'super-admin' where user_id = $1`, /ADMIN_ROLE=admin/],
        [`update auth.users set banned_until = now() + interval '1 day' where id = $1`, `update auth.users set banned_until = null where id = $1`, /BANNED=YES/],
      ];
      for (const [breakIt, fixIt, pattern] of bad) {
        await pool.query(breakIt, [userId]);
        try {
          expectStop(await recover(), 'STATE_MISMATCH', pattern);
        } finally {
          await pool.query(fixIt, [userId]);
        }
      }
      assert.deepEqual(await world(), before);
    });

    await test('stops before the write, nothing changed: password typed differently, too weak, or wrong phrase', async () => {
      const before = await world();
      expectStop(await recover({ again: `${NEW_PASSWORD}x` }), 'PASSWORD_MISMATCH');
      expectStop(await recover({ password: WEAK_PASSWORD }), 'PASSWORD_TOO_SIMPLE');
      expectStop(await recover({ phrase: `RECOVER SUPER-ADMIN local ${prefix} ` + 'x' }), 'NOT_CONFIRMED');
      assert.deepEqual(await world(), before);
      assert.deepEqual(await userRow(), { confirmed: false, signed_in: false, has_password: false, banned: false, invited: true, email_unchanged: true });
      assert.equal(contacted.createAuthAdmin, 0, 'no Auth Admin client has been created in any refused run');
    });

    let before;
    await test('the recovery: ONE admin call sets the password and confirms the email; no email, no user, no role, no session, no sign-in', async () => {
      before = await world();
      const r = await recover();
      assert.equal(r.error, undefined, r.error?.message);
      assert.equal(r.status, 'success');
      assert.equal(contacted.createAuthAdmin, 1);
      assert.ok(r.io.log.includes('RECOVERY_APPLIED=YES PASSWORD_SET=YES EMAIL_CONFIRMED=YES INVITES_SENT=0'));
      for (const line of [
        `USER_ID_PREFIX=${prefix} ACCOUNT_EXISTS=YES`,
        'AUTH_USERS=1 ADMIN_PROFILES=1 SUPER_ADMIN_ASSIGNMENTS=1',
        'EMAIL_CONFIRMED=YES LAST_SIGN_IN_PRESENT=NO HAS_PASSWORD=YES',
      ]) assert.ok(r.io.log.includes(line), `missing: ${line}`);

      assert.deepEqual(await userRow(), { confirmed: true, signed_in: false, has_password: true, banned: false, invited: true, email_unchanged: true });
      stuck = await world();
      assert.deepEqual(stuck, before, 'users, profiles, role rows, identities, sessions, MFA, plans, audit and the number of emails are all unchanged');
      assert.equal(stuck.mails, 1, 'no email was sent: Mailpit still holds only the original invite');
    });

    await test('what is left of the expired invite token (observation for the report)', async () => {
      const n = await tokensFor();
      console.log(`    one_time_tokens rows for the account after recovery: ${n}`);
      assert.ok(n === 0 || n === 1);
    });

    await test('state report after: CONFIRMED_NEVER_SIGNED_IN, has_password, role rows untouched', async () => {
      const text = await stateReport();
      for (const expected of ['EMAIL_CONFIRMED=YES', 'LAST_SIGN_IN_PRESENT=NO', 'has_password=true', 'INVITE_STATE=CONFIRMED_NEVER_SIGNED_IN', 'sessions=0', 'profile_role=admin', 'admin_roles=super-admin', 'SUPER_ADMIN_ASSIGNMENT_COUNT=1 ADMIN_PROFILES=1']) {
        assert.ok(text.includes(expected), `report lacks ${expected}`);
      }
    });

    await test('the expired invite link stays dead: it cannot sign anybody in, set a password or revive the account', async () => {
      const r = await accept(oldInviteLink, `${NEW_PASSWORD}-other`);
      assert.ok(r.error instanceof OperatorError, 'the old link was refused');
      outputs.push(r.error.message);
      assert.equal((await userRow()).signed_in, false);
      assert.equal((await one('select count(*)::int as n from auth.sessions where user_id = $1', [userId])).n, 0);
      secrets.push(`${NEW_PASSWORD}-other`);
    });

    await test('the new password works for a normal sign-in: is_admin is true; then every session is signed out', async () => {
      const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: OWNER_EMAIL, password: NEW_PASSWORD });
      assert.equal(error, null, error?.message);
      assert.equal(data.user.id, userId);
      sessionTokens.push(data.session.access_token, data.session.refresh_token);
      assert.equal((await anon.rpc('is_admin')).data, true);
      await anon.auth.signOut({ scope: 'global' });
      assert.equal((await one('select count(*)::int as n from auth.sessions where user_id = $1', [userId])).n, 0);
    });

    await test('a second run is refused (state no longer matches): the password is not touched again', async () => {
      const hash = (await one('select encrypted_password from auth.users where id = $1', [userId])).encrypted_password;
      const r = await recover({ password: `${NEW_PASSWORD}-second` });
      expectStop(r, 'STATE_MISMATCH', /EMAIL_CONFIRMED=YES/);
      assert.equal((await one('select encrypted_password from auth.users where id = $1', [userId])).encrypted_password, hash);
      secrets.push(`${NEW_PASSWORD}-second`);
    });

    await test('PII/secret scan: every printed line and error holds no email, password, id, key, URL, invite link or session token', async () => {
      const checked = assertNoLeaks(outputs, [...secrets, ...sessionTokens], 'tool output');
      assert.ok(checked >= 10, `only ${checked} secret values were checked`);
      assert.ok(outputs.length > 30, 'the scan covered the runs');
      assert.ok(!outputs.some((o) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(o)), 'no email-shaped text at all');
      console.log(`    PII_LOG_SCAN: ${outputs.length} outputs x ${checked} secret values -> 0 hits`);
    });
  } finally {
    await pool.end();
  }
}

main()
  .catch((err) => {
    results.push({ name: 'harness', pass: false, err });
    console.error('[test] harness crashed:', err);
  })
  .finally(() => {
    console.log('\n=== CLEANUP ===');
    try {
      stopStack();
    } catch (err) {
      console.error('cleanup failed:', err.message);
      process.exitCode = 1;
    }
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed.`);
    if (failed.length > 0 || results.length === 0) process.exitCode = 1;
  });
