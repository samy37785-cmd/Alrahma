import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../app.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import ManualPayment from '../models/ManualPayment.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Scope correction (see docs/current-project-status.md): the earlier "No
// Payments Product" pass retired every payment-adjacent route. That was too
// broad — only ONLINE CARD GATEWAY execution (Stripe checkout/webhook,
// PayPal's real Orders-API checkout/capture/webhook) is cancelled. Manual/
// offline payment, coupons, invoices, and admin subscription activation are
// not a card-gateway feature and are restored live. This file is the
// required proof, split accordingly (Mongo backend):
//   1. Every genuinely-retired card-gateway route returns a fixed 410
//      { error: 'ONLINE_CARD_PAYMENTS_DISABLED' } and never creates/modifies
//      a Payment document.
//   2. Every restored route (manual payment, coupon validate, invoices,
//      admin payments/coupons/invoices/subscription) is live and reachable —
//      NOT 410 — for a real request.
//   3. Static proof: the still-retired card-gateway routes no longer import
//      the Stripe/PayPal gateway controllers at all.
// The Supabase-backend equivalent lives in
// tests/payments-retired-supabase.test.js.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '..');

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

function assertCardDisabled(res, label) {
  assert.equal(res.status, 410, `${label} expected 410, got ${res.status} (body: ${JSON.stringify(res.body)})`);
  assert.deepEqual(res.body, { error: 'ONLINE_CARD_PAYMENTS_DISABLED' }, `${label} unexpected body shape`);
}

// ---------------------------------------------------------------------------
// 1. Card-gateway routes — still closed, new error code, no Payment writes.
// ---------------------------------------------------------------------------

const CARD_GATEWAY_ROUTES = [
  ['post', '/api/payments/stripe/webhook', { type: 'checkout.session.completed', data: { object: { id: 'cs_test_123', metadata: { userId: 'x', plan: 'Starter' } } } }],
  ['post', '/api/payments/stripe', { plan: 'Starter' }],
  ['post', '/api/payments/paypal/webhook', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-123' } }],
  ['post', '/api/payments/paypal', { plan: 'Starter' }],
  ['post', '/api/payments/paypal/ORDER123/capture', {}],
];

test('every online card-gateway route returns a fixed 410 ONLINE_CARD_PAYMENTS_DISABLED and touches no Payment document', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const before_ = await Payment.countDocuments();

  for (const [method, path_, body] of CARD_GATEWAY_ROUTES) {
    const res = await agent[method](path_).set(csrf).send(body);
    assertCardDisabled(res, `${method.toUpperCase()} ${path_}`);
  }

  assert.equal(await Payment.countDocuments(), before_, 'no card-gateway route may create/modify a Payment document');
});

// ---------------------------------------------------------------------------
// 2. Restored routes — public/customer-facing.
// ---------------------------------------------------------------------------

test('POST /api/payments/manual (manual/offline payment submission) is live, not 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/manual').set(csrf).send({
    plan: 'Starter', method: 'bank', customer: { name: 'A', email: 'a@example.com' }, reference: 'REF-1',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(await ManualPayment.countDocuments(), 1);
});

test('GET /api/payments/manual-methods is live, not 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.get('/api/payments/manual-methods').set(csrf);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('POST /api/coupons/validate is live, not 410 (reaches the real controller — an unknown code 404s instead of a generic 410)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'NOSUCHCODE' });
  assert.equal(res.status, 404);
  assert.notDeepEqual(res.body, { error: 'PAYMENTS_RETIRED' });
});

test('GET /api/invoices and /api/invoices/:id require the customer to be signed in (protect), and are live, not 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const list = await agent.get('/api/invoices').set(csrf);
  assert.equal(list.status, 401);
  const one = await agent.get('/api/invoices/000000000000000000000000').set(csrf);
  assert.equal(one.status, 401);
});

test('GET /api/invoices/admin no longer exists as a dedicated admin route (legacy protect+adminOnly admin bypass stays removed — Auth hardening security batch precedent); it now falls through to the protected GET /:id route (id="admin") and 401s unauthenticated, same as any other invoice id would', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.get('/api/invoices/admin').set(csrf);
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 3. Restored routes — admin.
// ---------------------------------------------------------------------------

const ADMIN_RESTORED_ROUTES = [
  ['get',   '/api/v1/admin/payments/manual', undefined],
  ['get',   '/api/v1/admin/coupons', undefined],
  ['get',   '/api/v1/admin/invoices', undefined],
];

test('restored admin payments/coupons/invoices routes require authentication — 401, never 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  for (const [method, path_, body] of ADMIN_RESTORED_ROUTES) {
    const res = await agent[method](path_).set(csrf).send(body);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path_} expected 401, got ${res.status}`);
    assert.notDeepEqual(res.body, { error: 'PAYMENTS_RETIRED' });
  }
});

test('an authenticated admin reaches the real controller for the restored admin routes (200, real data shape — not 410)', async () => {
  const { agent, cookieHeader } = await adminAgent('admin');
  for (const [method, path_] of ADMIN_RESTORED_ROUTES) {
    const res = await agent[method](path_).set('Cookie', cookieHeader);
    assert.equal(res.status, 200, `${method.toUpperCase()} ${path_} expected 200, got ${res.status} (${JSON.stringify(res.body)})`);
  }
});

test('PATCH /api/v1/admin/users/:id/subscription is live and reaches the real controller (a real user is actually activated)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const student = await User.create({ name: 'S', email: `s-${Date.now()}@example.com`, password: 'Sup3r-Str0ng-Pass!', role: 'student' });

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Starter' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.subscription.status, 'active');
  assert.equal(res.body.subscription.plan, 'Starter');
});

// ---------------------------------------------------------------------------
// 4. Static proof: the still-retired card-gateway routes no longer import
//    the Stripe/PayPal gateway controllers.
// ---------------------------------------------------------------------------

const GATEWAY_CONTROLLER_IMPORT_PATTERNS = [
  /import\s*\{[^}]*\b(createPaypalOrder|capturePaypalOrder|paypalWebhook)\b[^}]*\}\s*from/,
  /from ['"].*controllers\/stripeController\.js['"]/,
  /from ['"].*stripeController\.js['"]/,
];

const ROUTE_FILES_THAT_MUST_NOT_IMPORT_GATEWAY_CONTROLLERS = [
  'routes/paymentRoutes.js',
  'data/supabase/routes/paymentRoutes.js',
];

test('static: card-gateway route files no longer import the Stripe/PayPal gateway controllers (structurally unreachable, not just unmounted)', () => {
  for (const file of ROUTE_FILES_THAT_MUST_NOT_IMPORT_GATEWAY_CONTROLLERS) {
    const source = readFileSync(path.join(BACKEND_ROOT, file), 'utf8');
    for (const pattern of GATEWAY_CONTROLLER_IMPORT_PATTERNS) {
      assert.equal(pattern.test(source), false, `${file} must not match ${pattern} — a card-gateway controller must never be importable from a retired route`);
    }
  }
});

test('static: routes/v1/admin/index.js mounts /payments, /coupons, and /invoices on real sub-routers, not the retired closer', () => {
  const source = readFileSync(path.join(BACKEND_ROOT, 'routes/v1/admin/index.js'), 'utf8');
  assert.doesNotMatch(source, /router\.use\('\/payments',\s*paymentsRetired\)/);
  assert.doesNotMatch(source, /router\.use\('\/coupons',\s*paymentsRetired\)/);
  assert.doesNotMatch(source, /router\.use\('\/invoices',\s*paymentsRetired\)/);
  assert.match(source, /router\.use\('\/payments',\s*isSupabaseBackend\(\)\s*\?\s*supabasePaymentsAdminRoutes\s*:\s*paymentsRoutes\)/);
  assert.match(source, /router\.use\('\/coupons',\s*isSupabaseBackend\(\)\s*\?\s*supabaseCouponsAdminRoutes\s*:\s*couponsRoutes\)/);
  assert.match(source, /router\.use\('\/invoices',\s*isSupabaseBackend\(\)\s*\?\s*supabaseInvoicesAdminRoutes\s*:\s*invoicesRoutes\)/);
});

// Unused-collection sanity: Coupon collection genuinely reachable now too.
test('POST /api/v1/admin/coupons (authenticated admin) creates a real Coupon document', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.post('/api/v1/admin/coupons').set({ ...csrf, Cookie: cookieHeader }).send({
    code: 'SAVE10', discountType: 'percent', discountValue: 10,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(await Coupon.countDocuments(), 1);
});
