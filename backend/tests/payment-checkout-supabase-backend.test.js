import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Final review round: payment-checkout.test.js only ever imports the
// default-mode app.js, which app.use()s the MongoDB route files
// (routes/paymentRoutes.js, routes/couponRoutes.js). app.js picks between
// the Mongo and Supabase route files per-mount via
// `isSupabaseBackend() ? supabaseX : x` (see app.js) — a real, independently
// deployable mode (DATA_BACKEND=supabase). The Supabase route files
// (data/supabase/routes/paymentRoutes.js, .../couponRoutes.js) had their OWN
// separate route tables that never got the paymentsDisabled treatment, so a
// deployment running DATA_BACKEND=supabase left every customer payment
// endpoint fully live even after payment-checkout.test.js went green. This
// file boots the app with DATA_BACKEND=supabase actually set (so app.js's
// isSupabaseBackend() branches really select the Supabase route files, not
// just asserts that the source file looks right) and proves the same
// closed/still-live properties hold there too.
//
// `isSupabaseBackend()` is read by app.js at module-evaluation time (each
// `app.use('/path', isSupabaseBackend() ? supabaseX : x)` call runs once,
// synchronously, when app.js is first imported) — so DATA_BACKEND must be
// set to 'supabase' BEFORE app.js is ever imported in this process. A
// static `import app from '../app.js'` is hoisted above any top-level
// `process.env` assignment in the same file, so app.js must be loaded via a
// dynamic `import()` inside `before()`, after the env is set. `node --test`
// isolates each matched file into its own process by default, so this does
// not affect any other test file's (Mongo-mode) app.js instance.
//
// No real Postgres/Stripe/PayPal/Supabase connection is ever made: the
// disabled routes below never touch the database at all (paymentsDisabled()
// is a pure 410 responder — see middleware/paymentsDisabled.js), the
// Postgres pool in data/supabase/client.js only connects lazily on first
// query (never at import), and the webhook sanity checks below fail on
// signature verification before any outbound API call — exactly the same
// property already relied on by payment-checkout.test.js's own webhook
// checks.
let app;

before(async () => {
  process.env.DATA_BACKEND = 'supabase';
  // REQUIRED unconditionally by config/validateEnv.js regardless of
  // DATA_BACKEND — never actually connected to (the DB-connection-check
  // middleware in app.js skips connectDB() entirely when
  // isSupabaseBackend() is true).
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-supabase-backend-mode';
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:1/unused-placeholder';
  // Required by validateEnv() specifically when DATA_BACKEND=supabase (see
  // config/validateEnv.js's SUPABASE_REQUIRED) — fake, non-routable values
  // are fine: nothing in this file ever calls data/supabase/client.js's
  // getPool() (the disabled routes are pure responders), and pg.Pool itself
  // connects lazily on first query, never at construction.
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-supabase-jwt-secret';
  // Same rationale as payment-checkout.test.js: needed so the webhook
  // sanity checks below fail on signature verification (400), not on
  // "gateway not configured" (500) — never used to make a real outbound call.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_fake_key_for_tests';
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_for_integration_tests';
  process.env.PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || 'webhook_id_for_tests';

  ({ default: app } = await import('../app.js'));
}, { timeout: 30_000 });

function assertDisabled(res) {
  assert.equal(res.status, 410);
  assert.equal(res.body.error, 'PAYMENTS_DISABLED');
}

async function agentWithCsrf() {
  const agent = request.agent(app);
  const res = await agent.get('/health');
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith('csrf_token='));
  const token = match ? match.split(';')[0].split('=')[1] : null;
  if (!token) throw new Error('csrf_token cookie was not issued by /health');
  return { agent, csrf: { 'x-csrf-token': token } };
}

test('DATA_BACKEND=supabase: GET /api/payments/manual-methods is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent.get('/api/payments/manual-methods').set(csrf);
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: POST /api/payments/manual is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent
    .post('/api/payments/manual')
    .set(csrf)
    .send({ plan: 'Starter', method: 'bank', customer: { email: 'x@example.com', name: 'X' } });
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: POST /api/payments/stripe (checkout-session creation) is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent.post('/api/payments/stripe').set(csrf).send({ plan: 'Starter', customer: { email: 'x@example.com' } });
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: POST /api/payments/paypal (order creation) is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent.post('/api/payments/paypal').set(csrf).send({ plan: 'Starter', customer: { email: 'x@example.com' } });
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: POST /api/payments/paypal/:orderId/capture is disabled with 410 PAYMENTS_DISABLED, even for a plausible order id', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent.post('/api/payments/paypal/ORDER-DOES-NOT-EXIST/capture').set(csrf).send({});
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: POST /api/coupons/validate is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'ANYTHING' });
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: a tampered client-supplied amount/status cannot reach a gateway — the route never sees the payload before returning 410', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent
    .post('/api/payments/paypal')
    .set(csrf)
    .send({ plan: 'Starter', amount: 1, status: 'paid', customer: { email: 'attacker@example.com' } });
  assertDisabled(res);
});

test('DATA_BACKEND=supabase: Stripe webhook stays mounted and live — rejects an invalid signature with 400 (not 410, not 404)', async () => {
  const { agent } = await agentWithCsrf();
  const res = await agent
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'not-a-real-signature')
    .send(JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } }));
  assert.equal(res.status, 400);
});

test('DATA_BACKEND=supabase: PayPal webhook stays mounted and live — rejects an unrecognized cert_url with 400 (not 410, not 404)', async () => {
  const { agent } = await agentWithCsrf();
  const res = await agent
    .post('/api/payments/paypal/webhook')
    .set({
      'paypal-cert-url': 'https://evil.example.com/fake-cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-id': 'txn-id',
      'paypal-transmission-sig': 'sig',
      'paypal-transmission-time': new Date().toISOString(),
    })
    .send({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });
  assert.equal(res.status, 400);
});

// Updated by the auth hardening security batch: GET /api/coupons
// (protect+adminOnly, keyed off a regular customer session) was itself
// closed under Supabase mode too — the same class of gap this batch fixed
// on the Mongo side. Admin listing now lives at /api/v1/admin/coupons
// (data/supabase/admin/couponsAdminController.js's listCoupons), reachable
// only with a real AdminUser session — never 410 (it's not a payment
// route), never a live regular-session-reachable admin listing either.
test('DATA_BACKEND=supabase: legacy GET /api/coupons admin listing route no longer exists (404, not 410 — historical/admin functionality was migrated, not payment-disabled)', async () => {
  const { agent } = await agentWithCsrf();
  const res = await agent.get('/api/coupons');
  assert.notEqual(res.status, 410);
  assert.equal(res.status, 404);
});

test('DATA_BACKEND=supabase: GET /api/v1/admin/coupons (the real replacement) rejects an unauthenticated caller with 401', async () => {
  const { agent } = await agentWithCsrf();
  const res = await agent.get('/api/v1/admin/coupons');
  assert.equal(res.status, 401);
});

// Review follow-up: same fix as the Mongo mirror (routes/invoiceRoutes.js) —
// data/supabase/routes/invoiceRoutes.js previously had no explicit /admin
// route either, so "admin" fell through to GET /:id and would have hit a
// Postgres invalid-UUID cast error (or similar) instead of a clean,
// deliberate response for a stale client still hitting the old admin URL.
test('DATA_BACKEND=supabase: legacy GET /api/invoices/admin returns an explicit 410, never a cast-error-shaped 500', async () => {
  const { agent } = await agentWithCsrf();
  const res = await agent.get('/api/invoices/admin');
  assert.equal(res.status, 410);
  assert.equal(res.body.error, 'ADMIN_ROUTE_MOVED');
});
