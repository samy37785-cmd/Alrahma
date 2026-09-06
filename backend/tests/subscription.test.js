import { test } from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';

// hasActiveSubscription() is the single gate for paid access (see User.js).
// A mongoose document can be instantiated without a DB connection, so we can
// unit-test the method's logic directly. The danger it guards against: a row
// left status:'active' after its validUntil has passed must NOT grant access.

const DAY = 24 * 60 * 60 * 1000;
const userWith = (subscription) => new User({ name: 'T', email: 't@e.co', password: 'x', subscription });

test('active + future validUntil => has access', () => {
  const u = userWith({ status: 'active', validUntil: new Date(Date.now() + 30 * DAY) });
  assert.equal(u.hasActiveSubscription(), true);
});

test('active but expired validUntil => NO access', () => {
  const u = userWith({ status: 'active', validUntil: new Date(Date.now() - DAY) });
  assert.equal(u.hasActiveSubscription(), false);
});

test('active with no validUntil => NO access (cannot grant open-ended access)', () => {
  const u = userWith({ status: 'active', validUntil: null });
  assert.equal(u.hasActiveSubscription(), false);
});

test('inactive status => NO access even if validUntil is in the future', () => {
  const u = userWith({ status: 'inactive', validUntil: new Date(Date.now() + 30 * DAY) });
  assert.equal(u.hasActiveSubscription(), false);
});

test('brand-new user (default subscription) => NO access', () => {
  const u = new User({ name: 'T', email: 't@e.co', password: 'x' });
  assert.equal(u.hasActiveSubscription(), false);
});
