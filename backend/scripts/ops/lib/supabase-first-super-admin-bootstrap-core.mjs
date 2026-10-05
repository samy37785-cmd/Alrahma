// Core of supabase-first-super-admin-bootstrap.mjs. All I/O is injected
// (the terminal, git, the collision check, the Auth Admin client, the
// Postgres runner), so the whole run -- argument gates, prompts, checks,
// the one invite and the role write -- is testable against fakes and
// against a real local Supabase stack. The CLI file only wires the real
// implementations.
//
// SECURE_SUPER_ADMIN_OPERATOR_TOOL: what one run does, in order.
//   1. Gates, before any input or connection: --apply,
//      --confirm-create-first-super-admin, ALLOW_SUPABASE_SUPER_ADMIN_
//      BOOTSTRAP=1, --target=local|production equal to SUPABASE_BOOTSTRAP_
//      TARGET_ENV, no production target under CI, and for production a
//      clean checkout plus --backup-manifest naming a backup at most 24h old.
//   2. Shows target, projectRef and gitSha.
//   3. Reads the email twice, hidden. There is no --email flag.
//   4. Production: checks the email against every document of that fresh
//      Mongo backup (SUPER_ADMIN_EMAIL_CONFLICT=YES stops the run before
//      Supabase is contacted).
//   5. Reads the database URL and service key from the environment or a
//      hidden prompt, and checks both belong to the target.
//   6. Read-only preflight: no admin role row, no admin profile, and no
//      account with this email or mailbox. Any of them stops the run with
//      nothing changed.
//   7. Requires the typed phrase INVITE SUPER-ADMIN <projectRef>.
//   8. Sends exactly one invite (GoTrue emails the link; no password exists
//      in this tool), then in one transaction sets profiles.role='admin'
//      and inserts the one 'super-admin' role row, read back before commit.
//      If that write fails, the account this run created is deleted again.
// It never creates plans, enrolls MFA, sends a password reset, or touches
// DATA_BACKEND or Render. It prints IDs and statuses only.
import { parseStrictCliArgs } from '../../migration/lib/cli-args.mjs';
import { isEmailShaped, mailboxKey, normalizeEmail } from '../../migration/lib/email-collision.mjs';
import {
  OperatorError,
  assertApiKey,
  assertDbUrlTarget,
  assertNoRemoteTargetInCi,
  assertTargetEnvMatches,
  isUuid,
  parseTarget,
  registerDbUrl,
  requireConfirmationPhrase,
  requireInteractive,
  resolveSupabaseApi,
  secretInput,
} from './operator-io.mjs';

export const TOOL = 'supabase-super-admin-bootstrap';

export const CLI_SPEC = {
  flags: {
    apply: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'confirm-create-first-super-admin': { type: 'boolean' },
    target: { type: 'string' },
    'backup-manifest': { type: 'string' },
  },
};

/** Kept for compatibility with the CLI's own shape check. */
export const BootstrapError = OperatorError;

export function isValidEmailShape(email) {
  return isEmailShaped(email);
}

export function validateCliArgs(args) {
  if (args.apply && args['dry-run']) {
    throw new OperatorError('BAD_ARGS', '--apply and --dry-run cannot be combined -- pass one or the other (default is dry-run).');
  }
  const applyOnlyFlags = ['confirm-create-first-super-admin', 'target', 'backup-manifest'];
  if (!args.apply) {
    for (const flag of applyOnlyFlags) {
      if (args[flag] !== undefined) throw new OperatorError('BAD_ARGS', `--${flag} only has meaning together with --apply.`);
    }
    return;
  }
  if (!args['confirm-create-first-super-admin']) {
    throw new OperatorError(
      'BAD_ARGS',
      '--apply requires --confirm-create-first-super-admin as a second, explicit, independent acknowledgement.'
    );
  }
  parseTarget(args.target);
  if (args.target === 'production' && !args['backup-manifest']) {
    throw new OperatorError(
      'BAD_ARGS',
      '--target=production requires --backup-manifest=<fresh backup manifest>: the email is checked against that backup first.'
    );
  }
}

/** Pure gate check: parsed args + env -> run config, or throws. No input, no connection. */
export function resolveRunConfig({ args, env }) {
  validateCliArgs(args);
  if (!args.apply) return { apply: false };
  if (env.ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP !== '1') {
    throw new OperatorError(
      'NOT_AUTHORIZED',
      '--apply refuses to run: ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 must be set as an explicit, dedicated authorization for this run.'
    );
  }
  assertNoRemoteTargetInCi({ env, target: args.target });
  assertTargetEnvMatches({ env, target: args.target });
  return { apply: true, target: args.target, backupManifestPath: args['backup-manifest'] ?? null };
}

// ── Database steps (I/O injected) ──────────────────────────────────────────

/**
 * Read-only. Throws, with nothing changed, if any admin role row or admin
 * profile exists, or if any account already uses this email or mailbox.
 */
export async function preflightBootstrap({ email, readOnly }) {
  return readOnly(async (client) => {
    const roles = await client.query('select count(*)::int as n from public.admin_role_assignments');
    if (roles.rows[0].n > 0) {
      throw new OperatorError(
        'EXISTING_ADMIN_FOUND',
        'an admin_role_assignments row already exists -- this tool only ever creates the FIRST admin identity; nothing was changed'
      );
    }
    const adminProfiles = await client.query(`select count(*)::int as n from public.profiles where role = 'admin'`);
    if (adminProfiles.rows[0].n > 0) {
      throw new OperatorError(
        'AMBIGUOUS_ADMIN_STATE',
        'a profiles row already has role=admin with no admin_role_assignments row -- resolve that by hand first; nothing was changed'
      );
    }
    const users = await client.query('select email from auth.users where email is not null');
    const exact = normalizeEmail(email);
    const mailbox = mailboxKey(email);
    const taken = users.rows.some((u) => normalizeEmail(u.email) === exact || (isEmailShaped(u.email) && mailboxKey(u.email) === mailbox));
    if (taken) {
      throw new OperatorError(
        'EXISTING_ACCOUNT',
        'an account with this email (or the same mailbox) already exists -- stopping without changing it or sending an invite'
      );
    }
    return { authUsers: users.rows.length };
  });
}

/**
 * The write: one invite, then the profile/role transaction. Re-runs the
 * preflight first, so nothing can have appeared since it was shown.
 */
export async function applyBootstrap({ email, inviteUser, deleteUser, readOnly, inTransaction, redactor }) {
  await preflightBootstrap({ email, readOnly });

  const { data, error } = await inviteUser(email);
  if (error || !isUuid(data?.user?.id)) {
    throw new OperatorError('INVITE_FAILED', `the invite was refused: ${redactor ? redactor.text(error?.message ?? 'no user id returned') : 'see Supabase Auth logs'}`);
  }
  const userId = data.user.id;

  try {
    await inTransaction(async (client) => {
      const profile = await client.query(`update public.profiles set role = 'admin' where id = $1`, [userId]);
      if (profile.rowCount !== 1) throw new OperatorError('POST_WRITE_VERIFICATION_FAILED', 'the invited account has no profiles row');
      await client.query(
        `insert into public.admin_role_assignments (user_id, role, assigned_by) values ($1, 'super-admin', null)`,
        [userId]
      );
      const check = await client.query(
        `select (select role::text from public.profiles where id = $1) as profile_role,
                (select array_agg(role::text) from public.admin_role_assignments where user_id = $1) as roles,
                (select count(*)::int from public.admin_role_assignments) as role_rows`,
        [userId]
      );
      const row = check.rows[0];
      if (row.profile_role !== 'admin' || row.roles?.length !== 1 || row.roles[0] !== 'super-admin' || row.role_rows !== 1) {
        throw new OperatorError('POST_WRITE_VERIFICATION_FAILED', 'profiles/admin_role_assignments did not read back as expected -- rolled back');
      }
    });
  } catch (err) {
    // Only the account this run itself just created, by the id its own
    // invite returned -- never a lookup by email.
    await deleteUser(userId);
    return { status: 'failed_compensated', userId: null, invitesSent: 1, cause: err.code ?? 'WRITE_FAILED' };
  }
  return { status: 'success', userId, invitesSent: 1 };
}

// ── The whole run ──────────────────────────────────────────────────────────

/** Strict flags; an unknown flag (e.g. --email=...) is named, its value never echoed. */
export function parseArgs(argv) {
  try {
    return parseStrictCliArgs(argv, CLI_SPEC);
  } catch (err) {
    throw new OperatorError('BAD_ARGS', err.message);
  }
}

function wrap(code, fn) {
  try {
    return fn();
  } catch (err) {
    throw err instanceof OperatorError ? err : new OperatorError(code, err.message);
  }
}

async function wrapAsync(code, fn) {
  try {
    return await fn();
  } catch (err) {
    throw err instanceof OperatorError ? err : new OperatorError(code, err.message);
  }
}

/**
 * @param {object} p
 * @param {string[]} p.argv
 * @param {object} p.env
 * @param {object} p.io - interactive, print, promptHidden, promptVisible
 * @param {object} p.redactor - operator-io makeRedactor()
 * @param {object} p.deps
 * @param {() => {sha: string, dirty: boolean}} p.deps.gitState
 * @param {(path: string) => {sha256: string, ageHours: number}} p.deps.verifyFreshBackup
 * @param {({backupManifestPath, candidateEmail}) => Promise<boolean>} p.deps.collisionCheck
 * @param {(url, serviceKey) => {inviteUser, deleteUser}} p.deps.createAuthAdmin
 * @param {(dbUrl) => {readOnly, inTransaction, end}} p.deps.createDb
 */
export async function runBootstrapCli({ argv, env, io, redactor, deps }) {
  const config = resolveRunConfig({ args: parseArgs(argv), env });
  io.print(`[${TOOL}] mode=${config.apply ? 'apply' : 'dry-run'}`);
  if (!config.apply) {
    io.print(`[${TOOL}] dry-run only -- no input was read, no connection was made, nothing was written.`);
    io.print(
      `[${TOOL}] to apply: --apply --confirm-create-first-super-admin --target=<local|production> ` +
      '[--backup-manifest=<fresh backup manifest>, required for production], with ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 ' +
      'and SUPABASE_BOOTSTRAP_TARGET_ENV equal to --target. The email and every secret are asked for, hidden.'
    );
    return { status: 'dry-run' };
  }

  requireInteractive(io);
  const { target } = config;
  const git = deps.gitState();
  if (target === 'production' && git.dirty) {
    throw new OperatorError('DIRTY_CHECKOUT', 'the checkout has uncommitted changes -- run from a clean checkout of the reviewed commit');
  }
  const { url, projectRef } = resolveSupabaseApi({ target, env });
  const backup = config.backupManifestPath ? wrap('BACKUP_REFUSED', () => deps.verifyFreshBackup(config.backupManifestPath)) : null;

  io.print(`[${TOOL}] target=${target} projectRef=${projectRef} gitSha=${git.sha}`);
  if (backup) io.print(`[${TOOL}] collision backup sha256=${backup.sha256.slice(0, 12)} age=${backup.ageHours.toFixed(1)}h`);

  const first = await io.promptHidden('Super Admin email (hidden): ');
  const second = await io.promptHidden('Same email again (hidden): ');
  redactor.add(first, second, normalizeEmail(first));
  if (normalizeEmail(first) !== normalizeEmail(second)) throw new OperatorError('EMAIL_MISMATCH', 'the two email entries differ -- nothing was done');
  if (!isEmailShaped(first)) throw new OperatorError('BAD_EMAIL', 'the entry is not an email address -- nothing was done');
  const email = normalizeEmail(first);

  if (backup) {
    const conflict = await wrapAsync('COLLISION_CHECK_FAILED', () => deps.collisionCheck({ backupManifestPath: config.backupManifestPath, candidateEmail: email }));
    io.print(`SUPER_ADMIN_EMAIL_CONFLICT=${conflict ? 'YES' : 'NO'}`);
    if (conflict) {
      throw new OperatorError(
        'EMAIL_CONFLICT',
        'this email (or its mailbox) appears in the Mongo source -- choose a dedicated admin address; Supabase was not contacted'
      );
    }
  }

  const dbUrl = await secretInput({ env, key: 'SUPABASE_DB_URL', label: 'Database URL', io, redactor });
  registerDbUrl(dbUrl, redactor);
  assertDbUrlTarget(dbUrl, target);
  const serviceKey = await secretInput({ env, key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service role key', io, redactor });
  assertApiKey(serviceKey, { expected: 'service', projectRef });

  const db = deps.createDb(dbUrl);
  try {
    const pre = await preflightBootstrap({ email, readOnly: db.readOnly });
    io.print(`[${TOOL}] preflight: admin_role_assignments=0 admin profiles=0 existing auth.users=${pre.authUsers} same-email accounts=0`);
    io.print(`[${TOOL}] next: ONE invite to the entered address (not shown), then profiles.role=admin and one super-admin role row.`);
    await requireConfirmationPhrase(io, `INVITE SUPER-ADMIN ${projectRef}`, 'send the invite');

    const auth = deps.createAuthAdmin(url, serviceKey);
    const result = await applyBootstrap({ email, inviteUser: auth.inviteUser, deleteUser: auth.deleteUser, readOnly: db.readOnly, inTransaction: db.inTransaction, redactor });
    io.print(`INVITES_SENT=${result.invitesSent}`);
    if (result.status !== 'success') {
      io.print(`STATUS=${result.status} (${result.cause}) -- the invited account was deleted again`);
      return result;
    }
    io.print(`SUPER_ADMIN_USER_ID=${result.userId}`);
    io.print('STATUS=success -- next: supabase-owner-bootstrap.mjs accept-invite with this id, then run');
    return result;
  } finally {
    await db.end();
  }
}
