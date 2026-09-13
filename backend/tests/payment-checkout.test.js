import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import Payment from '../models/Payment.js';
import ManualPayment from '../models/ManualPayment.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Booking-First Enrollment closed EVERY customer-reachable payment-
// initiation/execution endpoint server-side, not just in the frontend UI
// (see docs/current-project-status.md). This file used to exercise the real
// PayPal checkout-initiation + browser-driven-capture path end-to-end; that
// flow no longer exists for a customer, so this file now proves the
// opposite property instead: a customer cannot start or execute a payment
// via any of these routes any more, and none of them has any side effect
// (no Payment/ManualPayment record is ever created by a disabled route).
//
// The underlying idempotent-finalize invariant these routes used to protect
// (PayPal capture never double-invoices/double-enrolls) is NOT lost — it is
// still exercised end-to-end via the webhook path in paypal-webhook.test.js,
// which drives the exact same finalizePaypalOrder() code, just via PayPal's
// own server-to-server webhook instead of the now-disabled browser capture
// route. stripe-webhook.test.js is the equivalent for Stripe.

before(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_integration_tests';
  process.env.PAYPAL_WEBHOOK_ID = 'webhook_id_for_tests';
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

function assertDisabled(res) {
  assert.equal(res.status, 410);
  assert.equal(res.body.error, 'PAYMENTS_DISABLED');
}

test('POST /api/payments/stripe (checkout-session creation) is disabled with 410 PAYMENTS_DISABLED', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/stripe').set(csrf).send({ plan: 'Starter', customer: { email: 'x@example.com' } });
  assertDisabled(res);
});

test('POST /api/payments/paypal (order creation) is disabled with 410 and creates no Payment record', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/paypal').set(csrf).send({ plan: 'Starter', customer: { email: 'x@example.com' } });
  assertDisabled(res);

  const count = await Payment.countDocuments();
  assert.equal(count, 0, 'a disabled route must never create a Payment record');
});

test('POST /api/payments/paypal/:orderId/capture is disabled with 410, even for an order id that looks plausible', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/paypal/ORDER-DOES-NOT-EXIST/capture').set(csrf).send({});
  assertDisabled(res);
});

test('GET /api/payments/manual-methods is disabled with 410 (no method/receiver details are ever exposed)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.get('/api/payments/manual-methods').set(csrf);
  assertDisabled(res);
});

test('POST /api/payments/manual (manual payment submission) is disabled with 410 and creates no ManualPayment record', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/payments/manual')
    .set(csrf)
    .send({ plan: 'Starter', method: 'bank', customer: { email: 'x@example.com', name: 'X' } });
  assertDisabled(res);

  const count = await ManualPayment.countDocuments();
  assert.equal(count, 0, 'a disabled route must never create a ManualPayment record');
});

test('POST /api/coupons/validate (checkout coupon field) is disabled with 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'ANYTHING' });
  assertDisabled(res);
});

test('a tampered client-supplied amount/status cannot reach a gateway: the route never even sees the payload before returning 410', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/payments/paypal')
    .set(csrf)
    .send({ plan: 'Starter', amount: 1, status: 'paid', customer: { email: 'attacker@example.com' } });
  assertDisabled(res);
  assert.equal(await Payment.countDocuments(), 0);
});

// Sanity check that ONLY the customer-facing entry points were closed —
// the gateway webhooks (server-to-server, never customer-triggered) are
// still live and still run their own real validation, not the disabled
// stub. A bad/missing signature must still fail with the webhook's own
// error, never 410.
test('Stripe webhook stays live and still rejects an invalid signature with 400 (not 410)', async () => {
  const res = await (await agentWithCsrf(app)).agent
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'not-a-real-signature')
    .send(JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } }));
  assert.equal(res.status, 400);
});

test('PayPal webhook stays live and still rejects an unrecognized cert_url with 400 (not 410)', async () => {
  const { agent } = await agentWithCsrf(app);
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
