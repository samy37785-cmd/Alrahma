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
const MIGRATION_SEED_ADMIN_EMAIL = 'stage2jb-migration-tool@rehearsal.local';

/**
 * Ensures the throwaway local admin identity exists (idempotent) — call
 * once per run, outside any RPC-calling transaction.
 */
export async function ensureMigrationSeedAdmin(pgClient) {
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
}

/**
 * Runs `fn(client)` inside a transaction with the AAL2-admin session
 * impersonation active for that transaction only — reverted the instant
 * the transaction ends (SET LOCAL is transaction-scoped by definition).
 * `fn` must issue its own SQL against `pgClient` (e.g. `SELECT
 * create_plan_version(...)`) — this wrapper only sets up/tears down the
 * impersonation context around it.
 */
export async function withImpersonatedAdmin(pgClient, fn) {
  await pgClient.query('BEGIN');
  try {
    await pgClient.query('SET LOCAL ROLE authenticated');
    await pgClient.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: MIGRATION_SEED_ADMIN_ID, role: 'authenticated', aal: 'aal2' }),
    ]);
    const result = await fn(pgClient);
    await pgClient.query('RESET ROLE');
    await pgClient.query('COMMIT');
    return result;
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
