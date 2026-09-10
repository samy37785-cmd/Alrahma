// Stage 2J-B — calls an is_admin_aal2()-gated RPC from an offline,
// superuser-run migration script. Exact technique already proven by
// backend/scripts/migration/seed-postgres-plans.mjs (read in full before
// this file was written): manufacture a throwaway local admin identity,
// then SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ...)
// for the rest of the CURRENT transaction only, so is_admin_aal2()'s
// auth.uid()/auth.jwt() calls see a real AAL2 admin session. This is not
// the same trust boundary as the live backend's withAdminAal2Context()
// (which always throws for an anonymous HTTP request) — a human
// deliberately running this script IS the trusted actor, exactly as
// documented throughout this directory.
//
// Used only for RPCs that encode real, non-trivial business logic this
// tooling must not re-implement (create_plan_version's idempotent
// versioning, issue_invoice_from_payment's charge-linkage rules) — every
// other write in this directory is a plain, audited table INSERT/UPDATE
// under the same superuser trust model (RLS bypassed by the Postgres
// superuser role itself, not by this trick).
export const MIGRATION_SEED_ADMIN_ID = '00000000-0000-4000-8000-000000000099';
// Review round 6, item 3: exported (was module-private) so
// production-import-orchestrator.mjs's verifyNoUnrecordedData() can
// verify the COMPLETE expected seed-admin identity (id + this exact
// email + profiles.role='admin' + a matching admin_role_assignments row)
// rather than trusting the id alone -- a row that merely happens to share
// MIGRATION_SEED_ADMIN_ID but not this email (or any other mismatch) is a
// collision that must fail closed, never be silently exempted.
export const MIGRATION_SEED_ADMIN_EMAIL = 'stage2jb-migration-tool@rehearsal.local';

export async function inspectMigrationSeedAdmin(pgClient) {
  const { rows } = await pgClient.query(
    `SELECT u.id, u.email, p.id AS profile_id, p.email AS profile_email,
            p.role AS profile_role, a.role AS admin_role
       FROM auth.users u
       LEFT JOIN profiles p ON p.id = u.id
       LEFT JOIN admin_role_assignments a ON a.user_id = u.id
      WHERE u.id = $1 OR u.email = $2`,
    [MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]
  );
  if (rows.length === 0) return { state: 'absent' };
  const row = rows[0];
  const exact = rows.length === 1 &&
    String(row.id) === MIGRATION_SEED_ADMIN_ID &&
    row.email === MIGRATION_SEED_ADMIN_EMAIL &&
    String(row.profile_id) === MIGRATION_SEED_ADMIN_ID &&
    row.profile_email === MIGRATION_SEED_ADMIN_EMAIL &&
    row.profile_role === 'admin' &&
    row.admin_role === 'admin';
  return { state: exact ? 'exact' : 'collision' };
}

/**
 * Ensures the throwaway local admin identity exists (idempotent) — call
 * once per run, outside any RPC-calling transaction.
 */
export async function ensureMigrationSeedAdmin(pgClient) {
  const before = await inspectMigrationSeedAdmin(pgClient);
  if (before.state === 'exact') return;
  if (before.state === 'collision') {
    throw new Error('migration seed-admin UUID/email collides with an incomplete or mismatched auth/profile/admin-role identity');
  }
  await pgClient.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]
  );
  await pgClient.query(
    `INSERT INTO profiles (id, email, name, role) VALUES ($1, $2, 'Stage 2J-B Migration Tool', 'admin')
     ON CONFLICT (id) DO UPDATE SET role = 'admin'`,
    [MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL]
  );
  await pgClient.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'admin')
     ON CONFLICT (user_id) DO UPDATE SET role = 'admin'`,
    [MIGRATION_SEED_ADMIN_ID]
  );
  const after = await inspectMigrationSeedAdmin(pgClient);
  if (after.state !== 'exact') {
    throw new Error('migration seed-admin creation did not produce the exact expected auth/profile/admin-role identity');
  }
}

/**
 * Sets up the AAL2-admin session impersonation for the CALLER's own,
 * already-open transaction, runs `fn(client)`, then resets the role —
 * WITHOUT issuing BEGIN/COMMIT/ROLLBACK itself. Use this (not
 * withImpersonatedAdmin() below) whenever the RPC call must be part of a
 * LARGER atomic unit than "just this RPC" — e.g. an invoice write that
 * must commit or roll back together with its own ledger bookkeeping.
 *
 * Review round 4: this is the fix for a real nested-transaction bug —
 * mongo-to-supabase.mjs's invoices domain called the transaction-OWNING
 * withImpersonatedAdmin() from INSIDE migrateDomain()'s own already-open
 * transaction. Postgres does not support real nested transactions: the
 * inner BEGIN was a silent no-op (with a server warning), and the inner
 * COMMIT actually committed the OUTER transaction — durably, immediately
 * after the invoice INSERT, before markCreated() ever ran. Kill-window
 * 2's "target write and markCreated commit or roll back together"
 * guarantee did not actually hold for this one domain: an injected fault
 * (or a real crash) between the invoice write and markCreated left a
 * REAL, committed, orphaned invoice with no ledger record at all.
 *
 * `SET LOCAL` is transaction-scoped by definition, so the explicit RESET
 * ROLE at the end is a defensive courtesy (the role reverts automatically
 * at the caller's own COMMIT or ROLLBACK either way), not a correctness
 * requirement — and if `fn` throws, that throw propagates up to the
 * caller's own catch/ROLLBACK unchanged; this function never swallows it
 * and never attempts to roll back a transaction it does not own.
 */
export async function withImpersonatedAdminContext(pgClient, fn) {
  await pgClient.query('SET LOCAL ROLE authenticated');
  await pgClient.query('SELECT set_config($1, $2, true)', [
    'request.jwt.claims',
    JSON.stringify({ sub: MIGRATION_SEED_ADMIN_ID, role: 'authenticated', aal: 'aal2' }),
  ]);
  const result = await fn(pgClient);
  await pgClient.query('RESET ROLE');
  return result;
}

/**
 * Runs `fn(client)` inside its OWN, self-owned transaction with the
 * AAL2-admin session impersonation active for that transaction only.
 * Only ever call this when the RPC is the entire unit of work — never
 * from inside a transaction the caller already opened (use
 * withImpersonatedAdminContext() above for that; see its own comment for
 * why nesting these is a real, previously-shipped bug, not a style
 * preference).
 */
export async function withImpersonatedAdmin(pgClient, fn) {
  await pgClient.query('BEGIN');
  try {
    const result = await withImpersonatedAdminContext(pgClient, fn);
    await pgClient.query('COMMIT');
    return result;
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
