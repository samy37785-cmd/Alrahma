import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Integration coverage for the Stripe webhook (controllers/stripeController.js)
// -- previously untested. Scope note: 'checkout.session.completed' and
// 'invoice.paid' both call stripe.subscriptions.retrieve(), a real call to
// Stripe's API that would need either live test-mode credentials or mocking
// the SDK's fetch-based HTTP client -- judged too fragile/version-dependent
// to build reliably here, so it's NOT covered by this file (documented as a
// gap, not silently skipped). 'customer.subscription.deleted' needs no
// external API call (services/subscriptionService.js: deactivateSubscription
// is a pure DB update), so it's covered end-to-end below, along with
// signature verification, which is identical machinery across all event
// types and the actual security property the report flagged.

const WEBHOOK_SECRET = 'whsec_test_secret_for_integration_tests';

before(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

function sign(payload, secret = WEBHOOK_SECRET) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

test('rejects a request with an invalid signature', async () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });

  const res = await request(app)
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'not-a-real-signature')
    .send(payload);

  assert.equal(res.status, 400);
});

test('rejects (fails closed) when STRIPE_WEBHOOK_SECRET is not configured', async () => {
  const original = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    const res = await request(app)
      .post('/api/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload, 'whsec_irrelevant'))
      .send(payload);
    assert.equal(res.status, 401);
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = original;
  }
});

test('customer.subscription.deleted: a validly-signed event deactivates the matching subscription', async () => {
  await User.create({
    name: 'Sub User', email: 'subuser@example.com', password: 'Str0ngP@ssw0rd!',
    subscription: { plan: 'Starter', status: 'active', stripeSubscriptionId: 'sub_abc123' },
  });

  const payload = JSON.stringify({
    id: 'evt_test_1', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_abc123' } },
  });

  const res = await request(app)
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', sign(payload))
    .send(payload);

  assert.equal(res.status, 200);
  const updated = await User.findOne({ email: 'subuser@example.com' });
  assert.equal(updated.subscription.status, 'inactive');
});

test('a duplicate delivery of the same event is a safe no-op (idempotent)', async () => {
  await User.create({
    name: 'Sub User 2', email: 'subuser2@example.com', password: 'Str0ngP@ssw0rd!',
    subscription: { plan: 'Starter', status: 'active', stripeSubscriptionId: 'sub_def456' },
  });

  const payload = JSON.stringify({
    id: 'evt_test_2', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_def456' } },
  });
  const sig = sign(payload);

  const first  = await request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').set('stripe-signature', sig).send(payload);
  const second = await request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').set('stripe-signature', sig).send(payload);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200); // no crash, no duplicate side effect
  const updated = await User.findOne({ email: 'subuser2@example.com' });
  assert.equal(updated.subscription.status, 'inactive');
});
