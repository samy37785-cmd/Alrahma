import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  CLI_SPEC,
  MAX_TOTP_ATTEMPTS,
  canonicalPlanVersionParams,
  parseInviteLink,
  parseOwnerArgs,
  runOwnerCli,
} from '../scripts/ops/lib/supabase-owner-bootstrap-core.mjs';
import { OperatorError, makeRedactor } from '../scripts/ops/lib/operator-io.mjs';
import { CANONICAL_PLANS } from '../scripts/migration/lib/plan-catalog.mjs';
import { PLANS } from '../config/plans.js';
import { scriptedIo, assertNoLeaks } from './helpers/operator-fakes.js';

// SECURE_SUPER_ADMIN_OPERATOR_TOOL: the owner tool (accept-invite, run) on
// a stateful fake of the Supabase client that enforces the same rules as
// the real database: create_plan_version() needs an AAL2 admin, RLS hides
// roles and the audit log below AAL2. The real thing runs in
// scripts/ops/operator-tools.real-gotrue.test.mjs.

const OWNER_ID = '0a0a0a0a-1111-4222-8333-444444444444';
const OTHER_ID = '0b0b0b0b-1111-4222-8333-444444444444';
const EMAIL = 'dedicated.admin@example.org';
const PASSWORD = 'correct-horse-battery-staple-01';
const NEW_PASSWORD = 'a-brand-new-long-passphrase-02';
const ANON_KEY = 'sb_publishable_test_fake_not_a_real_key_0001';
const API = 'http://127.0.0.1:54321';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const VALID_CODE = '424242';
const INVITE_TOKEN = 'f'.repeat(56);
const INVITE_LINK = `${API}/auth/v1/verify?token=${INVITE_TOKEN}&type=invite&redirect_to=http://127.0.0.1:3000`;
const ENV = Object.freeze({ SUPABASE_BOOTSTRAP_TARGET_ENV: 'local', SUPABASE_URL: API });
const RUN_ARGV = ['run', '--target=local', `--expect-user-id=${OWNER_ID}`, '--confirm-create-canonical-plans'];
const ACCEPT_ARGV = ['accept-invite', '--target=local', `--expect-user-id=${OWNER_ID}`];

// ── A stateful fake Supabase client ────────────────────────────────────────

function makeFakeSupabase({
  users = [{ id: OWNER_ID, email: EMAIL, password: PASSWORD, isAdmin: true, factors: [] }],
  roleRows = [{ user_id: OWNER_ID, role: 'super-admin' }],
  plans = [],
  inviteTokens = { [INVITE_TOKEN]: OWNER_ID },
  enrollFails = false,
} = {}) {
  const state = { users, roleRows, plans, audit: [], inviteTokens: { ...inviteTokens }, session: null, tokens: [] };
  const calls = { signIn: 0, verifyOtp: 0, updateUser: [], signOut: [], enroll: 0, unenroll: [], verify: [], create: [] };
  const listeners = [];
  const emit = (event) => listeners.forEach((cb) => cb(event, state.session));
  const me = () => state.users.find((u) => u.id === state.session?.user.id);
  const newSession = (user, aal) => {
    const s = { user: { id: user.id }, aal, access_token: `at-${crypto.randomUUID()}`, refresh_token: `rt-${crypto.randomUUID()}` };
    state.tokens.push(s.access_token, s.refresh_token);
    return s;
  };
  const isAdmin = () => !!me()?.isAdmin;
  const isAal2Admin = () => isAdmin() && state.session.aal === 'aal2';
  const fail = (message) => ({ data: null, error: { message } });

  const query = (rows) => {
    const result = Promise.resolve({ data: rows, error: null });
    return { order: () => result, then: (a, b) => result.then(a, b) };
  };

  const client = {
    state,
    calls,
    auth: {
      onAuthStateChange: (cb) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword({ email, password }) {
        calls.signIn++;
        const user = state.users.find((u) => u.email === email && u.password === password);
        if (!user) return fail('Invalid login credentials');
        state.session = newSession(user, 'aal1');
        emit('SIGNED_IN');
        return { data: { session: state.session, user: { id: user.id } }, error: null };
      },
      async verifyOtp({ token_hash, type }) {
        calls.verifyOtp++;
        const userId = type === 'invite' ? state.inviteTokens[token_hash] : null;
        if (!userId) return fail('Email link is invalid or has expired');
        delete state.inviteTokens[token_hash];
        state.session = newSession(state.users.find((u) => u.id === userId), 'aal1');
        emit('SIGNED_IN');
        return { data: { session: state.session, user: { id: userId } }, error: null };
      },
      async updateUser({ password }) {
        if (!state.session) return fail('no session');
        calls.updateUser.push(password.length);
        me().password = password;
        return { data: { user: { id: me().id } }, error: null };
      },
      async signOut({ scope }) {
        calls.signOut.push(scope);
        state.session = null;
        return { error: null };
      },
      mfa: {
        async listFactors() {
          const all = me().factors.map((f) => ({ ...f }));
          return { data: { all, totp: all.filter((f) => f.status === 'verified'), phone: [], webauthn: [] }, error: null };
        },
        async enroll({ factorType, issuer }) {
          calls.enroll++;
          if (enrollFails) return fail('MFA enroll is disabled for TOTP');
          const id = crypto.randomUUID();
          me().factors.push({ id, factor_type: factorType, status: 'unverified' });
          const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(EMAIL)}?secret=${TOTP_SECRET}&issuer=x`;
          return { data: { id, type: 'totp', totp: { secret: TOTP_SECRET, uri, qr_code: `<svg>${uri}</svg>` } }, error: null };
        },
        async unenroll({ factorId }) {
          calls.unenroll.push(factorId);
          me().factors = me().factors.filter((f) => f.id !== factorId);
          return { data: { id: factorId }, error: null };
        },
        async challengeAndVerify({ factorId, code }) {
          calls.verify.push(code);
          const factor = me().factors.find((f) => f.id === factorId);
          if (!factor || code !== VALID_CODE) return fail('Invalid TOTP code entered');
          factor.status = 'verified';
          state.session = { ...newSession(me(), 'aal2') };
          emit('MFA_CHALLENGE_VERIFIED');
          return { data: {}, error: null };
        },
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: state.session?.aal ?? null }, error: null };
        },
      },
    },
    async rpc(name, params) {
      if (name === 'is_admin') return { data: isAdmin(), error: null };
      if (name === 'is_super_admin_aal2') return { data: isAal2Admin() && state.roleRows.some((r) => r.user_id === me().id && r.role === 'super-admin'), error: null };
      if (name === 'create_plan_version') {
        calls.create.push({ params, aal: state.session?.aal });
        if (!isAal2Admin()) return fail('create_plan_version: caller is not an AAL2-verified admin');
        if (state.plans.some((p) => p.slug === params.p_slug)) return fail(`create_plan_version: slug ${params.p_slug} already has plan history`);
        const plan = {
          id: crypto.randomUUID(), slug: params.p_slug, name: params.p_name, amount_minor: params.p_amount_minor, currency: params.p_currency,
          billing_interval: params.p_billing_interval, active: true, version: 1, display_order: params.p_display_order,
        };
        state.plans.push(plan);
        state.audit.push({ id: crypto.randomUUID(), actor_admin_id: me().id, action: 'create_plan_version', resource_type: 'plans', resource_id: plan.id });
        return { data: plan, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table) {
      return {
        select: () => {
          if (table === 'plans') return query(isAdmin() ? state.plans : state.plans.filter((p) => p.active));
          if (table === 'admin_role_assignments') return query(isAal2Admin() ? state.roleRows : []);
          if (table === 'admin_audit_log') return query(isAal2Admin() ? state.audit : []);
          throw new Error(`unexpected table ${table}`);
        },
      };
    },
  };
  return client;
}

async function runTool({ argv = RUN_ARGV, env = ENV, io, client = makeFakeSupabase() } = {}) {
  const redactor = makeRedactor();
  let created = 0;
  let error = null;
  let result = null;
  try {
    result = await runOwnerCli({
      argv,
      env,
      io,
      redactor,
      deps: {
        gitState: () => ({ sha: 'c'.repeat(40), dirty: false }),
        createClient: () => {
          created++;
          return client;
        },
        renderQr: async (uri) => `[QR of ${uri}]`,
      },
    });
  } catch (e) {
    error = e;
  }
  return { result, error, io, client, created };
}

const runIo = (codes = [VALID_CODE], { phrase = 'CREATE CANONICAL PLANS local', password = PASSWORD } = {}) =>
  scriptedIo({ hidden: [ANON_KEY, EMAIL, password], visible: [phrase, ...codes] });

function secretsOf(r) {
  return [EMAIL, PASSWORD, NEW_PASSWORD, ANON_KEY, TOTP_SECRET, INVITE_TOKEN, INVITE_LINK, 'otpauth://', ...r.client.state.tokens];
}

const assertCode = (r, code) => {
  assert.ok(r.error instanceof OperatorError, `expected ${code}, got ${r.error ? `${r.error.name}: ${r.error.message}` : 'success'}`);
  assert.equal(r.error.code, code, r.error.message);
};

// ── Arguments, gates and the plan definitions ──────────────────────────────

test('CLI_SPEC: no flag can carry a secret (email, password, key, token, link, code)', () => {
  for (const flag of Object.keys(CLI_SPEC.flags)) {
    assert.ok(!/email|password|token|secret|key|url|link|code/.test(flag), `--${flag} looks like a secret-carrying flag`);
  }
});

test('a secret passed as a flag is refused by name, never echoed', () => {
  for (const flag of ['--email=leak.check@example.com', '--password=leak-check-password', '--anon-key=sb_publishable_leakcheck']) {
    assert.throws(() => parseOwnerArgs(['run', flag]), (e) => {
      assert.equal(e.code, 'BAD_ARGS');
      assert.ok(!e.message.includes(flag.split('=')[1]), 'the value is not echoed');
      return true;
    });
  }
  assert.throws(() => parseOwnerArgs(['create-plans']), /usage:/);
  assert.throws(() => parseOwnerArgs(['accept-invite', '--confirm-create-canonical-plans']), /belongs to run/);
});

test('gates: production under CI, a target mismatch, no --expect-user-id, run without its acknowledgement', async () => {
  const io = scriptedIo();
  let r = await runTool({ argv: ['run', '--target=production', `--expect-user-id=${OWNER_ID}`, '--confirm-create-canonical-plans'], env: { CI: 'true', SUPABASE_BOOTSTRAP_TARGET_ENV: 'production' }, io });
  assertCode(r, 'CI_REMOTE_REFUSED');
  assert.equal(r.created, 0, 'no Supabase client was created under CI');
  assert.deepEqual(io.events, []);
  r = await runTool({ env: { ...ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: 'production' }, io: scriptedIo() });
  assertCode(r, 'TARGET_MISMATCH');
  r = await runTool({ argv: ['run', '--target=local', '--confirm-create-canonical-plans'], io: scriptedIo() });
  assertCode(r, 'BAD_ARGS');
  r = await runTool({ argv: ['run', '--target=local', `--expect-user-id=${OWNER_ID}`], io: scriptedIo() });
  assertCode(r, 'BAD_ARGS');
  r = await runTool({ io: scriptedIo({ interactive: false }) });
  assertCode(r, 'NOT_INTERACTIVE');
});

test('only the anon/publishable key is accepted: a service_role/secret key is refused before any client exists', async () => {
  const r = await runTool({ io: scriptedIo({ hidden: ['sb_secret_test_fake_not_a_real_key_0002'] }) });
  assertCode(r, 'WRONG_KEY');
  assert.equal(r.created, 0);
});

test('plan definitions: exactly Starter, Standard, Premium, identical to the catalog and to backend/config/plans.js', () => {
  const params = canonicalPlanVersionParams();
  assert.deepEqual(params.map((p) => p.p_slug), ['Starter', 'Standard', 'Premium']);
  for (const [i, p] of params.entries()) {
    const c = CANONICAL_PLANS[i];
    assert.deepEqual(
      { slug: p.p_slug, name: p.p_name, amountMinor: p.p_amount_minor, currency: p.p_currency, billingInterval: p.p_billing_interval },
      c
    );
    assert.equal(p.p_amount_minor, PLANS[p.p_slug].amount * 100, `${p.p_slug} matches the live checkout price`);
    assert.equal(p.p_currency, PLANS[p.p_slug].currency);
    assert.equal(p.p_old_plan_id, null, 'always a brand-new plan, never a version of an existing one');
    assert.equal(p.p_display_order, i);
  }
  assert.notEqual(canonicalPlanVersionParams(), canonicalPlanVersionParams(), 'a fresh copy each call: nothing can mutate the definitions');
});

// ── run ────────────────────────────────────────────────────────────────────

test('run, happy path: phrase, one sign-in, MFA enrolled (QR on screen only, cleared), AAL2, super-admin, 3 plans, audit, logout', async () => {
  const io = runIo();
  const r = await runTool({ io });
  assert.equal(r.error, null, r.error?.message);
  const { calls, state } = r.client;
  assert.equal(calls.signIn, 1, 'one sign-in');
  assert.equal(calls.enroll, 1);
  assert.equal(calls.create.length, 3);
  assert.deepEqual(calls.create.map((c) => c.params), canonicalPlanVersionParams(), 'exactly the canonical arguments');
  assert.ok(calls.create.every((c) => c.aal === 'aal2'), 'every create ran on the AAL2 session');
  assert.deepEqual(calls.signOut, ['global'], 'signed out of every session, once, at the end');
  assert.equal(state.plans.length, 3);
  assert.equal(state.audit.length, 3);
  assert.deepEqual(r.result.planIds, state.plans.map((p) => p.id));

  // The QR and setup key went to the screen only, and were cleared right after verification.
  assert.equal(io.sensitive.length, 1);
  assert.ok(io.sensitive[0].includes(TOTP_SECRET) && io.sensitive[0].includes('[QR of otpauth://'));
  const shown = io.events.indexOf('showSensitive');
  const cleared = io.events.indexOf('clearSensitive');
  assert.ok(shown >= 0 && cleared > shown);
  assert.ok(io.events.slice(cleared).every((e) => e !== 'showSensitive'));
  // The phrase came before any credential.
  assert.ok(io.events.findIndex((e) => e.startsWith('visible:Type exactly')) < io.events.findIndex((e) => e.startsWith('hidden:Owner email')));

  for (const line of [`OWNER_USER_ID=${OWNER_ID}`, 'MFA=VERIFIED factor_id=', 'SESSION=aal2', 'ROLE=super-admin', 'PLAN Starter=', 'PLAN Standard=', 'PLAN Premium=', 'AUDIT_ROWS create_plan_version=3 other=0', 'LOGOUT=OK', 'STATUS=success']) {
    assert.ok(io.log.some((l) => l.includes(line)), `missing: ${line}`);
  }
  assert.ok(assertNoLeaks(io.log, secretsOf(r), 'the run log') >= 8);
});

test('run with an already verified factor: no new enrollment and no QR, just a challenge', async () => {
  const client = makeFakeSupabase({ users: [{ id: OWNER_ID, email: EMAIL, password: PASSWORD, isAdmin: true, factors: [{ id: crypto.randomUUID(), factor_type: 'totp', status: 'verified' }] }] });
  const io = runIo();
  const r = await runTool({ io, client });
  assert.equal(r.error, null, r.error?.message);
  assert.equal(client.calls.enroll, 0);
  assert.equal(io.sensitive.length, 0);
  assert.equal(client.state.plans.length, 3);
});

test('wrong TOTP code: refused 3 times -> MFA_VERIFY_FAILED, the new factor removed, QR cleared, 0 plans, signed out', async () => {
  const io = runIo(['000000', '111111', '222222']);
  const r = await runTool({ io });
  assertCode(r, 'MFA_VERIFY_FAILED');
  const { calls, state } = r.client;
  assert.equal(calls.verify.length, MAX_TOTP_ATTEMPTS);
  assert.equal(calls.create.length, 0, 'create_plan_version was never called');
  assert.equal(calls.unenroll.length, 1, 'the unverified factor this run enrolled was removed');
  assert.equal(state.users[0].factors.length, 0);
  assert.ok(io.events.includes('clearSensitive'));
  assert.deepEqual(calls.signOut, ['global']);
  assert.equal(state.plans.length + state.audit.length, 0);
  assertNoLeaks([r.error.message, ...io.log], secretsOf(r));
});

test('MFA not enabled on the project (enroll refused): MFA_ENROLL_FAILED, 0 plans, signed out', async () => {
  const io = runIo([]);
  const r = await runTool({ io, client: makeFakeSupabase({ enrollFails: true }) });
  assertCode(r, 'MFA_ENROLL_FAILED');
  assert.equal(r.client.calls.create.length, 0);
  assert.deepEqual(r.client.calls.signOut, ['global']);
});

test('AAL1 is refused and AAL2 accepted by create_plan_version (fake mirrors is_admin_aal2)', async () => {
  const client = makeFakeSupabase();
  await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const aal1 = await client.rpc('create_plan_version', canonicalPlanVersionParams()[0]);
  assert.match(aal1.error.message, /not an AAL2-verified admin/);
  assert.equal(client.state.plans.length, 0);
  const { data: enrolled } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'x' });
  await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: VALID_CODE });
  const aal2 = await client.rpc('create_plan_version', canonicalPlanVersionParams()[0]);
  assert.equal(aal2.error, null);
  assert.equal(client.state.plans.length, 1);
});

test('role not super-admin: ROLE_NOT_SUPER_ADMIN after AAL2, 0 plans', async () => {
  const r = await runTool({ io: runIo(), client: makeFakeSupabase({ roleRows: [{ user_id: OWNER_ID, role: 'admin' }] }) });
  assertCode(r, 'ROLE_NOT_SUPER_ADMIN');
  assert.equal(r.client.calls.create.length, 0);
  assert.deepEqual(r.client.calls.signOut, ['global']);
});

test('a second admin role row besides the owner: UNEXPECTED_ADMIN_ROLES, 0 plans', async () => {
  const roleRows = [{ user_id: OWNER_ID, role: 'super-admin' }, { user_id: OTHER_ID, role: 'admin' }];
  const r = await runTool({ io: runIo(), client: makeFakeSupabase({ roleRows }) });
  assertCode(r, 'UNEXPECTED_ADMIN_ROLES');
  assert.equal(r.client.calls.create.length, 0);
});

test('a plan already exists (and differs from the catalog): PLANS_ALREADY_EXIST before MFA, nothing created or changed', async () => {
  const existing = { id: crypto.randomUUID(), slug: 'Starter', name: 'Starter', amount_minor: 6000, currency: 'EUR', billing_interval: 'month', active: true, version: 1, display_order: 0 };
  const client = makeFakeSupabase({ plans: [existing] });
  const r = await runTool({ io: runIo([]), client });
  assertCode(r, 'PLANS_ALREADY_EXIST');
  assert.match(r.error.message, /1 plans row\(s\) already exist \(0 identical to the catalog\)/);
  assert.equal(client.calls.enroll, 0, 'no MFA factor enrolled');
  assert.equal(client.calls.create.length, 0);
  assert.deepEqual(client.state.plans, [existing], 'the existing plan is untouched');
  assert.deepEqual(client.calls.signOut, ['global']);
});

test('signed in as another account, or a non-admin: stops before MFA, signed out', async () => {
  const users = [{ id: OTHER_ID, email: EMAIL, password: PASSWORD, isAdmin: true, factors: [] }];
  let r = await runTool({ io: runIo([]), client: makeFakeSupabase({ users }) });
  assertCode(r, 'WRONG_ACCOUNT');
  assert.equal(r.client.calls.enroll, 0);
  r = await runTool({ io: runIo([]), client: makeFakeSupabase({ users: [{ id: OWNER_ID, email: EMAIL, password: PASSWORD, isAdmin: false, factors: [] }] }) });
  assertCode(r, 'NOT_ADMIN');
  assert.equal(r.client.calls.enroll, 0);
  assert.deepEqual(r.client.calls.signOut, ['global']);
});

test('a refused sign-in stops at once: one attempt, no MFA, nothing created', async () => {
  const r = await runTool({ io: runIo([], { password: 'not-the-password-at-all' }) });
  assertCode(r, 'LOGIN_FAILED');
  assert.equal(r.client.calls.signIn, 1);
  assert.equal(r.client.calls.enroll + r.client.calls.create.length, 0);
  assertNoLeaks([r.error.message, ...r.io.log], [...secretsOf(r), 'not-the-password-at-all']);
});

test('a wrong confirmation phrase stops before any credential is asked', async () => {
  const io = scriptedIo({ hidden: [ANON_KEY], visible: ['CREATE CANONICAL PLANS production'] });
  const r = await runTool({ io });
  assertCode(r, 'NOT_CONFIRMED');
  assert.equal(r.client.calls.signIn, 0);
  assert.ok(!io.events.some((e) => e.startsWith('hidden:Owner email')));
});

// ── accept-invite ──────────────────────────────────────────────────────────

const acceptIo = (link = INVITE_LINK, pw = [NEW_PASSWORD, NEW_PASSWORD]) => scriptedIo({ hidden: [ANON_KEY, link, ...pw] });

test('accept-invite: the password is asked BEFORE the one-time link is used; one update; signed out', async () => {
  const io = acceptIo();
  const r = await runTool({ argv: ACCEPT_ARGV, io });
  assert.equal(r.error, null, r.error?.message);
  const { calls, state } = r.client;
  assert.equal(calls.verifyOtp, 1);
  assert.deepEqual(calls.updateUser, [NEW_PASSWORD.length]);
  assert.equal(state.users[0].password, NEW_PASSWORD);
  assert.deepEqual(calls.signOut, ['global']);
  assert.equal(calls.enroll + calls.create.length, 0, 'no MFA and no plan in accept-invite');
  assert.ok(io.log.includes(`INVITE_ACCEPTED=YES user_id=${OWNER_ID}`) && io.log.includes('PASSWORD_SET=YES'));
  assertNoLeaks(io.log, secretsOf(r));
});

test('accept-invite: a password typo stops BEFORE the link is used (it still works afterwards)', async () => {
  const client = makeFakeSupabase();
  let r = await runTool({ argv: ACCEPT_ARGV, io: acceptIo(INVITE_LINK, [NEW_PASSWORD, `${NEW_PASSWORD}x`]), client });
  assertCode(r, 'PASSWORD_MISMATCH');
  assert.equal(client.calls.verifyOtp, 0);
  r = await runTool({ argv: ACCEPT_ARGV, io: acceptIo(INVITE_LINK, ['short', 'short']), client });
  assertCode(r, 'PASSWORD_TOO_SHORT');
  assert.equal(client.calls.verifyOtp, 0);
  r = await runTool({ argv: ACCEPT_ARGV, io: acceptIo(), client });
  assert.equal(r.error, null, r.error?.message);
});

test('accept-invite: a used link, a wrong account, and links from elsewhere are refused', async () => {
  const client = makeFakeSupabase();
  await runTool({ argv: ACCEPT_ARGV, io: acceptIo(), client });
  let r = await runTool({ argv: ACCEPT_ARGV, io: acceptIo(), client });
  assertCode(r, 'INVITE_LINK_REJECTED');

  const other = makeFakeSupabase({ users: [{ id: OTHER_ID, email: EMAIL, password: PASSWORD, isAdmin: true, factors: [] }], inviteTokens: { [INVITE_TOKEN]: OTHER_ID } });
  r = await runTool({ argv: ACCEPT_ARGV, io: acceptIo(), client: other });
  assertCode(r, 'WRONG_ACCOUNT');
  assert.equal(other.calls.updateUser.length, 0, 'no password set on the wrong account');
  assert.deepEqual(other.calls.signOut, ['global']);

  for (const link of [
    `https://evil.example.com/auth/v1/verify?token=${INVITE_TOKEN}&type=invite`,
    `${API}/auth/v1/verify?token=${INVITE_TOKEN}&type=recovery`,
    `${API}/auth/v1/verify?type=invite`,
    'not a link at all',
  ]) {
    assert.throws(() => parseInviteLink(link, { apiUrl: API }), (e) => e.code === 'BAD_INVITE_LINK' && !e.message.includes(INVITE_TOKEN));
  }
  assert.deepEqual(parseInviteLink(INVITE_LINK, { apiUrl: API }), { tokenHash: INVITE_TOKEN });
});
