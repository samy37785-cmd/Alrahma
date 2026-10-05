import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_SPEC,
  validateCliArgs,
  resolveRunConfig,
  preflightBootstrap,
  applyBootstrap,
  runBootstrapCli,
  isValidEmailShape,
} from '../scripts/ops/lib/supabase-first-super-admin-bootstrap-core.mjs';
import { OperatorError, makeRedactor } from '../scripts/ops/lib/operator-io.mjs';
import { scriptedIo, assertNoLeaks, fakeJwtKey } from './helpers/operator-fakes.js';

// SECURE_SUPER_ADMIN_OPERATOR_TOOL: the first-super-admin bootstrap, on
// in-memory fakes only -- no network, no Postgres, no Supabase client. The
// same flow runs against a real local Supabase stack in
// scripts/ops/operator-tools.real-gotrue.test.mjs.

const NEW_ID = '11111111-2222-4333-8444-555555555555';
const EMAIL = 'Dedicated.Admin+ops@Example.org';
const SERVICE_KEY = 'sb_secret_test_fake_not_a_real_key_0001';
const LOCAL_DB_URL = 'postgresql://postgres:local-test-pw-not-real@127.0.0.1:5432/postgres';

const BASE_ENV = Object.freeze({
  ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1',
  SUPABASE_BOOTSTRAP_TARGET_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
});
const APPLY_LOCAL = ['--apply', '--confirm-create-first-super-admin', '--target=local'];

function err(code) {
  return (e) => {
    assert.ok(e instanceof OperatorError, `expected an OperatorError, got ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code, e.message);
    return true;
  };
}

// ── Fakes ──────────────────────────────────────────────────────────────────

function makeFakeDb({ roleRows = 0, adminProfiles = 0, authEmails = [], failRoleInsert = false } = {}) {
  const state = { roleRows: [], adminProfiles, authEmails: [...authEmails], profiles: new Map(), committedWrites: 0, ended: false, readOnlyWrites: 0 };
  const client = (mode, pending) => ({
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.startsWith('select count(*)::int as n from public.admin_role_assignments')) return { rows: [{ n: roleRows + state.roleRows.length }] };
      if (s.startsWith("select count(*)::int as n from public.profiles where role = 'admin'")) return { rows: [{ n: state.adminProfiles }] };
      if (s.startsWith('select email from auth.users')) return { rows: state.authEmails.map((email) => ({ email })) };
      if (mode === 'ro') {
        state.readOnlyWrites++;
        throw new Error('cannot execute in a read-only transaction');
      }
      if (s.startsWith('update public.profiles')) {
        pending.profile = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (s.startsWith('insert into public.admin_role_assignments')) {
        if (failRoleInsert) throw new Error('simulated role insert failure');
        pending.role = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (s.startsWith('select (select role::text from public.profiles')) {
        return { rows: [{ profile_role: pending.profile === params[0] ? 'admin' : 'user', roles: pending.role === params[0] ? ['super-admin'] : null, role_rows: roleRows + state.roleRows.length + (pending.role ? 1 : 0) }] };
      }
      throw new Error(`unexpected query in fake db: ${s.split('\n')[0]}`);
    },
  });
  return {
    state,
    readOnly: (fn) => fn(client('ro')),
    inTransaction: async (fn) => {
      const pending = {};
      const out = await fn(client('rw', pending));
      if (pending.profile) state.profiles.set(pending.profile, 'admin');
      if (pending.role) state.roleRows.push({ user_id: pending.role, role: 'super-admin' });
      state.committedWrites++;
      return out;
    },
    end: async () => {
      state.ended = true;
    },
  };
}

function makeFakeAuth(db, { fail = false } = {}) {
  const calls = { invite: [], delete: [] };
  return {
    calls,
    inviteUser: async (email) => {
      calls.invite.push(email);
      // A realistic failure text that names the address -- it must never reach the output.
      if (fail) return { data: null, error: { message: `Error sending invite email to ${email}` } };
      db.state.authEmails.push(email);
      return { data: { user: { id: NEW_ID } }, error: null };
    },
    deleteUser: async (id) => {
      calls.delete.push(id);
    },
  };
}

function makeDeps({ db = makeFakeDb(), authFail = false, conflict = false, dirty = false, backupAgeHours = 1 } = {}) {
  const auth = makeFakeAuth(db, { fail: authFail });
  const calls = { createDb: 0, createAuthAdmin: 0, collision: [] };
  return {
    db,
    auth,
    calls,
    deps: {
      gitState: () => ({ sha: 'a'.repeat(40), dirty }),
      verifyFreshBackup: () => {
        if (backupAgeHours > 24) throw new Error('backup at D:/x is 30.0h old -- max allowed is 24h');
        return { sha256: 'b'.repeat(64), ageHours: backupAgeHours };
      },
      collisionCheck: async (args) => {
        calls.collision.push(args);
        return conflict;
      },
      createDb: () => {
        calls.createDb++;
        return db;
      },
      createAuthAdmin: () => {
        calls.createAuthAdmin++;
        return auth;
      },
    },
  };
}

function happyIo({ email = EMAIL, again = EMAIL, phrase = 'INVITE SUPER-ADMIN local' } = {}) {
  return scriptedIo({ hidden: [email, again, LOCAL_DB_URL, SERVICE_KEY], visible: [phrase] });
}

async function run({ argv = APPLY_LOCAL, env = BASE_ENV, io = happyIo(), setup = makeDeps() } = {}) {
  const redactor = makeRedactor();
  let error = null;
  let result = null;
  try {
    result = await runBootstrapCli({ argv, env, io, redactor, deps: setup.deps });
  } catch (e) {
    error = e;
  }
  return { result, error, io, redactor, ...setup };
}

const SECRETS = [EMAIL, EMAIL.toLowerCase(), 'dedicated.admin', SERVICE_KEY, LOCAL_DB_URL, 'local-test-pw-not-real'];

// ── Arguments and gates ────────────────────────────────────────────────────

test('CLI_SPEC: no flag can carry a secret -- there is no --email, password, key or URL flag', () => {
  for (const flag of Object.keys(CLI_SPEC.flags)) {
    assert.ok(!/email|password|token|secret|key|url|link|code/.test(flag), `--${flag} looks like a secret-carrying flag`);
  }
});

test('--email on the command line is refused, naming the flag but never echoing its value', async () => {
  const r = await run({ argv: [...APPLY_LOCAL, '--email=leak.check@example.com'] });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'BAD_ARGS');
  assert.match(r.error.message, /unknown flag "--email"/);
  assertNoLeaks([r.error.message, ...r.io.log], ['leak.check@example.com']);
  assert.equal(r.calls.createDb + r.calls.createAuthAdmin, 0);
});

test('validateCliArgs: combinations and acknowledgements', () => {
  assert.throws(() => validateCliArgs({ apply: true, 'dry-run': true }), /cannot be combined/);
  assert.throws(() => validateCliArgs({ target: 'local' }), /only has meaning together with --apply/);
  assert.throws(() => validateCliArgs({ apply: true, target: 'local' }), /--confirm-create-first-super-admin/);
  assert.throws(() => validateCliArgs({ apply: true, 'confirm-create-first-super-admin': true, target: 'staging' }), /--target must be local or production/);
  assert.throws(
    () => validateCliArgs({ apply: true, 'confirm-create-first-super-admin': true, target: 'production' }),
    /--target=production requires --backup-manifest/
  );
});

test('resolveRunConfig: the env authorization and the target channel must both agree', () => {
  assert.deepEqual(resolveRunConfig({ args: {}, env: {} }), { apply: false });
  const args = { apply: true, 'confirm-create-first-super-admin': true, target: 'local' };
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: undefined } }), err('NOT_AUTHORIZED'));
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: 'production' } }), err('TARGET_MISMATCH'));
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: undefined } }), err('TARGET_MISMATCH'));
  assert.equal(resolveRunConfig({ args, env: BASE_ENV }).target, 'local');
});

test('production under CI is refused before any input or connection', async () => {
  const env = { ...BASE_ENV, CI: 'true', SUPABASE_BOOTSTRAP_TARGET_ENV: 'production' };
  const r = await run({ argv: ['--apply', '--confirm-create-first-super-admin', '--target=production', '--backup-manifest=x.json'], env, io: scriptedIo() });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'CI_REMOTE_REFUSED', r.error?.message);
  assert.deepEqual(r.io.events, [], 'nothing was asked or printed');
  assert.equal(r.calls.createDb + r.calls.createAuthAdmin + r.calls.collision.length, 0);
});

test('dry-run (no flags) reads nothing and connects nowhere', async () => {
  const r = await run({ argv: [], env: {}, io: scriptedIo({ interactive: false }) });
  assert.equal(r.result.status, 'dry-run');
  assert.equal(r.calls.createDb + r.calls.createAuthAdmin, 0);
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:') || e.startsWith('visible:')));
});

test('apply without an interactive terminal is refused before any prompt', async () => {
  const r = await run({ io: scriptedIo({ interactive: false }) });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'NOT_INTERACTIVE');
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:')));
});

test('production from a checkout with uncommitted changes is refused', async () => {
  const env = { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: 'production', SUPABASE_URL: undefined };
  const r = await run({
    argv: ['--apply', '--confirm-create-first-super-admin', '--target=production', '--backup-manifest=x.json'],
    env,
    setup: makeDeps({ dirty: true }),
  });
  assert.equal(r.error?.code, 'DIRTY_CHECKOUT');
});

test('production with a backup older than 24h is refused before the email is asked', async () => {
  const env = { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: 'production', SUPABASE_URL: undefined };
  const r = await run({
    argv: ['--apply', '--confirm-create-first-super-admin', '--target=production', '--backup-manifest=x.json'],
    env,
    io: scriptedIo(),
    setup: makeDeps({ backupAgeHours: 30 }),
  });
  assert.equal(r.error?.code, 'BACKUP_REFUSED');
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:')));
});

test('isValidEmailShape', () => {
  assert.equal(isValidEmailShape('owner@example.com'), true);
  assert.equal(isValidEmailShape('not-an-email'), false);
  assert.equal(isValidEmailShape(''), false);
});

// ── The run ────────────────────────────────────────────────────────────────

test('happy path: projectRef and gitSha shown, typed phrase required, exactly ONE invite, then the role write', async () => {
  const r = await run();
  assert.equal(r.error, null, r.error?.message);
  assert.deepEqual({ status: r.result.status, userId: r.result.userId, invitesSent: r.result.invitesSent }, { status: 'success', userId: NEW_ID, invitesSent: 1 });
  assert.equal(r.auth.calls.invite.length, 1);
  assert.equal(r.auth.calls.invite[0], EMAIL.toLowerCase(), 'the normalized address is invited');
  assert.deepEqual(r.db.state.roleRows, [{ user_id: NEW_ID, role: 'super-admin' }]);
  assert.equal(r.db.state.profiles.get(NEW_ID), 'admin');
  assert.equal(r.db.state.readOnlyWrites, 0);
  assert.ok(r.db.state.ended, 'the pool is always closed');
  const header = r.io.log.find((l) => l.includes('projectRef='));
  assert.match(header, /target=local projectRef=local gitSha=a{40}/);
  assert.ok(r.io.log.includes(`SUPER_ADMIN_USER_ID=${NEW_ID}`));
  assert.ok(r.io.log.includes('INVITES_SENT=1'));
  // The phrase prompt came after the preflight summary, and before the invite.
  const phraseAt = r.io.events.findIndex((e) => e.startsWith('visible:'));
  assert.ok(phraseAt > r.io.events.findIndex((e) => e === 'print'));
  assert.ok(assertNoLeaks([...r.io.log, ...r.io.sensitive], SECRETS) >= 5);
});

test('the two email entries must match (normalized); a mismatch stops before any connection', async () => {
  const r = await run({ io: scriptedIo({ hidden: [EMAIL, 'someone.else@example.org'] }) });
  assert.equal(r.error?.code, 'EMAIL_MISMATCH');
  assert.equal(r.calls.createDb + r.calls.createAuthAdmin, 0);
  assertNoLeaks([r.error.message, ...r.io.log], [...SECRETS, 'someone.else@example.org']);
});

test('conflicting email: SUPER_ADMIN_EMAIL_CONFLICT=YES stops the run before Supabase is contacted', async () => {
  const setup = makeDeps({ conflict: true });
  const env = { ...BASE_ENV };
  const r = await run({ argv: [...APPLY_LOCAL, '--backup-manifest=fresh.json'], env, io: scriptedIo({ hidden: [EMAIL, EMAIL] }), setup });
  assert.equal(r.error?.code, 'EMAIL_CONFLICT');
  assert.ok(r.io.log.includes('SUPER_ADMIN_EMAIL_CONFLICT=YES'));
  assert.equal(setup.calls.collision.length, 1);
  assert.equal(setup.calls.collision[0].candidateEmail, EMAIL.toLowerCase());
  assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0, 'no database or Auth client was ever created');
  assert.equal(r.io.remaining().hidden, 0);
  assertNoLeaks([r.error.message, ...r.io.log], SECRETS);
});

test('no conflict: SUPER_ADMIN_EMAIL_CONFLICT=NO, then the run continues', async () => {
  const r = await run({ argv: [...APPLY_LOCAL, '--backup-manifest=fresh.json'] });
  assert.equal(r.error, null, r.error?.message);
  assert.ok(r.io.log.includes('SUPER_ADMIN_EMAIL_CONFLICT=NO'));
  assert.equal(r.auth.calls.invite.length, 1);
});

test('existing user (same address) stops with nothing changed and no invite', async () => {
  const setup = makeDeps({ db: makeFakeDb({ authEmails: [EMAIL.toLowerCase()] }) });
  const r = await run({ setup });
  assert.equal(r.error?.code, 'EXISTING_ACCOUNT');
  assert.equal(setup.auth.calls.invite.length, 0);
  assert.equal(setup.db.state.committedWrites, 0);
});

test('existing user (same mailbox: +tag / gmail dots) also stops with no invite', async () => {
  const db = makeFakeDb({ authEmails: ['owner.person@gmail.com'] });
  await assert.rejects(preflightBootstrap({ email: 'ownerperson+admin@googlemail.com', readOnly: db.readOnly }), err('EXISTING_ACCOUNT'));
});

test('duplicate invite: a second run after a successful one stops at EXISTING_ADMIN_FOUND -- still one invite in total', async () => {
  const setup = makeDeps();
  const first = await run({ setup });
  assert.equal(first.result.status, 'success');
  const second = await run({ setup: { ...setup }, io: happyIo() });
  assert.equal(second.error?.code, 'EXISTING_ADMIN_FOUND');
  assert.equal(setup.auth.calls.invite.length, 1, 'never a second invite');
  assert.deepEqual(setup.db.state.roleRows, [{ user_id: NEW_ID, role: 'super-admin' }]);
});

test('an existing admin role row or admin profile blocks the run before the phrase is asked', async () => {
  for (const [db, code] of [[makeFakeDb({ roleRows: 1 }), 'EXISTING_ADMIN_FOUND'], [makeFakeDb({ adminProfiles: 1 }), 'AMBIGUOUS_ADMIN_STATE']]) {
    const setup = makeDeps({ db });
    const r = await run({ setup });
    assert.equal(r.error?.code, code);
    assert.equal(setup.auth.calls.invite.length, 0);
    assert.equal(r.io.remaining().visible, 1, 'the confirmation phrase was never asked');
  }
});

test('a wrong confirmation phrase sends no invite', async () => {
  const setup = makeDeps();
  const r = await run({ setup, io: happyIo({ phrase: 'INVITE SUPER-ADMIN difzynyphojgisrfvrkd' }) });
  assert.equal(r.error?.code, 'NOT_CONFIRMED');
  assert.equal(setup.auth.calls.invite.length, 0);
});

test('keys and database URLs must belong to the target', async () => {
  const anonJwt = fakeJwtKey({ role: 'anon', iss: 'supabase-demo' });
  let r = await run({ io: scriptedIo({ hidden: [EMAIL, EMAIL, LOCAL_DB_URL, anonJwt] }) });
  assert.equal(r.error?.code, 'WRONG_KEY', 'an anon key is not a service key');
  assertNoLeaks([r.error.message], [anonJwt]);
  r = await run({ io: scriptedIo({ hidden: [EMAIL, EMAIL, 'postgresql://db.someotherref.supabase.co:5432/postgres'] }) });
  assert.equal(r.error?.code, 'TARGET_MISMATCH', 'a remote database URL is not the local target');
});

test('an invite failure reports a redacted reason (the address never appears) and writes nothing', async () => {
  const setup = makeDeps({ authFail: true });
  const r = await run({ setup });
  assert.equal(r.error?.code, 'INVITE_FAILED');
  assert.equal(setup.auth.calls.invite.length, 1);
  assert.equal(setup.db.state.committedWrites, 0);
  assertNoLeaks([r.error.message, ...r.io.log], SECRETS);
});

test('a failed role write deletes exactly the account this run invited', async () => {
  const db = makeFakeDb({ failRoleInsert: true });
  const auth = makeFakeAuth(db);
  const result = await applyBootstrap({ email: 'x@example.org', inviteUser: auth.inviteUser, deleteUser: auth.deleteUser, readOnly: db.readOnly, inTransaction: db.inTransaction, redactor: makeRedactor() });
  assert.equal(result.status, 'failed_compensated');
  assert.deepEqual(auth.calls.delete, [NEW_ID]);
  assert.equal(db.state.roleRows.length, 0);
});

test('the preflight runs read-only: a write attempted inside it is refused', async () => {
  const db = makeFakeDb();
  await preflightBootstrap({ email: 'x@example.org', readOnly: db.readOnly });
  await assert.rejects(db.readOnly((c) => c.query('update public.profiles set role = $1', ['admin'])), /read-only/);
});
