// Stage 2E Supabase adapter — connection + RLS-impersonation helpers.
//
// This backend is NOT a PostgREST/supabase-js client and does not authenticate
// end users through Supabase Auth (the live app keeps its own custom
// JWT-cookie auth — see backend/middleware/auth.js — unchanged regardless of
// DATA_BACKEND). To still get real RLS enforcement (not just app-code
// filtering) for a direct `pg` connection, every query runs inside a
// transaction that does `SET LOCAL ROLE <role>` plus, for user-scoped
// operations, `SET LOCAL request.jwt.claims` so that `auth.uid()`/`auth.jwt()`
// resolve inside Postgres exactly as they would for a real Supabase Auth
// session. This is the standard pattern for a trusted backend service using a
// direct Postgres connection against a Supabase project (see
// lib/db/test/local-harness.mjs, which sets up the same roles/functions
// locally for the schema's own test suite).
//
// SECURITY RULE — do not relax this without a real design change: this module
// deliberately provides NO way to set an `aal2` claim. Every `is_admin_aal2()`
// policy and every AAL2-gated RPC (admin_record_refund, admin_review_manual_
// payment, admin_set_role, create_plan_version, admin_activate_manual_
// subscription, issue_invoice_from_payment) exists specifically to require
// proof of a completed MFA step-up. The live admin system (backend/models/
// AdminUser.js) tracks MFA itself, but has no Postgres/Supabase counterpart
// (see docs/option-a-mongo-supabase-parity-map.md, "AdminUser" gap) — there is
// currently no trustworthy signal this module could use to assert "this
// admin really completed MFA". Fabricating `aal:"aal2"` on every admin
// request would silently defeat the whole point of those policies. Until the
// AdminUser/MFA gap is closed, any adapter function that would need an AAL2
// RPC must call `withAdminAal2Context`, which always throws.
import pg from 'pg';

let pool;

function getConnectionString() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is required when DATA_BACKEND=supabase (direct Postgres ' +
        'connection string for the Supabase project, distinct from MONGO_URI).'
    );
  }
  return url;
}

export function getPool() {
  if (!pool) {
    const connectionString = getConnectionString();
    const host = new URL(connectionString).hostname;
    // The real Supabase project is never localhost — strict TLS (reject
    // unauthorized certs, same rule the ops backup/restore tooling follows)
    // is required for any non-local host. A local/rehearsal Postgres
    // container (see docs/option-a-mongo-supabase-parity-map.md's rehearsal
    // notes) has no TLS listener at all, so this is a structural check
    // (impossible to point at the real project without TLS), not a flag
    // someone could accidentally leave permissive in production.
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    pool = new pg.Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: true },
    });
  }
  return pool;
}

// Runs `fn(client)` as the given end user: RLS policies see
// auth.uid() = userId and auth.jwt()->>'aal' is absent (AAL1). Sufficient for
// every owner-scoped policy in the matched-domain schema (quran_*,
// notifications, notification_preferences, manual_payments insert,
// subscriptions/payments/invoices select) — none of those require AAL2.
export async function withUserContext(userId, fn) {
  if (!userId) throw new Error('withUserContext requires a userId');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Runs `fn(client)` as an unauthenticated visitor: RLS sees auth.uid() IS
// NULL. Used for the guest-insert endpoints (enrollments, trial_requests,
// subscribers) which grant INSERT to `anon` specifically so unauthenticated
// visitors can submit without an account.
export async function withAnonContext(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Runs `fn(client)` as service_role: bypasses RLS entirely. Reserved for the
// handful of operations the schema itself grants only to service_role
// (provider_events lease functions, service_apply_subscription_update) —
// i.e. webhook-driven writes that have no acting end user to impersonate.
// Do NOT use this as a shortcut for admin-facing reads/writes just because
// it's easier than AAL2 impersonation — see the module-level SECURITY RULE.
export async function withServiceRole(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Always throws. Placeholder call site for the AAL2-gated RPCs so every
// adapter function that needs one fails loudly and explicitly, with a message
// pointing at the real gap, instead of silently downgrading security. See the
// module-level SECURITY RULE comment for why this can't be implemented yet.
export async function withAdminAal2Context() {
  throw new Error(
    'DATA_BACKEND=supabase cannot perform AAL2-gated admin actions yet: ' +
      'AdminUser (RBAC + MFA) has no Postgres/Supabase mapping, so this ' +
      'backend has no trustworthy signal that the calling admin has actually ' +
      'completed MFA. See docs/option-a-mongo-supabase-parity-map.md, ' +
      '"AdminUser" gap, before implementing this.'
  );
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
