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
// only ever sets an `aal2` claim when the caller passes one in explicitly,
// and the ONE legitimate caller (middleware/adminAuth.js's verifyAccessToken,
// supabase mode) only does so after re-verifying, on THAT request, the
// admin_sat cookie's signature against SUPABASE_JWT_SECRET and reading a
// real `aal: "aal2"` claim GoTrue itself put there when the admin completed
// a TOTP challenge (see data/supabase/supabaseSessionCookie.js and
// data/supabase/adminAuthController.js). It is never read from this
// backend's own signed admin_at JWT, which under Mongo mode is genuinely
// the only signal available (no external identity provider to re-check
// against there) but under Supabase mode is exactly the kind of
// self-asserted, cacheable claim this rule exists to distrust. Every
// `is_admin_aal2()` policy and every AAL2-gated RPC (admin_record_refund,
// admin_review_manual_payment, admin_set_role, create_plan_version,
// admin_activate_manual_subscription, issue_invoice_from_payment,
// system_config_set) exists specifically to require that proof. Fabricating
// `aal:"aal2"` from any other code path would silently defeat the whole
// point of those policies — every caller needing one of these RPCs must run
// under the real /api/v1/admin/* verifyAccessToken flow and forward its
// req.adminAal, never invent one. (Admin invoices used to be the one
// exception — GET /api/invoices/admin, mounted under the customer-session
// protect+adminOnly middleware, structurally had no AAL2 concept at all and
// called a withAdminAal2Context() placeholder that always threw. Closed in
// the Al-Rahma Final Corrections pass by moving the real admin invoice list
// to GET /api/v1/admin/invoices — see data/supabase/admin/
// invoicesAdminController.js — which runs under the real, AAL2-capable
// admin router instead.)
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
// auth.uid() = userId and auth.jwt()->>'aal' is absent (AAL1) unless `aal`
// is passed explicitly. Sufficient for every owner-scoped policy in the
// matched-domain schema (quran_*, notifications, notification_preferences,
// manual_payments insert, subscriptions/payments/invoices select) — none of
// those require AAL2.
//
// The `aal` option exists for exactly one legitimate caller: data/supabase/
// adminAuth.js's verifyAccessToken(), AFTER it has decoded our own signed
// admin_at JWT and found `mfaVerified: true` — a claim this backend only
// ever sets (see adminAuthController.js) once Supabase Auth's own GoTrue
// service has genuinely verified a TOTP challenge for that admin's real
// session. That is a trustworthy, narrowly-scoped signal, categorically
// different from a route handler self-asserting "trust me, this admin did
// MFA" — which is exactly what withAdminAal2Context() below refuses to do
// for every OTHER caller, since no such signed, GoTrue-verified claim
// exists anywhere else in this codebase. Never pass `aal:'aal2'` here from
// any code path that hasn't gone through that real verification.
export async function withUserContext(userId, fn, { aal } = {}) {
  if (!userId) throw new Error('withUserContext requires a userId');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    const claims = { sub: userId, role: 'authenticated' };
    if (aal) claims.aal = aal;
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(claims)]);
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

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
