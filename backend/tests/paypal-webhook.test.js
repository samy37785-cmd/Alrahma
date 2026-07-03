import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Integration coverage for the PayPal webhook (controllers/paymentController.js)
// -- previously untested. Unlike Stripe, PayPal integration is hand-rolled
// REST via plain `fetch` (no SDK) for both the OAuth2 token exchange and the
// verify-webhook-signature call, so those calls are mocked at the fetch level
// -- this is a much lower-risk mock than trying to intercept Stripe's SDK
// internals, since it's plain code this project owns, not a third-party
// wire format.

const REQUIRED_HEADERS = {
  'paypal-cert-url':          'https://api.paypal.com/some/cert',
  'paypal-auth-algo':         'SHA256withRSA',
  'paypal-transmission-id':   'txn-id',
  'paypal-transmission-sig':  'sig',
  'paypal-transmission-time': new Date().toISOString(),
};

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

function mockPaypalFetch(t, { verificationStatus = 'SUCCESS' } = {}) {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('/v1/oauth2/token')) return jsonResponse({ access_token: 'fake-access-token' });
    if (u.includes('/v1/notifications/verify-webhook-signature')) {
      return jsonResponse({ verification_status: verificationStatus });
    }
    throw new Error(`Unexpected fetch call in test: ${u}`);
  });
}

before(async () => {
  process.env.PAYPAL_WEBHOOK_ID = 'webhook_id_for_tests';
  process.env.PAYPAL_CLIENT_ID = 'client_id_for_tests';
  process.env.PAYPAL_CLIENT_SECRET = 'client_secret_for_tests';
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

test('rejects a cert_url that is not a real PayPal host', async () => {
  const res = await request(app)
    .post('/api/payments/paypal/webhook')
    .set({ ...REQUIRED_HEADERS, 'paypal-cert-url': 'https://evil.example.com/fake-cert' })
    .send({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });

  assert.equal(res.status, 400);
});

test('fails closed when PAYPAL_WEBHOOK_ID is not configured', async () => {
  const original = process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_WEBHOOK_ID;
  try {
    const res = await request(app)
      .post('/api/payments/paypal/webhook')
      .set(REQUIRED_HEADERS)
      .send({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });
    assert.equal(res.status, 401);
  } finally {
    process.env.PAYPAL_WEBHOOK_ID = original;
  }
});

test('rejects an event PayPal itself reports as an invalid signature', async (t) => {
  mockPaypalFetch(t, { verificationStatus: 'FAILURE' });

  const res = await request(app)
    .post('/api/payments/paypal/webhook')
    .set(REQUIRED_HEADERS)
    .send({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { supplementary_data: { related_ids: { order_id: 'ORDER1' } } } });

  assert.equal(res.status, 400);
});

test('PAYMENT.CAPTURE.COMPLETED: a validly-signed event marks the payment paid and enrolls the user', async (t) => {
  mockPaypalFetch(t);

  const user = await User.create({ name: 'Payer', email: 'payer@example.com', password: 'Str0ngP@ssw0rd!' });
  await Payment.create({
    plan: 'Starter', amount: 10, gateway: 'paypal', status: 'pending',
    gatewayOrderId: 'ORDER1', userId: user._id,
    customer: { email: user.email, name: user.name },
  });

  const res = await request(app)
    .post('/api/payments/paypal/webhook')
    .set(REQUIRED_HEADERS)
    .send({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE1', supplementary_data: { related_ids: { order_id: 'ORDER1' } } },
    });

  assert.equal(res.status, 200);
  const payment = await Payment.findOne({ gatewayOrderId: 'ORDER1' });
  assert.equal(payment.status, 'paid');

  const updatedUser = await User.findById(user._id);
  assert.equal(updatedUser.subscription.status, 'active');
});

test('a duplicate delivery of the same completed capture is a safe no-op (idempotent)', async (t) => {
  mockPaypalFetch(t);

  const user = await User.create({ name: 'Payer 2', email: 'payer2@example.com', password: 'Str0ngP@ssw0rd!' });
  await Payment.create({
    plan: 'Starter', amount: 10, gateway: 'paypal', status: 'pending',
    gatewayOrderId: 'ORDER2', userId: user._id,
    customer: { email: user.email, name: user.name },
  });

  const body = {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: 'CAPTURE2', supplementary_data: { related_ids: { order_id: 'ORDER2' } } },
  };

  const first  = await request(app).post('/api/payments/paypal/webhook').set(REQUIRED_HEADERS).send(body);
  const second = await request(app).post('/api/payments/paypal/webhook').set(REQUIRED_HEADERS).send(body);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const payment = await Payment.findOne({ gatewayOrderId: 'ORDER2' });
  assert.equal(payment.status, 'paid'); // unchanged by the second delivery
});
