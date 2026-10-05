// Core logic for supabase-first-super-admin-bootstrap.mjs — zero I/O of its
// own. Every function here either (a) is pure (CLI/env gate validation,
// synchronously throws or returns a plan — no network, no database, no
// environment read beyond the plain object passed in), or (b) takes its
// I/O as injected async functions (inviteUser/deleteUser/
// runInServiceRoleTransaction) so the full bootstrap sequence is testable
// against in-memory fakes, exactly like
// backend/scripts/ops/lib/rotate-admin-mfa-encryption-core.mjs's
// planRotation/applyRotation split. The real CLI entry point
// (../supabase-first-super-admin-bootstrap.mjs) is the only place that
// constructs a real Supabase Auth Admin client or opens a real Postgres
// connection.

const VALID_TARGETS = ['staging', 'production'];

// Deliberately loose — this is a fail-fast local sanity check, not the
// real validator (Supabase Auth itself rejects a malformed address when
// inviteUserByEmail() is actually called). Catches an obvious typo before
// anything connects, nothing more.
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailShape(email) {
  return typeof email === 'string' && EMAIL_SHAPE_RE.test(email);
}

export class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
  }
}

export const CLI_SPEC = {
  flags: {
    apply:                                 { type: 'boolean' },
    'dry-run':                             { type: 'boolean' },
    'confirm-create-first-super-admin':    { type: 'boolean' },
    'confirm-promote-existing-account':    { type: 'boolean' },
    target:                                { type: 'string' },
    email:                                 { type: 'string' },
  },
};

// ── Gate validation (section "7) عند apply") — pure, synchronous ───────────
//
// Every one of these checks runs, and must pass, BEFORE this file's own
// runBootstrap() is ever called from main() — and runBootstrap() itself
// never opens a connection until its caller has already done so. No gate
// here reads a secret value, only whether env vars are SET and whether
// they match what the operator typed on the command line.
export function validateCliArgs(args) {
  if (args.apply && args['dry-run']) {
    throw new Error('--apply and --dry-run cannot be combined — pass one or the other (default is dry-run).');
  }

  const applyOnlyFlags = ['confirm-create-first-super-admin', 'confirm-promote-existing-account', 'target', 'email'];
  if (!args.apply) {
    for (const flag of applyOnlyFlags) {
      if (args[flag] !== undefined) {
        throw new Error(`--${flag} only has meaning together with --apply.`);
      }
    }
    return;
  }

  if (!args['confirm-create-first-super-admin']) {
    throw new Error(
      '--apply requires --confirm-create-first-super-admin as a second, explicit, independent ' +
      'acknowledgement — --apply alone is never sufficient to bootstrap a real admin identity.'
    );
  }
  if (!args.target || !VALID_TARGETS.includes(args.target)) {
    throw new Error(`--apply requires --target=staging or --target=production (got: ${args.target ?? '(none)'}).`);
  }
  if (!args.email || !isValidEmailShape(args.email)) {
    throw new Error('--apply requires a valid --email=<address> for the account being bootstrapped.');
  }
}

/**
 * Pure pre-flight resolver: given parsed CLI args and an env-like object,
 * either returns the fully-validated run configuration or throws — no I/O,
 * no Supabase, no Postgres, no side effect. This is the single point every
 * one of the five mandatory --apply gates is enforced at, before main()
 * constructs any real client.
 */
export function resolveRunConfig({ args, env }) {
  validateCliArgs(args);
  const apply = !!args.apply;

  if (!apply) {
    return { apply: false, target: args.target ?? null, email: args.email ?? null };
  }

  // Gate: ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 — a dedicated
  // authorization env var, independent of --apply/--confirm-* on the
  // command line (the same two-independent-channels pattern
  // ALLOW_ADMIN_MFA_KEY_ROTATION uses).
  if (env.ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP !== '1') {
    throw new Error(
      '--apply refuses to run: ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 must be set as an explicit, ' +
      'dedicated authorization for this run.'
    );
  }

  // Gate: the operator's --target claim must match a SEPARATELY configured
  // env var describing what SUPABASE_URL/SUPABASE_DB_URL actually point
  // to. Two independent channels (a CLI flag decided at invocation time,
  // an env var configured ahead of time) have to agree — a single
  // mistyped --target can never silently point a "staging" run at
  // production, or vice versa.
  if (env.SUPABASE_BOOTSTRAP_TARGET_ENV !== args.target) {
    throw new Error(
      `--target=${args.target} does not match SUPABASE_BOOTSTRAP_TARGET_ENV ` +
      `(${env.SUPABASE_BOOTSTRAP_TARGET_ENV ?? '(unset)'}) — refusing to run: the requested environment must ` +
      'match the environment the connection is actually configured for.'
    );
  }

  // Gate: the three real-connection secrets must be SET — never read,
  // never printed, never validated for shape here. Presence only.
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
    if (!env[key]) {
      throw new Error(`--apply refuses to run: ${key} is not set.`);
    }
  }

  return {
    apply: true,
    target: args.target,
    email: args.email,
    confirmPromoteExisting: !!args['confirm-promote-existing-account'],
  };
}

// ── The actual bootstrap sequence (I/O injected, never opened here) ────────
//
/**
 * @param {object} deps
 * @param {string} deps.email
 * @param {boolean} deps.confirmPromoteExisting
 * @param {(email: string) => Promise<{data: {user: {id: string}}, error: any}>} deps.inviteUser -
 *   wraps supabase.auth.admin.inviteUserByEmail(email, ...). Never generates
 *   or returns a password — GoTrue sends the real invite link itself.
 * @param {(userId: string) => Promise<void>} deps.deleteUser -
 *   wraps supabase.auth.admin.deleteUser(userId) — compensation only.
 * @param {(fn: (client: {query: Function}) => Promise<any>) => Promise<any>} deps.runInServiceRoleTransaction -
 *   runs `fn` inside one real service_role Postgres transaction (BEGIN ...
 *   COMMIT/ROLLBACK) — e.g. backend/data/supabase/client.js's
 *   withServiceRole, reused here for exactly the case its own module
 *   comment calls out as legitimate: an offline operator action with no
 *   end-user session to impersonate.
 */
export async function runBootstrap({ email, confirmPromoteExisting, inviteUser, deleteUser, runInServiceRoleTransaction }) {
  // Step 1: pre-flight, read-only, inside its own transaction (no writes
  // are possible even if one of these three queries were somehow abused —
  // they are plain SELECTs).
  const { existingUserId } = await runInServiceRoleTransaction(async (client) => {
    const anyAdmin = await client.query('SELECT 1 FROM admin_role_assignments LIMIT 1');
    if (anyAdmin.rows.length > 0) {
      throw new BootstrapError(
        'EXISTING_ADMIN_FOUND',
        'An admin_role_assignments row already exists — refusing to bootstrap a first super-admin. ' +
        'This tool only ever creates the FIRST admin identity.'
      );
    }

    // profiles.role='admin' with no matching admin_role_assignments row is
    // an inconsistent state this tool has no business resolving on its
    // own — fail closed rather than guess which side is "correct".
    const orphanAdminProfile = await client.query(`SELECT 1 FROM profiles WHERE role = 'admin' LIMIT 1`);
    if (orphanAdminProfile.rows.length > 0) {
      throw new BootstrapError(
        'AMBIGUOUS_ADMIN_STATE',
        'A profiles row already has role=admin with no matching admin_role_assignments row — ambiguous ' +
        'existing-admin state, refusing to proceed without a human resolving it first.'
      );
    }

    const existing = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    return { existingUserId: existing.rows[0]?.id ?? null };
  });

  if (existingUserId && !confirmPromoteExisting) {
    throw new BootstrapError(
      'EXISTING_ACCOUNT_REQUIRES_CONFIRMATION',
      'An auth.users account already exists for this email. Refusing to promote it to super-admin without ' +
      '--confirm-promote-existing-account as a separate, explicit acknowledgement.'
    );
  }

  let userId = existingUserId;
  let createdByThisRun = false;

  if (!userId) {
    const { data, error } = await inviteUser(email);
    if (error) {
      throw new BootstrapError('INVITE_FAILED', `Failed to invite the new account: ${error.message ?? error}`);
    }
    userId = data.user.id;
    createdByThisRun = true;
  }

  try {
    await runInServiceRoleTransaction(async (client) => {
      await client.query(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [userId]);
      await client.query(
        `INSERT INTO admin_role_assignments (user_id, role, assigned_by) VALUES ($1, 'super-admin', NULL)`,
        [userId]
      );

      // Re-verify from scratch before this transaction is allowed to
      // commit — never assume the two statements above did what they
      // claimed (a multi-table identity write is checked as a whole).
      const profileCheck = await client.query('SELECT role FROM profiles WHERE id = $1', [userId]);
      const roleCheck     = await client.query('SELECT role FROM admin_role_assignments WHERE user_id = $1', [userId]);
      if (profileCheck.rows[0]?.role !== 'admin' || roleCheck.rows[0]?.role !== 'super-admin') {
        throw new BootstrapError(
          'POST_WRITE_VERIFICATION_FAILED',
          'profiles/admin_role_assignments did not read back as expected after writing — rolling back.'
        );
      }
    });
  } catch (err) {
    if (!createdByThisRun) {
      // Never touch an account this run did not itself create.
      throw err;
    }
    // Compensation: remove ONLY the identity this exact run created,
    // using the id returned from its own inviteUser() call above — never
    // a fresh lookup by email, which could race with something else.
    await deleteUser(userId);
    return { status: 'failed_compensated', createdByThisRun: true, promoted: false };
  }

  return { status: 'success', createdByThisRun, promoted: true };
}
