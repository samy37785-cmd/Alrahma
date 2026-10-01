import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_SPEC,
  validateCliArgs,
  resolveRunConfig,
  runBootstrap,
  isValidEmailShape,
  BootstrapError,
} from '../scripts/ops/lib/supabase-first-super-admin-bootstrap-core.mjs';
import { parseStrictCliArgs } from '../scripts/migration/lib/cli-args.mjs';

// Ops tooling for bootstrapping the FIRST Supabase-native super-admin
// identity. Every test here uses plain in-memory objects as Supabase Auth
// Admin API / Postgres stand-ins — no real network call, no real Postgres
// connection, no @supabase/supabase-js client is ever constructed in this
// file. This tool is never actually run against any real project as part
// of this change — see docs/supabase-first-super-admin-bootstrap-runbook.md.

const BASE_ENV = Object.freeze({
  ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1',
  SUPABASE_BOOTSTRAP_TARGET_ENV: 'staging',
  SUPABASE_URL: 'https://fake-project.example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test-not-a-real-value',
  SUPABASE_DB_URL: 'postgresql://fake:fake@fake-db.example.invalid:5432/postgres',
});

const BASE_APPLY_ARGS = Object.freeze({
  apply: true,
  'confirm-create-first-super-admin': true,
  target: 'staging',
  email: 'owner@example.com',
});

// ── Fake Postgres (service_role transaction) ────────────────────────────────

function makeFakeDb({ adminRoleAssignments = [], profiles = {}, authUsersByEmail = {} } = {}) {
  const state = {
    adminRoleAssignments: [...adminRoleAssignments],
    profiles: new Map(Object.entries(profiles)),
    authUsersByEmail: new Map(Object.entries(authUsersByEmail)),
  };
  const queries = [];

  async function query(sql, params = []) {
    const s = sql.trim();
    queries.push(s.split('\n')[0].trim());

    if (s.startsWith('SELECT 1 FROM admin_role_assignments')) {
      return { rows: state.adminRoleAssignments.length ? [{}] : [] };
    }
    if (s.startsWith("SELECT 1 FROM profiles WHERE role = 'admin'")) {
      const any = [...state.profiles.values()].some((p) => p.role === 'admin');
      return { rows: any ? [{}] : [] };
    }
    if (s.startsWith('SELECT id FROM auth.users WHERE email')) {
      const id = state.authUsersByEmail.get(params[0]);
      return { rows: id ? [{ id }] : [] };
    }
    if (s.startsWith('UPDATE profiles SET role')) {
      const id = params[0];
      const p = state.profiles.get(id) ?? {};
      state.profiles.set(id, { ...p, role: 'admin' });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO admin_role_assignments')) {
      state.adminRoleAssignments.push({ user_id: params[0], role: 'super-admin' });
      return { rows: [] };
    }
    if (s.startsWith('SELECT role FROM profiles WHERE id')) {
      const p = state.profiles.get(params[0]);
      return { rows: p ? [{ role: p.role }] : [] };
    }
    if (s.startsWith('SELECT role FROM admin_role_assignments WHERE user_id')) {
      const row = state.adminRoleAssignments.find((r) => r.user_id === params[0]);
      return { rows: row ? [{ role: row.role }] : [] };
    }
    throw new Error(`unexpected query in fake db: ${s}`);
  }

  async function runInServiceRoleTransaction(fn) {
    return fn({ query });
  }

  return { state, queries, runInServiceRoleTransaction };
}

function makeFakeInvite({ newUserId = 'new-user-id-1', fail = false } = {}) {
  const calls = [];
  return {
    calls,
    inviteUser: async (email) => {
      calls.push(email);
      if (fail) return { data: null, error: new Error('invite rejected') };
      return { data: { user: { id: newUserId, email } }, error: null };
    },
  };
}

function makeFakeDelete() {
  const calls = [];
  return { calls, deleteUser: async (userId) => { calls.push(userId); } };
}

// ── CLI arg parsing + gate validation ──────────────────────────────────────

test('CLI_SPEC: apply/dry-run/confirm flags are boolean-only, target/email require a value', () => {
  assert.throws(() => parseStrictCliArgs(['--apply=true'], CLI_SPEC), /boolean flag/);
  assert.throws(() => parseStrictCliArgs(['--target'], CLI_SPEC), /non-empty/);
  assert.doesNotThrow(() => parseStrictCliArgs(['--apply', '--target=staging', '--email=a@b.com'], CLI_SPEC));
});

test('validateCliArgs: --apply and --dry-run together is rejected', () => {
  assert.throws(() => validateCliArgs({ apply: true, 'dry-run': true }), /cannot be combined/);
});

test('validateCliArgs: apply-only flags without --apply are rejected', () => {
  assert.throws(() => validateCliArgs({ target: 'staging' }), /--target only has meaning together with --apply/);
  assert.throws(() => validateCliArgs({ email: 'a@b.com' }), /--email only has meaning together with --apply/);
});

test('validateCliArgs: --apply without --confirm-create-first-super-admin is rejected', () => {
  assert.throws(
    () => validateCliArgs({ apply: true, target: 'staging', email: 'a@b.com' }),
    /--confirm-create-first-super-admin/
  );
});

test('validateCliArgs: --apply with an invalid --target is rejected', () => {
  assert.throws(
    () => validateCliArgs({ apply: true, 'confirm-create-first-super-admin': true, target: 'prod', email: 'a@b.com' }),
    /--target=staging or --target=production/
  );
});

test('validateCliArgs: --apply with a malformed --email is rejected', () => {
  assert.throws(
    () => validateCliArgs({ apply: true, 'confirm-create-first-super-admin': true, target: 'staging', email: 'not-an-email' }),
    /valid --email/
  );
});

test('isValidEmailShape', () => {
  assert.equal(isValidEmailShape('owner@example.com'), true);
  assert.equal(isValidEmailShape('not-an-email'), false);
  assert.equal(isValidEmailShape(''), false);
  assert.equal(isValidEmailShape(undefined), false);
});

// ── resolveRunConfig — the five --apply gates ───────────────────────────────

test('resolveRunConfig: default (no flags) is a dry-run and requires no env vars at all', () => {
  const config = resolveRunConfig({ args: {}, env: {} });
  assert.equal(config.apply, false);
});

test('resolveRunConfig: --apply without ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 fails closed', () => {
  const env = { ...BASE_ENV, ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: undefined };
  assert.throws(() => resolveRunConfig({ args: BASE_APPLY_ARGS, env }), /ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1/);
});

test('resolveRunConfig: --target mismatched against SUPABASE_BOOTSTRAP_TARGET_ENV fails closed', () => {
  const env = { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: 'production' };
  assert.throws(() => resolveRunConfig({ args: BASE_APPLY_ARGS, env }), /does not match SUPABASE_BOOTSTRAP_TARGET_ENV/);
});

test('resolveRunConfig: SUPABASE_BOOTSTRAP_TARGET_ENV unset fails closed (never defaults to a match)', () => {
  const env = { ...BASE_ENV, SUPABASE_BOOTSTRAP_TARGET_ENV: undefined };
  assert.throws(() => resolveRunConfig({ args: BASE_APPLY_ARGS, env }), /does not match SUPABASE_BOOTSTRAP_TARGET_ENV/);
});

for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
  test(`resolveRunConfig: missing ${key} fails closed before any connection`, () => {
    const env = { ...BASE_ENV, [key]: undefined };
    assert.throws(() => resolveRunConfig({ args: BASE_APPLY_ARGS, env }), new RegExp(`${key} is not set`));
  });
}

test('resolveRunConfig: all five gates satisfied returns an apply config', () => {
  const config = resolveRunConfig({ args: BASE_APPLY_ARGS, env: BASE_ENV });
  assert.equal(config.apply, true);
  assert.equal(config.target, 'staging');
  assert.equal(config.email, 'owner@example.com');
  assert.equal(config.confirmPromoteExisting, false);
});

// ── runBootstrap — the write sequence, all I/O injected/fake ───────────────

test('runBootstrap: a brand-new email creates Auth, then profile, then super-admin role, in order', async () => {
  const db = makeFakeDb();
  const invite = makeFakeInvite({ newUserId: 'uid-123' });
  const del = makeFakeDelete();

  const result = await runBootstrap({
    email: 'owner@example.com',
    confirmPromoteExisting: false,
    inviteUser: invite.inviteUser,
    deleteUser: del.deleteUser,
    runInServiceRoleTransaction: db.runInServiceRoleTransaction,
  });

  assert.deepEqual(result, { status: 'success', createdByThisRun: true, promoted: true });
  assert.deepEqual(invite.calls, ['owner@example.com']);
  assert.equal(del.calls.length, 0, 'no compensation on a successful run');
  assert.equal(db.state.profiles.get('uid-123').role, 'admin');
  assert.deepEqual(db.state.adminRoleAssignments, [{ user_id: 'uid-123', role: 'super-admin' }]);

  // Order: the profile UPDATE must precede the admin_role_assignments
  // INSERT (admin_set_admin_role()'s own order, mirrored here).
  const updateIdx = db.queries.findIndex((q) => q.startsWith('UPDATE profiles'));
  const insertIdx = db.queries.findIndex((q) => q.startsWith('INSERT INTO admin_role_assignments'));
  assert.ok(updateIdx !== -1 && insertIdx !== -1 && updateIdx < insertIdx);

  // No secret/password/token anywhere in the result the CLI would log.
  const logged = JSON.stringify({ status: result.status, createdByThisRun: result.createdByThisRun, promoted: result.promoted });
  assert.ok(!logged.includes('owner@example.com'));
  assert.ok(!/password|token|secret/i.test(logged));
});

test('runBootstrap: an existing admin_role_assignments row blocks the whole run', async () => {
  const db = makeFakeDb({ adminRoleAssignments: [{ user_id: 'someone', role: 'admin' }] });
  const invite = makeFakeInvite();
  const del = makeFakeDelete();

  await assert.rejects(
    runBootstrap({
      email: 'owner@example.com',
      confirmPromoteExisting: false,
      inviteUser: invite.inviteUser,
      deleteUser: del.deleteUser,
      runInServiceRoleTransaction: db.runInServiceRoleTransaction,
    }),
    (err) => {
      assert.ok(err instanceof BootstrapError);
      assert.equal(err.code, 'EXISTING_ADMIN_FOUND');
      return true;
    }
  );
  assert.equal(invite.calls.length, 0, 'no Auth account should ever be created once an admin already exists');
  assert.equal(del.calls.length, 0);
});

test('runBootstrap: an orphaned profiles.role=admin row (no admin_role_assignments) fails closed as ambiguous', async () => {
  const db = makeFakeDb({ profiles: { 'orphan-id': { role: 'admin' } } });
  const invite = makeFakeInvite();

  await assert.rejects(
    runBootstrap({
      email: 'owner@example.com',
      confirmPromoteExisting: false,
      inviteUser: invite.inviteUser,
      deleteUser: makeFakeDelete().deleteUser,
      runInServiceRoleTransaction: db.runInServiceRoleTransaction,
    }),
    (err) => { assert.equal(err.code, 'AMBIGUOUS_ADMIN_STATE'); return true; }
  );
  assert.equal(invite.calls.length, 0);
});

test('runBootstrap: an existing auth.users account for the email is never silently promoted', async () => {
  const db = makeFakeDb({ authUsersByEmail: { 'owner@example.com': 'existing-uid' } });
  const invite = makeFakeInvite();
  const del = makeFakeDelete();

  await assert.rejects(
    runBootstrap({
      email: 'owner@example.com',
      confirmPromoteExisting: false,
      inviteUser: invite.inviteUser,
      deleteUser: del.deleteUser,
      runInServiceRoleTransaction: db.runInServiceRoleTransaction,
    }),
    (err) => { assert.equal(err.code, 'EXISTING_ACCOUNT_REQUIRES_CONFIRMATION'); return true; }
  );
  assert.equal(invite.calls.length, 0, 'an existing account must never trigger a NEW invite');
  assert.equal(db.state.profiles.get('existing-uid'), undefined, 'the existing profile must be untouched');
  assert.equal(db.state.adminRoleAssignments.length, 0);
});

test('runBootstrap: --confirm-promote-existing-account allows promoting a pre-existing account, without a new invite', async () => {
  const db = makeFakeDb({ authUsersByEmail: { 'owner@example.com': 'existing-uid' } });
  const invite = makeFakeInvite();
  const del = makeFakeDelete();

  const result = await runBootstrap({
    email: 'owner@example.com',
    confirmPromoteExisting: true,
    inviteUser: invite.inviteUser,
    deleteUser: del.deleteUser,
    runInServiceRoleTransaction: db.runInServiceRoleTransaction,
  });

  assert.deepEqual(result, { status: 'success', createdByThisRun: false, promoted: true });
  assert.equal(invite.calls.length, 0, 'promoting an existing account must never also invite a new one');
  assert.equal(db.state.profiles.get('existing-uid').role, 'admin');
  assert.deepEqual(db.state.adminRoleAssignments, [{ user_id: 'existing-uid', role: 'super-admin' }]);
});

test('runBootstrap: a profile/role write failure compensates ONLY the identity this run itself created', async () => {
  const db = makeFakeDb();
  // Force the second (promote) transaction to fail, after the Auth
  // identity has already been "created" by the fake invite below.
  let transactionCount = 0;
  const realRun = db.runInServiceRoleTransaction;
  const flakyRun = async (fn) => {
    transactionCount += 1;
    if (transactionCount === 2) throw new Error('simulated promote-transaction failure');
    return realRun(fn);
  };
  const invite = makeFakeInvite({ newUserId: 'uid-456' });
  const del = makeFakeDelete();

  const result = await runBootstrap({
    email: 'owner@example.com',
    confirmPromoteExisting: false,
    inviteUser: invite.inviteUser,
    deleteUser: del.deleteUser,
    runInServiceRoleTransaction: flakyRun,
  });

  assert.deepEqual(result, { status: 'failed_compensated', createdByThisRun: true, promoted: false });
  assert.deepEqual(del.calls, ['uid-456'], 'compensation must target exactly the id this run created, nothing else');
});

test('runBootstrap: a promote failure for an EXISTING (not newly-created) account never triggers compensation', async () => {
  const db = makeFakeDb({ authUsersByEmail: { 'owner@example.com': 'existing-uid' } });
  let transactionCount = 0;
  const realRun = db.runInServiceRoleTransaction;
  const flakyRun = async (fn) => {
    transactionCount += 1;
    if (transactionCount === 2) throw new Error('simulated promote-transaction failure');
    return realRun(fn);
  };
  const del = makeFakeDelete();

  await assert.rejects(
    runBootstrap({
      email: 'owner@example.com',
      confirmPromoteExisting: true,
      inviteUser: makeFakeInvite().inviteUser,
      deleteUser: del.deleteUser,
      runInServiceRoleTransaction: flakyRun,
    }),
    /simulated promote-transaction failure/
  );
  assert.equal(del.calls.length, 0, 'never delete an account this run did not itself create');
});

test('runBootstrap: a failed invite performs no writes and no compensation', async () => {
  const db = makeFakeDb();
  const invite = makeFakeInvite({ fail: true });
  const del = makeFakeDelete();

  await assert.rejects(
    runBootstrap({
      email: 'owner@example.com',
      confirmPromoteExisting: false,
      inviteUser: invite.inviteUser,
      deleteUser: del.deleteUser,
      runInServiceRoleTransaction: db.runInServiceRoleTransaction,
    }),
    (err) => { assert.equal(err.code, 'INVITE_FAILED'); return true; }
  );
  assert.equal(del.calls.length, 0);
  assert.equal(db.state.adminRoleAssignments.length, 0);
});
