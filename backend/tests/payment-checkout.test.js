import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Integration coverage for the PayPal checkout-initiation + direct-capture
// path (controllers/paymentController.js: createPaypalOrder, capturePaypalOrder)
// — the browser-driven flow that runs on every real checkout, as opposed to
// the webhook safety-net already covered by paypal-webhook.test.js. This was
// the second highest-risk gap identified by the discovery audit ("only the
// webhook confirmation path is tested, not checkout-initiation").
//
// Stripe checkout-initiation (controllers/stripeController.js: createStripeSession)
// is deliberately NOT covered here, for the same reason stripe-webhook.test.js
// already documents: it calls the real Stripe SDK (a real network client),
// which would need either live test-mode credentials or mocking the SDK's
// internals — judged too fragile/version-dependent, same engineering
// judgment already applied to this codebase's Stripe webhook tests. PayPal's
// integration is hand-rolled REST via plain `fetch` (no SDK), so mocking it
// at the fetch level is safe and low-risk, as already established in
// paypal-webhook.test.js.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => {
  process.env.PAYPAL_CLIENT_ID = 'client_id_for_tests';
  process.env.PAYPAL_CLIENT_SECRET = 'client_secret_for_tests';
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

// Mocks the two hand-rolled fetch calls createPaypalOrder/capturePaypalOrder
// make: the OAuth2 token exchange and the order-create/capture REST calls.
function mockPaypalCheckoutFetch(t, { captureStatus = 'COMPLETED' } = {}) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = String(url);
    if (u.includes('/v1/oauth2/token')) return jsonResponse({ access_token: 'fake-access-token' });

    if (u.endsWith('/capture')) {
      const orderId = u.match(/\/v2\/checkout\/orders\/([^/]+)\/capture$/)?.[1];
      return jsonResponse({
        status: captureStatus,
        purchase_units: [{ payments: { captures: [{ id: `CAP-${orderId}` }] } }],
      });
    }

    if (u.endsWith('/v2/checkout/orders')) {
      const body = JSON.parse(options.body);
      const orderId = `ORDER-${Math.random().toString(36).slice(2)}`;
      return jsonResponse({
        id: orderId,
        links: [{ rel: 'approve', href: `https://paypal.example/approve/${orderId}` }],
        _requestedAmount: body.purchase_units[0].amount, // for assertions below
      });
    }

    throw new Error(`Unexpected fetch call in test: ${u}`);
  });
}

// ---------------------------------------------------------------------------
// createPaypalOrder — validation + success (guest and authenticated checkout)
// ---------------------------------------------------------------------------

test('createPaypalOrder: rejects an unknown plan with 400 before any gateway call', async (t) => {
  // Deliberately no fetch mock installed: if the controller called the
  // gateway before validating the plan, this test would fail with an
  // "Unexpected fetch call" style network error instead of a clean 400.
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/paypal').set(csrf).send({ plan: 'NotAPlan' });
  assert.equal(res.status, 400);
});

test('createPaypalOrder: guest checkout creates a pending Payment priced from server-side plan config, ignoring any client-supplied amount', async (t) => {
  mockPaypalCheckoutFetch(t);
  const plan = getPlan('Starter');
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent
    .post('/api/payments/paypal')
    .set(csrf)
    // A tampered amount must have zero effect — price always comes from config/plans.js.
    .send({ plan: 'Starter', amount: 1, customer: { email: 'guest@example.com', name: 'Guest' } });

  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'redirect');
  assert.ok(res.body.orderId);

  const payment = await Payment.findOne({ gatewayOrderId: res.body.orderId });
  assert.ok(payment, 'expected a Payment record to be created');
  assert.equal(payment.status, 'pending');
  assert.equal(payment.gateway, 'paypal');
  assert.equal(payment.amount, plan.amount);
  assert.equal(payment.currency, plan.currency);
  assert.equal(payment.userId, null, 'a guest checkout must not be attributed to a user');
});

test('createPaypalOrder: an authenticated checkout attributes the Payment to the logged-in user', async (t) => {
  mockPaypalCheckoutFetch(t);
  const { agent, csrf } = await agentWithCsrf(app);
  const email = 'loggedin-checkout@example.com';
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Buyer', email, password: PASSWORD });

  const res = await agent.post('/api/payments/paypal').set(csrf).send({ plan: 'Standard', customer: { email, name: 'Buyer' } });
  assert.equal(res.status, 200);

  const user = await User.findOne({ email });
  const payment = await Payment.findOne({ gatewayOrderId: res.body.orderId });
  assert.equal(String(payment.userId), String(user._id));
});

// ---------------------------------------------------------------------------
// capturePaypalOrder — full lifecycle: success, failure, idempotency
// ---------------------------------------------------------------------------

async function createOrderAsStudent(t, planName, { captureStatus } = {}) {
  mockPaypalCheckoutFetch(t, { captureStatus });
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const orderRes = await agent.post('/api/payments/paypal').set(csrf).send({ plan: planName, customer: { email, name: 'Student' } });
  const user = await User.findOne({ email });
  return { agent, csrf, orderId: orderRes.body.orderId, user };
}

test('capturePaypalOrder: a COMPLETED capture marks the payment paid, creates one invoice, and activates the subscription', async (t) => {
  const plan = getPlan('Premium');
  const { agent, csrf, orderId, user } = await createOrderAsStudent(t, 'Premium', { captureStatus: 'COMPLETED' });

  const res = await agent.post(`/api/payments/paypal/${orderId}/capture`).set(csrf).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'COMPLETED');

  const payment = await Payment.findOne({ gatewayOrderId: orderId });
  assert.equal(payment.status, 'paid');

  const invoices = await Invoice.find({ user: user._id });
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].amount, plan.amount);
  assert.equal(invoices[0].status, 'paid');

  const updatedUser = await User.findById(user._id);
  assert.equal(updatedUser.subscription.status, 'active');
  assert.equal(updatedUser.subscription.plan, 'Premium');
});

test('capturePaypalOrder: a non-COMPLETED capture marks the payment failed and grants nothing', async (t) => {
  const { agent, csrf, orderId, user } = await createOrderAsStudent(t, 'Starter', { captureStatus: 'DECLINED' });

  const res = await agent.post(`/api/payments/paypal/${orderId}/capture`).set(csrf).send({});
  assert.equal(res.status, 200); // the HTTP call itself succeeds; the *payment* did not
  assert.equal(res.body.status, 'DECLINED');

  const payment = await Payment.findOne({ gatewayOrderId: orderId });
  assert.equal(payment.status, 'failed');

  const invoices = await Invoice.find({ user: user._id });
  assert.equal(invoices.length, 0);

  const updatedUser = await User.findById(user._id);
  assert.equal(updatedUser.subscription?.status ?? 'inactive', 'inactive');
});

test('capturePaypalOrder: capturing the same order twice is idempotent — only one invoice is ever created', async (t) => {
  const { agent, csrf, orderId, user } = await createOrderAsStudent(t, 'Standard', { captureStatus: 'COMPLETED' });

  const first = await agent.post(`/api/payments/paypal/${orderId}/capture`).set(csrf).send({});
  const second = await agent.post(`/api/payments/paypal/${orderId}/capture`).set(csrf).send({});

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const invoices = await Invoice.find({ user: user._id });
  assert.equal(invoices.length, 1, 'a duplicate capture call must never create a second invoice');

  const payment = await Payment.findOne({ gatewayOrderId: orderId });
  assert.equal(payment.status, 'paid');
});
