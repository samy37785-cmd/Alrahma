import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, getPlan } from '../config/plans.js';

// The plan catalogue is the server-side source of truth for pricing. These
// tests lock the prices so an accidental edit can't silently change what
// customers are charged, and confirm the lookup rejects unknown plans (the
// guard that stops a tampered "plan" from skipping the price check).

test('getPlan returns the exact catalogue entry for each known plan', () => {
  assert.deepEqual(getPlan('Starter'),  { name: 'Starter',  amount: 56,  originalAmount: 75,  discountPct: 25, currency: 'EUR' });
  assert.deepEqual(getPlan('Standard'), { name: 'Standard', amount: 84,  originalAmount: 112, discountPct: 25, currency: 'EUR' });
  assert.deepEqual(getPlan('Premium'),  { name: 'Premium',  amount: 112, originalAmount: 149, discountPct: 25, currency: 'EUR' });
});

test('getPlan returns undefined for unknown / tampered plan names', () => {
  assert.equal(getPlan('Free'), undefined);
  assert.equal(getPlan(''), undefined);
  assert.equal(getPlan(undefined), undefined);
  assert.equal(getPlan('__proto__'), undefined);
});

test('every plan bills in EUR with a positive integer-cents amount', () => {
  for (const [key, plan] of Object.entries(PLANS)) {
    assert.equal(plan.name, key, `name should match key for ${key}`);
    assert.equal(plan.currency, 'EUR');
    assert.ok(plan.amount > 0, `${key} amount must be positive`);
    // Stripe charges unit_amount in integer cents: amount*100 must be whole.
    assert.equal(Math.round(plan.amount * 100), plan.amount * 100, `${key} amount must have no sub-cent fraction`);
    assert.ok(plan.originalAmount >= plan.amount, `${key} original price should be >= discounted`);
  }
});
