#!/usr/bin/env node
// SECURE_SUPER_ADMIN_OPERATOR_TOOL, end to end on a REAL, disposable,
// local Supabase stack (Postgres + GoTrue + Kong + the Mailpit mail
// catcher, ops/operator-tools-gotrue): the exact code the owner will run --
// supabase-first-super-admin-bootstrap, supabase-owner-bootstrap
// (accept-invite, run) and the bootstrap-manifest collector -- driven
// through a scripted terminal. Nothing here can reach a remote host: every
// URL comes from `supabase status` and is checked to be 127.0.0.1.
//
// It proves, against real GoTrue and the real schema:
//   - a conflicting email (Mongo source) stops the bootstrap before Supabase
//     is contacted; an existing user (same mailbox) stops it with nothing
//     changed; the happy run sends exactly ONE invite email (read from
//     Mailpit), and a second run sends none;
//   - the invite link from that real email is accepted by the owner tool,
//     a password typo first does not burn it, and a used link is refused;
//   - an AAL1 session is refused by create_plan_version();
//   - a wrong TOTP code (3x), an account whose role is not super-admin, and
//     a pre-existing plan all stop with 0 plans created and nothing changed;
//   - the happy run creates exactly the canonical three plans on an AAL2
//     session, with exactly their three audit rows, and signs out;
//   - the collector's candidate from that state is admitted exactly by the
//     bootstrap allowlist (#206), and holds no email or secret;
//   - every line every tool printed, every error, and the candidate are
//     free of the emails, passwords, keys, URLs, links, TOTP secrets and
//     session tokens of the run.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import speakeasy from 'speakeasy';
import { prepareIsolatedStack } from '../migration/lib/disposable-supabase-stack.mjs';
import { hasEmailConflict } from '../migration/lib/email-collision.mjs';
import { CANONICAL_PLANS } from '../migration/lib/plan-catalog.mjs';
import { catalogMismatch, compareBootstrapState, readBootstrapState } from '../migration/lib/bootstrap-allowlist.mjs';
import { collectCandidate, resolveCollectDbUrl } from '../migration/bootstrap-manifest.mjs';
import { runBootstrapCli } from './lib/supabase-first-super-admin-bootstrap-core.mjs';
import { runOwnerCli, canonicalPlanVersionParams } from './lib/supabase-owner-bootstrap-core.mjs';
import { createAuthAdmin, createDb } from './supabase-first-super-admin-bootstrap.mjs';
import { createOwnerClient, renderTerminalQr } from './supabase-owner-bootstrap.mjs';
import { OperatorError, gitState, makeRedactor } from './lib/operator-io.mjs';
import { scriptedIo, assertNoLeaks } from '../../tests/helpers/operator-fakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STACK_TEMPLATE = path.join(REPO_ROOT, 'ops', 'operator-tools-gotrue');
const RUN_MIGRATIONS_REAL_GOTRUE = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations-real-gotrue.mjs');
const SUPABASE_CLI = 'supabase@2.116.0';

const SOURCE_EMAILS = new Set(['learner.one@gmail.com', 'payer@example.net']);
const CONFLICT_EMAIL = 'Learner.One+admin@googlemail.com';
const EXISTING_EMAIL = 'existing.user@example.org';
const EXISTING_VARIANT = 'Existing.User+admin@example.org';
const OWNER_EMAIL = 'dedicated.admin@example.org';
const SECOND_EMAIL = 'second.admin@example.org';
const OWNER_PASSWORD = `owner-pass-${crypto.randomBytes(6).toString('hex')}`;
const SECOND_PASSWORD = `second-pass-${crypto.randomBytes(6).toString('hex')}`;

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
  stack = await prepareIsolatedStack(STACK_TEMPLATE, { prefix: 'operator-tools' });
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

  // Everything any tool printed or threw, and every secret of the run, for the final scan.
  const outputs = [];
  const secrets = [
    CONFLICT_EMAIL, EXISTING_EMAIL, EXISTING_VARIANT, OWNER_EMAIL, SECOND_EMAIL, ...SOURCE_EMAILS, OWNER_PASSWORD, SECOND_PASSWORD,
    env.SERVICE_ROLE_KEY, env.ANON_KEY, env.DB_URL, new URL(env.DB_URL).password,
  ];
  const sessionTokens = [];
  const totpSecrets = [];

  const mails = async () => (await (await fetch(`${env.MAILPIT_URL}/api/v1/messages`)).json()).messages ?? [];
  const inviteLinkFor = async (to) => {
    const msg = (await mails()).find((m) => m.To.some((t) => t.Address === to));
    const full = await (await fetch(`${env.MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
    return /href="([^"]+)"/.exec(full.HTML)[1].replace(/&amp;/g, '&');
  };
  const lastCodes = new Map();
  const totpFor = async (secret) => {
    // A fresh 30s window per verification of the same secret.
    for (;;) {
      const code = speakeasy.totp({ secret, encoding: 'base32' });
      if (lastCodes.get(secret) !== code) {
        lastCodes.set(secret, code);
        return code;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  const secretFromScreen = (io) => {
    const m = /Setup key, only if the QR code does not scan: ([A-Z2-7]+)/.exec(io.sensitive.at(-1) ?? '');
    if (!m) throw new Error('no setup key was shown');
    totpSecrets.push(m[1]);
    return m[1];
  };

  const toolEnv = { ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1', SUPABASE_BOOTSTRAP_TARGET_ENV: 'local', SUPABASE_URL: env.API_URL };
  const contacted = { createDb: 0, createAuthAdmin: 0 };
  const bootstrap = async (io, { withBackup = true } = {}) => {
    const redactor = makeRedactor();
    const argv = ['--apply', '--confirm-create-first-super-admin', '--target=local', ...(withBackup ? ['--backup-manifest=synthetic-fresh.json'] : [])];
    try {
      return await runBootstrapCli({
        argv, env: toolEnv, io, redactor,
        deps: {
          gitState: () => gitState(REPO_ROOT),
          verifyFreshBackup: () => ({ sha256: 'e'.repeat(64), ageHours: 0.5 }),
          // The Mongo restore itself is covered by super-admin-email-collision.test.mjs.
          collisionCheck: async ({ candidateEmail }) => hasEmailConflict(candidateEmail, SOURCE_EMAILS),
          createDb: (u) => { contacted.createDb++; return createDb(u); },
          createAuthAdmin: (u, k) => { contacted.createAuthAdmin++; return createAuthAdmin(u, k); },
        },
      });
    } catch (err) {
      return { error: err };
    } finally {
      outputs.push(...io.log);
    }
  };
  const owner = async (argv, io) => {
    const redactor = makeRedactor();
    try {
      return await runOwnerCli({
        argv, env: toolEnv, io, redactor,
        deps: {
          gitState: () => gitState(REPO_ROOT),
          createClient: (url, key) => {
            const c = createOwnerClient(url, key);
            c.auth.onAuthStateChange((_e, s) => { if (s) sessionTokens.push(s.access_token, s.refresh_token); });
            return c;
          },
          renderQr: renderTerminalQr,
        },
      });
    } catch (err) {
      return { error: err };
    } finally {
      outputs.push(...io.log);
    }
  };
  const expectStop = (r, code) => {
    assert.ok(r.error instanceof OperatorError, `expected ${code}, got ${r.error ? `${r.error.name}: ${r.error.message}` : `success ${JSON.stringify(r)}`}`);
    assert.equal(r.error.code, code, r.error.message);
    outputs.push(r.error.message);
  };
  const bootstrapIo = (email, phrase = 'INVITE SUPER-ADMIN local') => scriptedIo({ hidden: [email, email, env.DB_URL, env.SERVICE_ROLE_KEY], visible: [phrase] });
  const counts = async () => one(`select
      (select count(*)::int from auth.users) as users,
      (select count(*)::int from public.admin_role_assignments) as roles,
      (select count(*)::int from public.plans) as plans,
      (select count(*)::int from public.admin_audit_log) as audit`);

  let ownerId = null;
  let inviteLink = null;
  let ownerTotpSecret = null;
  const ownerRunArgv = () => ['run', '--target=local', `--expect-user-id=${ownerId}`, '--confirm-create-canonical-plans'];
  const acceptArgv = () => ['accept-invite', '--target=local', `--expect-user-id=${ownerId}`];

  try {
    await test('bootstrap: a conflicting email (same mailbox as a Mongo source email) stops before Supabase is contacted', async () => {
      const io = scriptedIo({ hidden: [CONFLICT_EMAIL, CONFLICT_EMAIL] });
      const r = await bootstrap(io);
      expectStop(r, 'EMAIL_CONFLICT');
      assert.ok(io.log.includes('SUPER_ADMIN_EMAIL_CONFLICT=YES'));
      assert.deepEqual(contacted, { createDb: 0, createAuthAdmin: 0 });
      assert.deepEqual(await counts(), { users: 0, roles: 0, plans: 0, audit: 0 });
      assert.equal((await mails()).length, 0);
    });

    await test('bootstrap: an existing user (same mailbox, +tag) stops with that account unchanged and no invite', async () => {
      const { data, error } = await serviceAdmin.auth.admin.createUser({ email: EXISTING_EMAIL, password: crypto.randomUUID(), email_confirm: true });
      assert.equal(error, null);
      const before = await one('select role from public.profiles where id = $1', [data.user.id]);
      const r = await bootstrap(bootstrapIo(EXISTING_VARIANT));
      expectStop(r, 'EXISTING_ACCOUNT');
      assert.deepEqual(await one('select role from public.profiles where id = $1', [data.user.id]), before);
      assert.equal((await counts()).roles, 0);
      assert.equal((await mails()).length, 0);
      await serviceAdmin.auth.admin.deleteUser(data.user.id);
    });

    await test('bootstrap: SUPER_ADMIN_EMAIL_CONFLICT=NO, projectRef/gitSha shown, typed phrase, exactly ONE real invite email', async () => {
      const io = bootstrapIo(OWNER_EMAIL);
      const r = await bootstrap(io);
      assert.equal(r.error, undefined, r.error?.message);
      assert.equal(r.status, 'success');
      ownerId = r.userId;
      assert.ok(io.log.includes('SUPER_ADMIN_EMAIL_CONFLICT=NO'));
      assert.ok(io.log.some((l) => /projectRef=local gitSha=[0-9a-f]{40}/.test(l)));
      assert.ok(io.log.includes(`SUPER_ADMIN_USER_ID=${ownerId}`) && io.log.includes('INVITES_SENT=1'));
      const u = await one('select invited_at, email_confirmed_at, encrypted_password from auth.users where id = $1', [ownerId]);
      assert.ok(u.invited_at && !u.email_confirmed_at, 'invited, not yet accepted');
      assert.ok(!u.encrypted_password, 'no password exists yet');
      assert.deepEqual(await one('select role from public.profiles where id = $1', [ownerId]), { role: 'admin' });
      assert.deepEqual(await q('select user_id::text, role::text, assigned_by from public.admin_role_assignments'), [{ user_id: ownerId, role: 'super-admin', assigned_by: null }]);
      const sent = await mails();
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].To.map((t) => t.Address), [OWNER_EMAIL]);
      inviteLink = await inviteLinkFor(OWNER_EMAIL);
      secrets.push(inviteLink, new URL(inviteLink).searchParams.get('token'));
    });

    await test('bootstrap, duplicate invite: a second run stops at EXISTING_ADMIN_FOUND; still one email, one account', async () => {
      const r = await bootstrap(bootstrapIo(OWNER_EMAIL));
      expectStop(r, 'EXISTING_ADMIN_FOUND');
      assert.equal((await mails()).length, 1);
      assert.deepEqual(await counts(), { users: 1, roles: 1, plans: 0, audit: 0 });
    });

    await test('accept-invite: a password typo stops BEFORE the one-time link is used', async () => {
      const r = await owner(acceptArgv(), scriptedIo({ hidden: [env.ANON_KEY, inviteLink, OWNER_PASSWORD, `${OWNER_PASSWORD}x`] }));
      expectStop(r, 'PASSWORD_MISMATCH');
      assert.equal((await one('select email_confirmed_at from auth.users where id = $1', [ownerId])).email_confirmed_at, null);
    });

    await test('accept-invite: the real email link is verified, the password set, every session signed out', async () => {
      const io = scriptedIo({ hidden: [env.ANON_KEY, inviteLink, OWNER_PASSWORD, OWNER_PASSWORD] });
      const r = await owner(acceptArgv(), io);
      assert.equal(r.error, undefined, r.error?.message);
      assert.ok(io.log.includes(`INVITE_ACCEPTED=YES user_id=${ownerId}`) && io.log.includes('PASSWORD_SET=YES') && io.log.some((l) => l.startsWith('LOGOUT=OK')));
      const u = await one('select email_confirmed_at, encrypted_password is not null as has_pw from auth.users where id = $1', [ownerId]);
      assert.ok(u.email_confirmed_at && u.has_pw);
      assert.equal((await one('select count(*)::int as n from auth.sessions where user_id = $1', [ownerId])).n, 0);
    });

    await test('accept-invite: the used link is refused', async () => {
      const r = await owner(acceptArgv(), scriptedIo({ hidden: [env.ANON_KEY, inviteLink, OWNER_PASSWORD, OWNER_PASSWORD] }));
      expectStop(r, 'INVITE_LINK_REJECTED');
    });

    await test('AAL1 is refused by create_plan_version() on the real database', async () => {
      const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
      assert.equal(error, null);
      sessionTokens.push(data.session.access_token, data.session.refresh_token);
      const aal1 = await anon.rpc('create_plan_version', canonicalPlanVersionParams()[0]);
      assert.match(aal1.error?.message ?? '', /not an AAL2-verified admin/);
      await anon.auth.signOut({ scope: 'global' });
      assert.deepEqual(await counts(), { users: 1, roles: 1, plans: 0, audit: 0 });
    });

    await test('run: a wrong TOTP code 3 times -> MFA_VERIFY_FAILED, the new factor removed, QR cleared, 0 plans, signed out', async () => {
      const io = scriptedIo({ hidden: [env.ANON_KEY, OWNER_EMAIL, OWNER_PASSWORD], visible: ['CREATE CANONICAL PLANS local', '000000', '000001', '000002'] });
      const r = await owner(ownerRunArgv(), io);
      expectStop(r, 'MFA_VERIFY_FAILED');
      secretFromScreen(io);
      assert.ok(io.events.indexOf('clearSensitive') > io.events.indexOf('showSensitive'));
      assert.equal((await one('select count(*)::int as n from auth.mfa_factors where user_id = $1', [ownerId])).n, 0);
      assert.equal((await one('select count(*)::int as n from auth.sessions where user_id = $1', [ownerId])).n, 0);
      assert.deepEqual(await counts(), { users: 1, roles: 1, plans: 0, audit: 0 });
    });

    await test("run: an account whose role is 'admin', not super-admin, is refused after AAL2 with 0 plans", async () => {
      const { data } = await serviceAdmin.auth.admin.createUser({ email: SECOND_EMAIL, password: SECOND_PASSWORD, email_confirm: true });
      const secondId = data.user.id;
      await pool.query(`update public.profiles set role = 'admin' where id = $1`, [secondId]);
      await pool.query(`insert into public.admin_role_assignments (user_id, role, assigned_by) values ($1, 'admin', null)`, [secondId]);
      let secret = null;
      const io = scriptedIo({
        hidden: [env.ANON_KEY, SECOND_EMAIL, SECOND_PASSWORD],
        visible: ['CREATE CANONICAL PLANS local', async () => totpFor(secret ?? (secret = secretFromScreen(io)))],
      });
      const r = await owner(['run', '--target=local', `--expect-user-id=${secondId}`, '--confirm-create-canonical-plans'], io);
      expectStop(r, 'ROLE_NOT_SUPER_ADMIN');
      assert.ok(io.log.includes('SESSION=aal2'), 'it reached AAL2 before the role check refused it');
      assert.equal((await counts()).plans, 0);
      await pool.query('delete from public.admin_role_assignments where user_id = $1', [secondId]);
      await serviceAdmin.auth.admin.deleteUser(secondId);
    });

    await test('run: a pre-existing plan (different from the catalog) stops before MFA; nothing created or changed', async () => {
      const [plan] = await q(`insert into public.plans (slug, name, amount_minor, currency, billing_interval, active, display_order, version)
        values ('Starter', 'Starter', 6000, 'EUR', 'month', true, 0, 1) returning to_jsonb(plans.*) as row`);
      const io = scriptedIo({ hidden: [env.ANON_KEY, OWNER_EMAIL, OWNER_PASSWORD], visible: ['CREATE CANONICAL PLANS local'] });
      const r = await owner(ownerRunArgv(), io);
      expectStop(r, 'PLANS_ALREADY_EXIST');
      assert.deepEqual(await q('select to_jsonb(plans.*) as row from public.plans'), [plan], 'the existing plan is untouched');
      assert.equal((await one('select count(*)::int as n from auth.mfa_factors where user_id = $1', [ownerId])).n, 0, 'no MFA factor was enrolled');
      assert.equal((await counts()).audit, 0);
      await pool.query('delete from public.plans');
    });

    await test('run, happy path: one sign-in, TOTP enrolled + verified (QR cleared), AAL2, super-admin, the 3 canonical plans, 3 audit rows, logout', async () => {
      const io = scriptedIo({
        hidden: [env.ANON_KEY, OWNER_EMAIL, OWNER_PASSWORD],
        visible: ['CREATE CANONICAL PLANS local', async () => totpFor(ownerTotpSecret ?? (ownerTotpSecret = secretFromScreen(io)))],
      });
      const r = await owner(ownerRunArgv(), io);
      assert.equal(r.error, undefined, r.error?.message);
      assert.equal(r.status, 'success');
      assert.ok(io.events.indexOf('clearSensitive') > io.events.indexOf('showSensitive'), 'the QR was cleared after verification');
      for (const line of [`OWNER_USER_ID=${ownerId}`, 'SESSION=aal2', 'ROLE=super-admin', 'AUDIT_ROWS create_plan_version=3 other=0', 'STATUS=success']) {
        assert.ok(io.log.some((l) => l.includes(line)), `missing: ${line}`);
      }

      const plans = await q('select id::text, slug, name, amount_minor, currency::text, billing_interval, active, version, display_order, stripe_price_id, paypal_plan_id from public.plans order by display_order');
      assert.deepEqual(plans.map((p) => p.slug), CANONICAL_PLANS.map((c) => c.slug));
      for (const p of plans) {
        assert.equal(catalogMismatch(p), null, `${p.slug} matches the catalog`);
        assert.equal(p.version, 1);
        assert.equal(p.stripe_price_id, null);
        assert.equal(p.paypal_plan_id, null);
      }
      assert.deepEqual(r.planIds.sort(), plans.map((p) => p.id).sort());
      const audit = await q('select actor_admin_id::text as actor, action, resource_type, resource_id from public.admin_audit_log');
      assert.equal(audit.length, 3);
      assert.ok(audit.every((a) => a.actor === ownerId && a.action === 'create_plan_version' && a.resource_type === 'plans'));
      assert.deepEqual(audit.map((a) => a.resource_id).sort(), plans.map((p) => p.id).sort());
      assert.deepEqual(await q(`select factor_type::text, status::text from auth.mfa_factors where user_id = $1`, [ownerId]), [{ factor_type: 'totp', status: 'verified' }]);
      assert.equal((await one('select count(*)::int as n from auth.sessions where user_id = $1', [ownerId])).n, 0, 'logged out');
    });

    await test('run again: the plans exist -> PLANS_ALREADY_EXIST, nothing changed', async () => {
      const before = await q('select to_jsonb(p.*) as row from public.plans p order by slug');
      const r = await owner(ownerRunArgv(), scriptedIo({ hidden: [env.ANON_KEY, OWNER_EMAIL, OWNER_PASSWORD], visible: ['CREATE CANONICAL PLANS local'] }));
      expectStop(r, 'PLANS_ALREADY_EXIST');
      assert.deepEqual(await q('select to_jsonb(p.*) as row from public.plans p order by slug'), before);
      assert.equal((await counts()).audit, 3);
    });

    let candidate = null;
    await test('collector: MIGRATION_DB_URL from a hidden prompt; the read-only candidate is admitted exactly by the bootstrap allowlist', async () => {
      const redactor = makeRedactor();
      const io = scriptedIo({ hidden: [env.DB_URL] });
      const dbUrl = await resolveCollectDbUrl({ env: {}, io, redactor });
      assert.equal(dbUrl, env.DB_URL);
      ({ candidate } = await collectCandidate({ dbUrl, gitSha: 'a'.repeat(40) }));
      const allow = candidate.bootstrapAllowlist;
      assert.equal(allow.superAdmin.userId, ownerId);
      assert.deepEqual(allow.plans.map((p) => p.slug), ['Starter', 'Standard', 'Premium']);
      assert.deepEqual(allow.auditRows.map((a) => a.action), ['create_plan_version', 'create_plan_version', 'create_plan_version']);
      const client = await pool.connect();
      try {
        assert.deepEqual(compareBootstrapState(await readBootstrapState(client), allow), [], 'the target state is exactly what the candidate approves');
      } finally {
        client.release();
      }
      outputs.push(JSON.stringify(candidate));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-candidate-'));
      try {
        const file = path.join(dir, 'candidate.json');
        fs.writeFileSync(file, JSON.stringify(candidate));
        outputs.push(fs.readFileSync(file, 'utf8'));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    await test('PII/secret scan: every printed line, error and the candidate hold no email, password, key, URL, link, TOTP secret or session token', async () => {
      const all = [...secrets, ...totpSecrets, ...sessionTokens, 'otpauth://totp'];
      const checked = assertNoLeaks(outputs, all, 'tool output');
      assert.ok(checked >= 20, `only ${checked} secret values were checked`);
      assert.ok(outputs.length > 40, 'the scan covered the runs');
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
