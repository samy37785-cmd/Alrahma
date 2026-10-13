// Core of supabase-recover-first-super-admin.mjs. All I/O is injected (the
// terminal, git, the Auth Admin client, the read-only Postgres runner), so the
// whole run -- gates, prompts, the exact-state check, the one write -- is
// testable against fakes and against a real local Supabase stack. The CLI file
// only wires the real implementations.
//
// WHY IT EXISTS: supabase-first-super-admin-bootstrap.mjs sent ONE invite to
// the Super Admin. If that link is not accepted within the project's Email OTP
// lifetime (default 60 minutes) it expires, and the account is stuck: the
// bootstrap refuses to run again (an admin row exists), the old link is dead
// (and, if it was ever shown on a screen, must not be revived), and sending a
// new invite or deleting the account are different, larger decisions. This
// tool finishes the SAME account instead: it sets a password the owner types
// and confirms the email, nothing else.
//
// WHAT ONE RUN DOES, in order.
//   1. Gates, before any input or connection: --apply,
//      --confirm-recover-super-admin-account, --expect-id-prefix=<8 hex>,
//      ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY=1, --target=local|production equal
//      to SUPABASE_RECOVERY_TARGET_ENV, no production target under CI, and for
//      production a clean checkout.
//   2. Reads the account's full UUID, then the database URL and the service
//      role key, all hidden. The UUID must start with --expect-id-prefix, and
//      both secrets must belong to the target project.
//   3. Read-only, exact-state check. It stops, with nothing changed, unless:
//        AUTH_USERS=1 ADMIN_PROFILES=1 SUPER_ADMIN_ASSIGNMENTS=1
//        EMAIL_CONFIRMED=NO LAST_SIGN_IN_PRESENT=NO HAS_PASSWORD=NO
//        SESSIONS=0 MFA_FACTORS=0 AUTH_AUDIT_ROWS=0
//      and the one auth user, the one admin profile and the one
//      super-admin role row are all THIS account (and it is not banned).
//   4. Only then reads the new password twice, hidden, and requires the typed
//      phrase RECOVER SUPER-ADMIN <projectRef> <prefix>.
//   5. Re-checks the state, then makes exactly ONE Auth Admin call for that
//      id with exactly { password, email_confirm: true }, and reads the state
//      back. If the read-back is not what it should be, it says so and tells
//      the owner not to run it again.
// It never sends an email, creates a token, user, profile or role, signs in,
// enrolls MFA, creates plans, or touches DATA_BACKEND or Render. It prints
// statuses and the 8-character id prefix only -- never the email, the full id,
// the password, a token or a key.
import { parseStrictCliArgs } from '../../migration/lib/cli-args.mjs';
import {
  OperatorError,
  assertApiKey,
  assertDbUrlTarget,
  assertNoRemoteTargetInCi,
  isUuid,
  parseTarget,
  registerDbUrl,
  requireConfirmationPhrase,
  requireInteractive,
  resolveSupabaseApi,
  secretInput,
} from './operator-io.mjs';

export const TOOL = 'supabase-super-admin-recovery';

export const CLI_SPEC = {
  flags: {
    apply: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'confirm-recover-super-admin-account': { type: 'boolean' },
    target: { type: 'string' },
    'expect-id-prefix': { type: 'string' },
  },
};

export const MIN_PASSWORD_LENGTH = 14;
const MIN_DISTINCT_CHARACTERS = 8;
const ID_PREFIX_RE = /^[0-9a-f]{8}$/;

// ── Arguments and gates ────────────────────────────────────────────────────

export function parseArgs(argv) {
  try {
    return parseStrictCliArgs(argv, CLI_SPEC);
  } catch (err) {
    throw new OperatorError('BAD_ARGS', err.message);
  }
}

export function validateCliArgs(args) {
  if (args.apply && args['dry-run']) {
    throw new OperatorError('BAD_ARGS', '--apply and --dry-run cannot be combined -- pass one or the other (default is dry-run).');
  }
  const applyOnlyFlags = ['confirm-recover-super-admin-account', 'target', 'expect-id-prefix'];
  if (!args.apply) {
    for (const flag of applyOnlyFlags) {
      if (args[flag] !== undefined) throw new OperatorError('BAD_ARGS', `--${flag} only has meaning together with --apply.`);
    }
    return;
  }
  if (!args['confirm-recover-super-admin-account']) {
    throw new OperatorError(
      'BAD_ARGS',
      '--apply requires --confirm-recover-super-admin-account as a second, explicit, independent acknowledgement.'
    );
  }
  parseTarget(args.target);
  if (!ID_PREFIX_RE.test(args['expect-id-prefix'] ?? '')) {
    throw new OperatorError('BAD_ARGS', '--expect-id-prefix=<the first 8 hex characters of the account id> is required with --apply.');
  }
}

/** Pure gate check: parsed args + env -> run config, or throws. No input, no connection. */
export function resolveRunConfig({ args, env }) {
  validateCliArgs(args);
  if (!args.apply) return { apply: false };
  if (env.ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY !== '1') {
    throw new OperatorError(
      'NOT_AUTHORIZED',
      '--apply refuses to run: ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY=1 must be set as an explicit, dedicated authorization for this run.'
    );
  }
  assertNoRemoteTargetInCi({ env, target: args.target });
  if (env.SUPABASE_RECOVERY_TARGET_ENV !== args.target) {
    throw new OperatorError(
      'TARGET_MISMATCH',
      `--target=${args.target} does not match SUPABASE_RECOVERY_TARGET_ENV (${env.SUPABASE_RECOVERY_TARGET_ENV ? 'set to something else' : 'unset'})`
    );
  }
  return { apply: true, target: args.target, expectIdPrefix: args['expect-id-prefix'] };
}

// ── The password ───────────────────────────────────────────────────────────

/** Throws an OperatorError for a password that is not strong enough. Never echoes any part of it. */
export function assertStrongPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new OperatorError('PASSWORD_TOO_SHORT', `the password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password !== password.trim()) {
    throw new OperatorError('PASSWORD_WHITESPACE', 'the password must not start or end with a space -- nothing was changed');
  }
  if (new Set(password).size < MIN_DISTINCT_CHARACTERS) {
    throw new OperatorError('PASSWORD_TOO_SIMPLE', `the password must use at least ${MIN_DISTINCT_CHARACTERS} different characters`);
  }
}

// ── Reading the account state (read-only) ──────────────────────────────────

/** Wraps a client so that anything but a SELECT/SHOW is refused before it is sent. */
export function selectOnly(client) {
  return {
    query: (sql, params) => {
      if (!/^\s*(select|show)\b/i.test(sql)) throw new OperatorError('NOT_READ_ONLY', 'the state check only ever sends SELECT/SHOW statements');
      return client.query(sql, params);
    },
  };
}

/**
 * Everything the exact-state check needs, as plain SELECTs, for one account id.
 * It never selects an email, a hash, a token or an IP. `account` is null when
 * no auth.users row has this id.
 */
export async function readRecoveryState({ userId, readOnly }) {
  return readOnly(async (rawClient) => {
    const client = selectOnly(rawClient);
    const n = async (sql, params) => (await client.query(sql, params)).rows[0].n;
    const state = {
      authUsers: await n('select count(*)::int as n from auth.users'),
      adminProfiles: await n(`select count(*)::int as n from public.profiles where role = 'admin'`),
      roleRows: await n('select count(*)::int as n from public.admin_role_assignments'),
      account: null,
    };
    const { rows } = await client.query(
      `select (to_jsonb(u)->>'email_confirmed_at') is not null as confirmed,
              (to_jsonb(u)->>'last_sign_in_at') is not null as signed_in,
              coalesce(to_jsonb(u)->>'encrypted_password', '') <> '' as has_password,
              (to_jsonb(u)->>'banned_until') is not null as banned
         from auth.users u where u.id = $1::uuid`,
      [userId]
    );
    if (!rows[0]) return state;
    state.account = {
      emailConfirmed: rows[0].confirmed === true,
      lastSignInPresent: rows[0].signed_in === true,
      hasPassword: rows[0].has_password === true,
      banned: rows[0].banned === true,
      sessions: await n('select count(*)::int as n from auth.sessions where user_id = $1::uuid', [userId]),
      mfaFactors: await n('select count(*)::int as n from auth.mfa_factors where user_id = $1::uuid', [userId]),
      // The same predicate as supabase-state-report: action names and times are not read, only the count.
      authAuditRows: await n(
        `select count(*)::int as n from auth.audit_log_entries where payload->>'actor_id' = $1 or payload->'traits'->>'user_id' = $1`,
        [userId]
      ),
      pendingConfirmationTokens: await n(
        `select count(*)::int as n from auth.one_time_tokens where user_id = $1::uuid and token_type::text = 'confirmation_token'`,
        [userId]
      ),
      profileRole: (await client.query('select role::text as role from public.profiles where id = $1::uuid', [userId])).rows[0]?.role ?? null,
      adminRoles: (await client.query('select role::text as role from public.admin_role_assignments where user_id = $1::uuid order by 1', [userId])).rows.map((r) => r.role),
    };
    return state;
  });
}

const yn = (v) => (v ? 'YES' : 'NO');

/** The state as key=value lines (statuses and counts only). */
export function renderRecoveryState(state, idPrefix) {
  const a = state.account;
  return [
    `USER_ID_PREFIX=${idPrefix} ACCOUNT_EXISTS=${yn(a)}`,
    `AUTH_USERS=${state.authUsers} ADMIN_PROFILES=${state.adminProfiles} SUPER_ADMIN_ASSIGNMENTS=${state.roleRows}`,
    ...(a
      ? [
          `EMAIL_CONFIRMED=${yn(a.emailConfirmed)} LAST_SIGN_IN_PRESENT=${yn(a.lastSignInPresent)} HAS_PASSWORD=${yn(a.hasPassword)}`,
          `SESSIONS=${a.sessions} MFA_FACTORS=${a.mfaFactors} AUTH_AUDIT_ROWS=${a.authAuditRows} BANNED=${yn(a.banned)}`,
          `PENDING_CONFIRMATION_TOKEN=${yn(a.pendingConfirmationTokens > 0)} PROFILE_ROLE=${a.profileRole ?? 'none'} ADMIN_ROLE=${a.adminRoles.join(',') || 'none'}`,
        ]
      : []),
  ];
}

/** The list of things that differ from the one state this tool will act on. Empty means "exactly that state". */
export function stateMismatches(state) {
  const a = state.account;
  const out = [];
  const expect = (name, actual, expected) => {
    if (actual !== expected) out.push(`${name}=${actual} (expected ${expected})`);
  };
  expect('AUTH_USERS', state.authUsers, 1);
  expect('ADMIN_PROFILES', state.adminProfiles, 1);
  expect('SUPER_ADMIN_ASSIGNMENTS', state.roleRows, 1);
  if (!a) {
    out.push('ACCOUNT_EXISTS=NO (expected YES)');
    return out;
  }
  expect('EMAIL_CONFIRMED', yn(a.emailConfirmed), 'NO');
  expect('LAST_SIGN_IN_PRESENT', yn(a.lastSignInPresent), 'NO');
  expect('HAS_PASSWORD', yn(a.hasPassword), 'NO');
  expect('SESSIONS', a.sessions, 0);
  expect('MFA_FACTORS', a.mfaFactors, 0);
  expect('AUTH_AUDIT_ROWS', a.authAuditRows, 0);
  expect('BANNED', yn(a.banned), 'NO');
  expect('PROFILE_ROLE', a.profileRole, 'admin');
  expect('ADMIN_ROLE', a.adminRoles.join(','), 'super-admin');
  return out;
}

export function assertExactState(state) {
  const bad = stateMismatches(state);
  if (bad.length > 0) {
    throw new OperatorError('STATE_MISMATCH', `the account is not in the one state this tool recovers (${bad.join('; ')}) -- nothing was changed`);
  }
}

/** The state after the write must be the recovered one, and nothing else may have moved. */
function postWriteMismatches(before, after) {
  const a = after.account;
  if (!a) return ['ACCOUNT_EXISTS=NO'];
  const out = [];
  if (after.authUsers !== before.authUsers) out.push('AUTH_USERS changed');
  if (after.adminProfiles !== before.adminProfiles) out.push('ADMIN_PROFILES changed');
  if (after.roleRows !== before.roleRows) out.push('SUPER_ADMIN_ASSIGNMENTS changed');
  if (!a.emailConfirmed) out.push('EMAIL_CONFIRMED=NO');
  if (!a.hasPassword) out.push('HAS_PASSWORD=NO');
  if (a.lastSignInPresent) out.push('LAST_SIGN_IN_PRESENT=YES');
  if (a.sessions !== 0) out.push(`SESSIONS=${a.sessions}`);
  if (a.mfaFactors !== 0) out.push(`MFA_FACTORS=${a.mfaFactors}`);
  if (a.profileRole !== 'admin') out.push('PROFILE_ROLE changed');
  if (a.adminRoles.join(',') !== 'super-admin') out.push('ADMIN_ROLE changed');
  return out;
}

const sameState = (x, y) => JSON.stringify(x) === JSON.stringify(y);

// ── The write ──────────────────────────────────────────────────────────────

/**
 * Re-checks the exact state, makes the one Auth Admin call, reads back.
 * setPasswordAndConfirm(userId, password) -> {data, error}.
 */
export async function applyRecovery({ userId, password, readOnly, setPasswordAndConfirm, redactor }) {
  const before = await readRecoveryState({ userId, readOnly });
  assertExactState(before);

  let callError = null;
  try {
    const { data, error } = await setPasswordAndConfirm(userId, password);
    if (error) callError = error;
    else if (data?.user?.id !== userId) callError = new Error('the Auth service returned a different account than the one requested');
  } catch (err) {
    callError = err;
  }

  const after = await readRecoveryState({ userId, readOnly });
  if (callError) {
    const detail = redactor ? redactor.text(callError.message ?? String(callError)) : 'see the Supabase Auth logs';
    if (sameState(before, after)) {
      throw new OperatorError('RECOVERY_REFUSED', `the Auth service refused the change (${detail}) -- the account is unchanged`);
    }
    throw new OperatorError(
      'RECOVERY_UNCERTAIN',
      `the Auth call failed (${detail}) but the account state changed -- do NOT run --apply again; run supabase-state-report.mjs and ask for review`
    );
  }
  const bad = postWriteMismatches(before, after);
  if (bad.length > 0) {
    throw new OperatorError(
      'POST_WRITE_VERIFICATION_FAILED',
      `the account did not read back as expected (${bad.join('; ')}) -- do NOT run --apply again; run supabase-state-report.mjs and ask for review`
    );
  }
  return { status: 'success', before, after };
}

// ── The whole run ──────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string[]} p.argv
 * @param {object} p.env
 * @param {object} p.io - interactive, print, promptHidden, promptVisible
 * @param {object} p.redactor - operator-io makeRedactor()
 * @param {object} p.deps
 * @param {() => {sha: string, dirty: boolean}} p.deps.gitState
 * @param {(url, serviceKey) => {setPasswordAndConfirm}} p.deps.createAuthAdmin
 * @param {(dbUrl) => {readOnly, end}} p.deps.createDb
 */
export async function runRecoveryCli({ argv, env, io, redactor, deps }) {
  const config = resolveRunConfig({ args: parseArgs(argv), env });
  io.print(`[${TOOL}] mode=${config.apply ? 'apply' : 'dry-run'}`);
  if (!config.apply) {
    io.print(`[${TOOL}] dry-run only -- no input was read, no connection was made, nothing was written.`);
    io.print(
      `[${TOOL}] to apply: --apply --confirm-recover-super-admin-account --target=<local|production> --expect-id-prefix=<8 hex>, ` +
      'with ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY=1 and SUPABASE_RECOVERY_TARGET_ENV equal to --target. ' +
      'The account id, the database URL, the service key and the new password are asked for, hidden.'
    );
    return { status: 'dry-run' };
  }

  requireInteractive(io);
  const { target, expectIdPrefix } = config;
  const git = deps.gitState();
  if (target === 'production' && git.dirty) {
    throw new OperatorError('DIRTY_CHECKOUT', 'the checkout has uncommitted changes -- run from a clean checkout of the reviewed commit');
  }
  const { url, projectRef } = resolveSupabaseApi({ target, env });
  io.print(`[${TOOL}] target=${target} projectRef=${projectRef} gitSha=${git.sha} account-prefix=${expectIdPrefix}`);
  io.print(`[${TOOL}] next: read-only exact-state check, then ONE call that sets the password and confirms the email of that account. No email is sent.`);

  const typedId = String(await io.promptHidden('Super Admin account id, the full UUID (hidden): ')).trim().toLowerCase();
  redactor.add(typedId);
  if (!isUuid(typedId)) throw new OperatorError('BAD_ACCOUNT_ID', 'the entry is not a UUID -- nothing was done');
  if (!typedId.startsWith(expectIdPrefix)) {
    throw new OperatorError('ACCOUNT_ID_MISMATCH', 'the account id does not start with --expect-id-prefix -- nothing was done');
  }
  const userId = typedId;

  const dbUrl = await secretInput({ env, key: 'SUPABASE_DB_URL', label: 'Database URL', io, redactor });
  registerDbUrl(dbUrl, redactor);
  assertDbUrlTarget(dbUrl, target);
  const serviceKey = await secretInput({ env, key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service role key', io, redactor });
  assertApiKey(serviceKey, { expected: 'service', projectRef });

  const db = deps.createDb(dbUrl);
  try {
    const state = await readRecoveryState({ userId, readOnly: db.readOnly });
    for (const line of renderRecoveryState(state, expectIdPrefix)) io.print(line);
    assertExactState(state);
    io.print(`[${TOOL}] state check: PASS (exactly the expected state)`);

    const password = await io.promptHidden(`New password, at least ${MIN_PASSWORD_LENGTH} characters (hidden): `);
    const again = await io.promptHidden('Same password again (hidden): ');
    redactor.add(password, again);
    if (password !== again) throw new OperatorError('PASSWORD_MISMATCH', 'the two password entries differ -- nothing was changed');
    assertStrongPassword(password);

    await requireConfirmationPhrase(io, `RECOVER SUPER-ADMIN ${projectRef} ${expectIdPrefix}`, 'set the password and confirm the email');

    const auth = deps.createAuthAdmin(url, serviceKey);
    const result = await applyRecovery({ userId, password, readOnly: db.readOnly, setPasswordAndConfirm: auth.setPasswordAndConfirm, redactor });
    for (const line of renderRecoveryState(result.after, expectIdPrefix)) io.print(line);
    io.print('RECOVERY_APPLIED=YES PASSWORD_SET=YES EMAIL_CONFIRMED=YES INVITES_SENT=0');
    io.print('STATUS=success -- nothing was signed in. Next, only with separate approval: supabase-owner-bootstrap.mjs run (sign-in, MFA, plans).');
    return { status: 'success', idPrefix: expectIdPrefix };
  } finally {
    await db.end();
  }
}
