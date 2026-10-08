import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_SPEC,
  assertStrongPassword,
  applyRecovery,
  readRecoveryState,
  resolveRunConfig,
  runRecoveryCli,
  selectOnly,
  stateMismatches,
  validateCliArgs,
} from '../scripts/ops/lib/supabase-recover-first-super-admin-core.mjs';
import { OperatorError, describeError, makeRedactor } from '../scripts/ops/lib/operator-io.mjs';
import { scriptedIo, assertNoLeaks, fakeJwtKey } from './helpers/operator-fakes.js';

// First-Super-Admin recovery tool, on in-memory fakes only -- no network, no
// Postgres, no Supabase client. The same flow runs against a real local
// Supabase stack in scripts/ops/recover-first-super-admin.real-gotrue.test.mjs.

const USER_ID = '7e6700bd-1111-4222-8333-444444444444';
const PREFIX = '7e6700bd';
const OTHER_ID = '99999999-1111-4222-8333-444444444444';
const PASSWORD = 'Correct-Horse-Battery-9!';
const SERVICE_KEY = 'sb_secret_test_fake_not_a_real_key_0005';
const LOCAL_DB_URL = 'postgresql://postgres:local-test-pw-not-real@127.0.0.1:5432/postgres';
// Built at runtime: a production-shaped pooler URL, never a literal in this file.
const PROD_REF = 'difzynyphojgisrfvrkd';
const PROD_DB_URL = `postgresql://postgres.${PROD_REF}:${'prod-test-pw-not-real'}@aws-0-eu-central-1.pooler.${'supa' + 'base'}.com:5432/postgres`;
const PROD_SERVICE_KEY = fakeJwtKey({ role: 'service_role', ref: PROD_REF });

const BASE_ENV = Object.freeze({
  ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: '1',
  SUPABASE_RECOVERY_TARGET_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
});
const APPLY_LOCAL = ['--apply', '--confirm-recover-super-admin-account', '--target=local', `--expect-id-prefix=${PREFIX}`];
const APPLY_PROD = ['--apply', '--confirm-recover-super-admin-account', '--target=production', `--expect-id-prefix=${PREFIX}`];
const PROD_ENV = Object.freeze({ ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: '1', SUPABASE_RECOVERY_TARGET_ENV: 'production' });

function err(code) {
  return (e) => {
    assert.ok(e instanceof OperatorError, `expected an OperatorError, got ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code, e.message);
    return true;
  };
}

// ── Fakes ──────────────────────────────────────────────────────────────────

/** The exact state the first-Super-Admin bootstrap leaves behind, unaccepted. */
function exactWorld(overrides = {}) {
  return {
    authUsers: 1,
    adminProfiles: 1,
    roleRows: 1,
    account: {
      confirmed: false, signedIn: false, hasPassword: false, banned: false,
      sessions: 0, mfa: 0, audit: 0, pending: 1, profileRole: 'admin', adminRoles: ['super-admin'],
    },
    ...overrides,
  };
}

function makeFakeDb(world, { onRead = null, failWith = null } = {}) {
  const stats = { reads: 0, writes: 0, ended: false, statements: [] };
  const client = {
    async query(sql) {
      const s = sql.trim();
      stats.statements.push(s);
      if (!/^(select|show)\b/i.test(s)) {
        stats.writes++;
        throw new Error('a write reached the fake database');
      }
      const a = world.account;
      if (s.includes('to_jsonb(u)')) {
        return a ? { rows: [{ confirmed: a.confirmed, signed_in: a.signedIn, has_password: a.hasPassword, banned: a.banned }] } : { rows: [] };
      }
      if (s.includes('from auth.users')) return { rows: [{ n: world.authUsers }] };
      if (s.includes('from public.profiles where role')) return { rows: [{ n: world.adminProfiles }] };
      if (s.includes('count(*)::int as n from public.admin_role_assignments')) return { rows: [{ n: world.roleRows }] };
      if (s.includes('from auth.sessions')) return { rows: [{ n: a.sessions }] };
      if (s.includes('from auth.mfa_factors')) return { rows: [{ n: a.mfa }] };
      if (s.includes('from auth.audit_log_entries')) return { rows: [{ n: a.audit }] };
      if (s.includes('from auth.one_time_tokens')) return { rows: [{ n: a.pending }] };
      if (s.includes('select role::text as role from public.profiles')) return { rows: a.profileRole ? [{ role: a.profileRole }] : [] };
      if (s.includes('select role::text as role from public.admin_role_assignments')) return { rows: a.adminRoles.map((role) => ({ role })) };
      throw new Error(`unexpected query in fake db: ${s.split('\n')[0]}`);
    },
  };
  return {
    stats,
    world,
    readOnly: async (fn) => {
      stats.reads++;
      if (failWith) throw failWith;
      if (onRead) onRead(stats.reads, world);
      return fn(client);
    },
    end: async () => {
      stats.ended = true;
    },
  };
}

function makeFakeAuth(world, { mode = 'ok', message = null } = {}) {
  const calls = [];
  return {
    calls,
    setPasswordAndConfirm: async (userId, password) => {
      calls.push({ userId, password });
      if (mode === 'throw') throw new Error(message ?? 'fetch failed');
      if (mode === 'refuse') return { data: null, error: { message: message ?? 'Password should contain at least one uppercase letter' } };
      if (mode === 'refuse-but-mutate') {
        world.account.confirmed = true;
        return { data: null, error: { message: 'partial failure' } };
      }
      if (mode === 'wrong-id') return { data: { user: { id: OTHER_ID } }, error: null };
      if (mode === 'silent-noop') return { data: { user: { id: userId } }, error: null };
      world.account.confirmed = true;
      world.account.hasPassword = true;
      world.account.pending = 0;
      return { data: { user: { id: userId } }, error: null };
    },
  };
}

function makeSetup({ world = exactWorld(), dirty = false, dbOptions = {}, authOptions = {} } = {}) {
  const db = makeFakeDb(world, dbOptions);
  const auth = makeFakeAuth(world, authOptions);
  const calls = { createDb: 0, createAuthAdmin: 0 };
  return {
    world,
    db,
    auth,
    calls,
    deps: {
      gitState: () => ({ sha: 'a'.repeat(40), dirty }),
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

function happyIo({ id = USER_ID, dbUrl = LOCAL_DB_URL, key = SERVICE_KEY, password = PASSWORD, again = PASSWORD, phrase = `RECOVER SUPER-ADMIN local ${PREFIX}` } = {}) {
  return scriptedIo({ hidden: [id, dbUrl, key, password, again], visible: [phrase] });
}

async function run({ argv = APPLY_LOCAL, env = BASE_ENV, io = happyIo(), setup = makeSetup() } = {}) {
  const redactor = makeRedactor();
  let error = null;
  let result = null;
  try {
    result = await runRecoveryCli({ argv, env, io, redactor, deps: setup.deps });
  } catch (e) {
    error = e;
  }
  return { result, error, io, redactor, ...setup };
}

const SECRETS = [USER_ID, PASSWORD, SERVICE_KEY, LOCAL_DB_URL, 'local-test-pw-not-real'];
const passwordWasAsked = (io) => io.events.some((e) => e.startsWith('hidden:New password') || e.startsWith('hidden:Same password'));

// ── Arguments and gates ────────────────────────────────────────────────────

test('CLI_SPEC: no flag can carry a secret -- no --email, --password, --user-id, key or URL flag', () => {
  for (const flag of Object.keys(CLI_SPEC.flags)) {
    assert.ok(!/email|password|token|secret|key|url|link|code/.test(flag), `--${flag} looks like a secret-carrying flag`);
  }
  assert.ok(!Object.keys(CLI_SPEC.flags).some((f) => /user|uuid|^id$/.test(f)), 'the full account id is never a flag');
});

test('--email, --password and --user-id are refused by name, their value never echoed', async () => {
  for (const [flag, value] of [['email', 'leak.check@example.com'], ['password', PASSWORD], ['user-id', USER_ID]]) {
    const setup = makeSetup();
    const r = await run({ argv: [...APPLY_LOCAL, `--${flag}=${value}`], setup });
    assert.ok(r.error instanceof OperatorError && r.error.code === 'BAD_ARGS', `--${flag}`);
    assert.match(r.error.message, new RegExp(`unknown flag "--${flag}"`));
    assertNoLeaks([r.error.message, ...r.io.log], [value]);
    assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0);
  }
});

test('validateCliArgs: combinations, acknowledgement, target and the pinned id prefix', () => {
  assert.throws(() => validateCliArgs({ apply: true, 'dry-run': true }), /cannot be combined/);
  assert.throws(() => validateCliArgs({ target: 'local' }), /only has meaning together with --apply/);
  assert.throws(() => validateCliArgs({ 'expect-id-prefix': PREFIX }), /only has meaning together with --apply/);
  assert.throws(() => validateCliArgs({ apply: true, target: 'local', 'expect-id-prefix': PREFIX }), /--confirm-recover-super-admin-account/);
  const ok = { apply: true, 'confirm-recover-super-admin-account': true, target: 'local', 'expect-id-prefix': PREFIX };
  assert.throws(() => validateCliArgs({ ...ok, target: 'staging' }), /--target must be local or production/);
  assert.throws(() => validateCliArgs({ ...ok, 'expect-id-prefix': undefined }), /--expect-id-prefix/);
  for (const bad of ['7e6700b', '7e6700bde', '7E6700BD', '7e6700bg', '']) {
    assert.throws(() => validateCliArgs({ ...ok, 'expect-id-prefix': bad }), /--expect-id-prefix/, bad);
  }
  assert.doesNotThrow(() => validateCliArgs(ok));
});

test('resolveRunConfig: the dedicated authorization and the target channel must both agree', () => {
  assert.deepEqual(resolveRunConfig({ args: {}, env: {} }), { apply: false });
  const args = { apply: true, 'confirm-recover-super-admin-account': true, target: 'local', 'expect-id-prefix': PREFIX };
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: undefined } }), err('NOT_AUTHORIZED'));
  // The first-bootstrap switch is not an authorization for this tool.
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: undefined, ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1' } }), err('NOT_AUTHORIZED'));
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, SUPABASE_RECOVERY_TARGET_ENV: 'production' } }), err('TARGET_MISMATCH'));
  assert.throws(() => resolveRunConfig({ args, env: { ...BASE_ENV, SUPABASE_RECOVERY_TARGET_ENV: undefined } }), err('TARGET_MISMATCH'));
  assert.deepEqual(resolveRunConfig({ args, env: BASE_ENV }), { apply: true, target: 'local', expectIdPrefix: PREFIX });
});

test('production under CI is refused before any input or connection', async () => {
  const setup = makeSetup();
  const r = await run({ argv: APPLY_PROD, env: { ...PROD_ENV, CI: 'true' }, io: scriptedIo(), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'CI_REMOTE_REFUSED', r.error?.message);
  assert.deepEqual(r.io.events, [], 'nothing was asked or printed');
  assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0);
});

test('dry-run (no flags) reads nothing and connects nowhere', async () => {
  const setup = makeSetup();
  const r = await run({ argv: [], env: {}, io: scriptedIo({ interactive: false }), setup });
  assert.equal(r.result.status, 'dry-run');
  assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0);
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:') || e.startsWith('visible:')));
});

test('without a terminal, apply stops before reading any input', async () => {
  const setup = makeSetup();
  const r = await run({ io: scriptedIo({ interactive: false, hidden: [USER_ID], visible: ['x'] }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'NOT_INTERACTIVE');
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:') || e.startsWith('visible:')));
  assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0);
});

test('production from a dirty checkout is refused before any prompt', async () => {
  const setup = makeSetup({ dirty: true });
  const r = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: PROD_DB_URL, key: PROD_SERVICE_KEY, phrase: `RECOVER SUPER-ADMIN ${PROD_REF} ${PREFIX}` }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'DIRTY_CHECKOUT');
  assert.ok(!r.io.events.some((e) => e.startsWith('hidden:')));
  assert.equal(setup.calls.createDb, 0);
});

// ── The account id, the target, the keys ───────────────────────────────────

test('the account id must be a UUID that starts with --expect-id-prefix; nothing is connected otherwise', async () => {
  for (const [id, code] of [[OTHER_ID, 'ACCOUNT_ID_MISMATCH'], ['not-a-uuid', 'BAD_ACCOUNT_ID'], ['', 'BAD_ACCOUNT_ID'], [PREFIX, 'BAD_ACCOUNT_ID']]) {
    const setup = makeSetup();
    const r = await run({ io: happyIo({ id }), setup });
    assert.ok(r.error instanceof OperatorError && r.error.code === code, `${id}: ${r.error?.code}`);
    assert.equal(setup.calls.createDb + setup.calls.createAuthAdmin, 0);
    assertNoLeaks([r.error.message, ...r.io.log], [OTHER_ID]);
  }
});

test('the id is accepted in any letter case', async () => {
  const r = await run({ io: happyIo({ id: `  ${USER_ID.toUpperCase()}  ` }) });
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.result.status, 'success');
});

test('production: a local or other-project database URL, or an anon key, stops before any connection', async () => {
  const prodPhrase = `RECOVER SUPER-ADMIN ${PROD_REF} ${PREFIX}`;
  let setup = makeSetup();
  let r = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: LOCAL_DB_URL, key: PROD_SERVICE_KEY, phrase: prodPhrase }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'TARGET_MISMATCH');
  assert.equal(setup.calls.createDb, 0);

  const otherRef = PROD_DB_URL.replace(PROD_REF, 'someotherprojectref');
  setup = makeSetup();
  r = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: otherRef, key: PROD_SERVICE_KEY, phrase: prodPhrase }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'TARGET_MISMATCH');
  assert.equal(setup.calls.createDb, 0);

  setup = makeSetup();
  r = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: PROD_DB_URL, key: fakeJwtKey({ role: 'anon', ref: PROD_REF }), phrase: prodPhrase }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'WRONG_KEY');
  assert.equal(setup.calls.createDb, 0);

  setup = makeSetup();
  r = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: PROD_DB_URL, key: fakeJwtKey({ role: 'service_role', ref: 'someotherprojectref' }), phrase: prodPhrase }), setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'TARGET_MISMATCH');
  assert.equal(setup.calls.createDb, 0);
  assertNoLeaks([r.error.message, ...r.io.log], [PROD_DB_URL, 'prod-test-pw-not-real', USER_ID]);
});

test('production happy path: the project ref and the account prefix are in the typed phrase', async () => {
  const setup = makeSetup();
  const io = happyIo({ dbUrl: PROD_DB_URL, key: PROD_SERVICE_KEY, phrase: `RECOVER SUPER-ADMIN ${PROD_REF} ${PREFIX}` });
  const r = await run({ argv: APPLY_PROD, env: PROD_ENV, io, setup });
  assert.equal(r.error, null, r.error?.message);
  assert.ok(io.log.some((l) => l.includes(`projectRef=${PROD_REF}`) && l.includes(`account-prefix=${PREFIX}`)));
  assert.equal(setup.auth.calls.length, 1);
  // The local-target phrase is not accepted for production.
  const wrong = await run({ argv: APPLY_PROD, env: PROD_ENV, io: happyIo({ dbUrl: PROD_DB_URL, key: PROD_SERVICE_KEY }), setup: makeSetup() });
  assert.ok(wrong.error instanceof OperatorError && wrong.error.code === 'NOT_CONFIRMED');
});

// ── The exact-state check: any difference writes nothing ──────────────────

const MISMATCHES = [
  ['no account with this id (the one auth user is someone else)', (w) => { w.account = null; }, /ACCOUNT_EXISTS=NO/],
  ['two auth users', (w) => { w.authUsers = 2; }, /AUTH_USERS=2/],
  ['no auth users', (w) => { w.authUsers = 0; }, /AUTH_USERS=0/],
  ['no admin profile', (w) => { w.adminProfiles = 0; }, /ADMIN_PROFILES=0/],
  ['two admin profiles', (w) => { w.adminProfiles = 2; }, /ADMIN_PROFILES=2/],
  ['no super-admin assignment', (w) => { w.roleRows = 0; }, /SUPER_ADMIN_ASSIGNMENTS=0/],
  ['two role assignments', (w) => { w.roleRows = 2; }, /SUPER_ADMIN_ASSIGNMENTS=2/],
  ['email already confirmed', (w) => { w.account.confirmed = true; }, /EMAIL_CONFIRMED=YES/],
  ['a last sign-in exists', (w) => { w.account.signedIn = true; }, /LAST_SIGN_IN_PRESENT=YES/],
  ['a password already exists', (w) => { w.account.hasPassword = true; }, /HAS_PASSWORD=YES/],
  ['a session exists', (w) => { w.account.sessions = 1; }, /SESSIONS=1/],
  ['an MFA factor exists', (w) => { w.account.mfa = 1; }, /MFA_FACTORS=1/],
  ['an auth audit row exists', (w) => { w.account.audit = 1; }, /AUTH_AUDIT_ROWS=1/],
  ['the account is banned', (w) => { w.account.banned = true; }, /BANNED=YES/],
  ['the profile role is not admin', (w) => { w.account.profileRole = 'user'; }, /PROFILE_ROLE=user/],
  ['the profile row is missing', (w) => { w.account.profileRole = null; }, /PROFILE_ROLE=null/],
  ['the role is admin, not super-admin', (w) => { w.account.adminRoles = ['admin']; }, /ADMIN_ROLE=admin/],
  ['the account holds no role row', (w) => { w.account.adminRoles = []; }, /ADMIN_ROLE=\s*\(/],
  ['the account holds two role rows', (w) => { w.account.adminRoles = ['admin', 'super-admin']; }, /ADMIN_ROLE=admin,super-admin/],
];

for (const [name, mutate, expected] of MISMATCHES) {
  test(`state mismatch -- ${name}: stops with STATE_MISMATCH, no password is asked, nothing is written`, async () => {
    const world = exactWorld();
    mutate(world);
    const setup = makeSetup({ world });
    const r = await run({ setup });
    assert.ok(r.error instanceof OperatorError && r.error.code === 'STATE_MISMATCH', r.error?.message ?? 'no error');
    assert.match(r.error.message, expected);
    assert.match(r.error.message, /nothing was changed/);
    assert.equal(setup.auth.calls.length, 0, 'the Auth Admin call was never made');
    assert.equal(setup.db.stats.writes, 0);
    assert.ok(!passwordWasAsked(r.io), 'the password was never asked for');
    assert.ok(!r.io.events.some((e) => e.startsWith('visible:')), 'no confirmation phrase was asked for');
    assert.equal(setup.db.stats.ended, true, 'the connection was closed');
    assertNoLeaks([r.error.message, ...r.io.log], SECRETS);
  });
}

test('the exact state passes: stateMismatches() is empty and the state lines match the owner-reported format', async () => {
  assert.deepEqual(stateMismatches(await readRecoveryState({ userId: USER_ID, readOnly: makeFakeDb(exactWorld()).readOnly })), []);
  const io = happyIo();
  await run({ io });
  for (const line of [
    `USER_ID_PREFIX=${PREFIX} ACCOUNT_EXISTS=YES`,
    'AUTH_USERS=1 ADMIN_PROFILES=1 SUPER_ADMIN_ASSIGNMENTS=1',
    'EMAIL_CONFIRMED=NO LAST_SIGN_IN_PRESENT=NO HAS_PASSWORD=NO',
    'SESSIONS=0 MFA_FACTORS=0 AUTH_AUDIT_ROWS=0 BANNED=NO',
    'PENDING_CONFIRMATION_TOKEN=YES PROFILE_ROLE=admin ADMIN_ROLE=super-admin',
  ]) {
    assert.ok(io.log.includes(line), `state line missing: ${line}`);
  }
});

test('the state read sends only SELECT statements, none of them reads an email, a token or a hash', async () => {
  const db = makeFakeDb(exactWorld());
  await readRecoveryState({ userId: USER_ID, readOnly: db.readOnly });
  assert.ok(db.stats.statements.length >= 10);
  for (const sql of db.stats.statements) {
    assert.match(sql, /^select\b/i);
    // The only mentions allowed: the confirmation timestamp, "is the hash non-empty", and the token TYPE filter.
    const rest = sql
      .replace(/email_confirmed_at/g, '')
      .replace(/coalesce\(to_jsonb\(u\)->>'encrypted_password', ''\) <> ''/g, '')
      .replace(/token_type::text = 'confirmation_token'/g, '');
    assert.ok(!/\bemail\b|encrypted_password|confirmation_token|recovery_token|raw_user_meta|ip_address|\bpayload\b(?!->>'actor_id'|->'traits')/i.test(rest), sql);
  }
  const client = selectOnly({ query: () => assert.fail('a non-SELECT reached the client') });
  for (const sql of ['update auth.users set email_confirmed_at = now()', 'delete from auth.users', 'insert into x values (1)', 'with x as (select 1) delete from y']) {
    assert.throws(() => client.query(sql), err('NOT_READ_ONLY'));
  }
});

test('a change between the check and the write (race): the re-check stops it before the Auth call', async () => {
  // Read #1 shows the state; read #2 is applyRecovery's re-check -- someone signed in meanwhile.
  const setup = makeSetup({ dbOptions: { onRead: (n, w) => { if (n === 2) w.account.signedIn = true; } } });
  const r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'STATE_MISMATCH');
  assert.match(r.error.message, /LAST_SIGN_IN_PRESENT=YES/);
  assert.equal(setup.auth.calls.length, 0);
});

// ── The password and the typed phrase ──────────────────────────────────────

test('assertStrongPassword: length, edge whitespace and variety', () => {
  assert.doesNotThrow(() => assertStrongPassword(PASSWORD));
  assert.doesNotThrow(() => assertStrongPassword('correct horse battery staple'));
  assert.throws(() => assertStrongPassword('Short-1!'), err('PASSWORD_TOO_SHORT'));
  assert.throws(() => assertStrongPassword('x'.repeat(13)), err('PASSWORD_TOO_SHORT'));
  assert.throws(() => assertStrongPassword(' Correct-Horse-Battery-9!'), err('PASSWORD_WHITESPACE'));
  assert.throws(() => assertStrongPassword('Correct-Horse-Battery-9! '), err('PASSWORD_WHITESPACE'));
  assert.throws(() => assertStrongPassword('a'.repeat(20)), err('PASSWORD_TOO_SIMPLE'));
  assert.throws(() => assertStrongPassword('abababababababab'), err('PASSWORD_TOO_SIMPLE'));
  assert.throws(() => assertStrongPassword(undefined), err('PASSWORD_TOO_SHORT'));
});

test('two different password entries, a weak password or a wrong phrase write nothing and never echo the password', async () => {
  for (const [io, code] of [
    [happyIo({ again: `${PASSWORD}x` }), 'PASSWORD_MISMATCH'],
    [happyIo({ password: 'Short-1!', again: 'Short-1!' }), 'PASSWORD_TOO_SHORT'],
    [happyIo({ password: 'z'.repeat(30), again: 'z'.repeat(30) }), 'PASSWORD_TOO_SIMPLE'],
    [happyIo({ phrase: 'recover super-admin local' }), 'NOT_CONFIRMED'],
    [happyIo({ phrase: `RECOVER SUPER-ADMIN local ${OTHER_ID.slice(0, 8)}` }), 'NOT_CONFIRMED'],
    [happyIo({ phrase: '' }), 'NOT_CONFIRMED'],
  ]) {
    const setup = makeSetup();
    const r = await run({ io, setup });
    assert.ok(r.error instanceof OperatorError && r.error.code === code, `expected ${code}, got ${r.error?.code}`);
    assert.equal(setup.auth.calls.length, 0);
    assert.equal(setup.db.stats.writes, 0);
    assert.equal(setup.calls.createAuthAdmin, 0, 'the Auth Admin client was not even created');
    assertNoLeaks([r.error.message, ...r.io.log], [PASSWORD, `${PASSWORD}x`, 'z'.repeat(30), USER_ID]);
  }
});

// ── The write ──────────────────────────────────────────────────────────────

test('happy path: ONE Auth call for that id, then a verified read-back; nothing else changes; no secret is printed', async () => {
  const setup = makeSetup();
  const io = happyIo();
  const r = await run({ io, setup });
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.result.status, 'success');
  assert.deepEqual(setup.auth.calls, [{ userId: USER_ID, password: PASSWORD }], 'exactly one call, for the pinned account');
  assert.equal(setup.db.stats.writes, 0, 'the tool writes nothing to Postgres itself');
  assert.equal(setup.db.stats.ended, true);
  const asked = io.events.filter((e) => e.startsWith('hidden:'));
  assert.equal(asked.length, 5);
  ['Super Admin account id', 'Database URL', 'Service role key', 'New password', 'Same password'].forEach((label, i) => assert.ok(asked[i].startsWith(`hidden:${label}`), `${i}: ${asked[i]}`));
  assert.ok(io.log.includes('RECOVERY_APPLIED=YES PASSWORD_SET=YES EMAIL_CONFIRMED=YES INVITES_SENT=0'));
  assert.ok(io.log.includes('EMAIL_CONFIRMED=YES LAST_SIGN_IN_PRESENT=NO HAS_PASSWORD=YES'));
  assert.ok(io.log.includes('SESSIONS=0 MFA_FACTORS=0 AUTH_AUDIT_ROWS=0 BANNED=NO'));
  assert.ok(io.log.includes('AUTH_USERS=1 ADMIN_PROFILES=1 SUPER_ADMIN_ASSIGNMENTS=1'));
  assert.ok(io.log.some((l) => l.startsWith('STATUS=success')));
  assert.ok(io.log.some((l) => l.includes('USER_ID_PREFIX=7e6700bd')));
  assertNoLeaks([...io.log], SECRETS, 'tool output');
  assert.equal(passwordWasAsked(io), true);
  assert.deepEqual(io.remaining(), { hidden: 0, visible: 0 });
});

test('a second run after success stops at the state check: no second Auth call', async () => {
  const setup = makeSetup();
  const first = await run({ setup });
  assert.equal(first.error, null);
  const second = await run({ setup });
  assert.ok(second.error instanceof OperatorError && second.error.code === 'STATE_MISMATCH');
  assert.match(second.error.message, /EMAIL_CONFIRMED=YES/);
  assert.match(second.error.message, /HAS_PASSWORD=YES/);
  assert.equal(setup.auth.calls.length, 1);
});

test('the Auth service refuses the password: nothing changed, and its message (which may quote the password) is redacted', async () => {
  const setup = makeSetup({ authOptions: { mode: 'refuse', message: `Password ${PASSWORD} is known to be weak` } });
  const r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'RECOVERY_REFUSED');
  assert.match(r.error.message, /the account is unchanged/);
  assertNoLeaks([r.error.message, describeError(r.error, r.redactor), ...r.io.log], SECRETS);
  assert.equal(setup.auth.calls.length, 1);
});

test('a network error from the Auth call: account unchanged is reported as such; a changed account says do-not-rerun', async () => {
  let setup = makeSetup({ authOptions: { mode: 'throw', message: `fetch failed for ${SERVICE_KEY}` } });
  let r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'RECOVERY_REFUSED');
  assertNoLeaks([r.error.message, describeError(r.error, r.redactor)], SECRETS);

  setup = makeSetup({ authOptions: { mode: 'refuse-but-mutate' } });
  r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'RECOVERY_UNCERTAIN');
  assert.match(r.error.message, /do NOT run --apply again/);
  assert.equal(setup.auth.calls.length, 1, 'never retried');
});

test('the Auth service answers for a different account: treated as a failure, never as success', async () => {
  const setup = makeSetup({ authOptions: { mode: 'wrong-id' } });
  const r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'RECOVERY_REFUSED');
  assert.equal(setup.auth.calls.length, 1);
});

test('a "successful" call whose read-back is not confirmed + password-set is reported as POST_WRITE_VERIFICATION_FAILED, never retried', async () => {
  const setup = makeSetup({ authOptions: { mode: 'silent-noop' } });
  const r = await run({ setup });
  assert.ok(r.error instanceof OperatorError && r.error.code === 'POST_WRITE_VERIFICATION_FAILED');
  assert.match(r.error.message, /EMAIL_CONFIRMED=NO/);
  assert.match(r.error.message, /do NOT run --apply again/);
  assert.equal(setup.auth.calls.length, 1);
});

test('the read-back catches a side effect: a session, an MFA factor or a changed role after the call', async () => {
  for (const [mutate, expected] of [
    [(w) => { w.account.sessions = 1; }, /SESSIONS=1/],
    [(w) => { w.account.mfa = 1; }, /MFA_FACTORS=1/],
    [(w) => { w.account.signedIn = true; }, /LAST_SIGN_IN_PRESENT=YES/],
    [(w) => { w.authUsers = 2; }, /AUTH_USERS changed/],
    [(w) => { w.roleRows = 2; }, /SUPER_ADMIN_ASSIGNMENTS changed/],
    [(w) => { w.account.adminRoles = []; }, /ADMIN_ROLE changed/],
  ]) {
    const world = exactWorld();
    const setup = makeSetup({ world });
    const auth = setup.auth.setPasswordAndConfirm;
    setup.auth.setPasswordAndConfirm = async (...args) => {
      const out = await auth(...args);
      mutate(world);
      return out;
    };
    const r = await run({ setup });
    assert.ok(r.error instanceof OperatorError && r.error.code === 'POST_WRITE_VERIFICATION_FAILED', `${r.error?.code}`);
    assert.match(r.error.message, expected);
  }
});

test('a database error that quotes the connection string is redacted before it is printed', async () => {
  const setup = makeSetup({ dbOptions: { failWith: new Error(`connect failed: ${LOCAL_DB_URL} (password local-test-pw-not-real)`) } });
  const r = await run({ setup });
  assert.ok(r.error);
  const text = describeError(r.error, r.redactor);
  assertNoLeaks([text], [LOCAL_DB_URL, 'local-test-pw-not-real']);
  assert.equal(setup.auth.calls.length, 0);
  assert.equal(setup.db.stats.ended, true);
});

test('applyRecovery on its own: refuses a non-exact state itself, so a caller cannot skip the check', async () => {
  const world = exactWorld();
  world.account.hasPassword = true;
  const db = makeFakeDb(world);
  const auth = makeFakeAuth(world);
  await assert.rejects(
    applyRecovery({ userId: USER_ID, password: PASSWORD, readOnly: db.readOnly, setPasswordAndConfirm: auth.setPasswordAndConfirm, redactor: makeRedactor() }),
    err('STATE_MISMATCH')
  );
  assert.equal(auth.calls.length, 0);
});
