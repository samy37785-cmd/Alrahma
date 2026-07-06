import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import Coupon from '../models/Coupon.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// T15: this file previously tested a hand-copied reimplementation of
// isValid()/calculateDiscount() defined inline in the test itself (a
// `makeCoupon()` factory) — it never imported models/Coupon.js, so every
// assertion here would have kept passing even if the real Coupon model were
// deleted or its logic completely different. Replaced with tests against the
// real Coupon model (via the shared in-memory DB, same as every other model
// test in this suite) and the real /api/coupons/* routes end-to-end.
//
// "Update behavior" (PATCH /api/coupons/:id — validation, mass-assignment
// protection, partial updates) is already covered by
// tests/admin-update-validation.test.js and is not duplicated here.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeAdminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `admin${Date.now()}${Math.random()}@example.com`;
  await User.create({ name: 'Admin', email, password: PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

// ---------------------------------------------------------------------------
// Coupon model — isValid() (real instance method, real schema)
// ---------------------------------------------------------------------------

test('Coupon.isValid(): true when active, in date range, and under the usage limit', async () => {
  const coupon = await Coupon.create({ code: 'VALID1', discountType: 'percent', discountValue: 10 });
  assert.equal(coupon.isValid(), true);
});

test('Coupon.isValid(): false when active is false', async () => {
  const coupon = await Coupon.create({ code: 'INACTIVE1', discountType: 'percent', discountValue: 10, active: false });
  assert.equal(coupon.isValid(), false);
});

test('Coupon.isValid(): false once validUntil is in the past (expired)', async () => {
  const coupon = await Coupon.create({
    code: 'EXPIRED1', discountType: 'percent', discountValue: 10,
    validUntil: new Date(Date.now() - 1000),
  });
  assert.equal(coupon.isValid(), false);
});

test('Coupon.isValid(): false when validFrom is in the future (not yet active)', async () => {
  const coupon = await Coupon.create({
    code: 'FUTURE1', discountType: 'percent', discountValue: 10,
    validFrom: new Date(Date.now() + 1000 * 60 * 60),
  });
  assert.equal(coupon.isValid(), false);
});

test('Coupon.isValid(): false once usedCount reaches maxUses', async () => {
  const coupon = await Coupon.create({
    code: 'MAXED1', discountType: 'percent', discountValue: 10,
    maxUses: 5, usedCount: 5,
  });
  assert.equal(coupon.isValid(), false);
});

test('Coupon.isValid(): true when usedCount is still below maxUses', async () => {
  const coupon = await Coupon.create({
    code: 'NOTMAXED1', discountType: 'percent', discountValue: 10,
    maxUses: 5, usedCount: 4,
  });
  assert.equal(coupon.isValid(), true);
});

// ---------------------------------------------------------------------------
// Coupon model — calculateDiscount() (real instance method, real schema)
// ---------------------------------------------------------------------------

test('Coupon.calculateDiscount(): percent discount is a percentage of the order amount', async () => {
  const coupon = await Coupon.create({ code: 'PCT20', discountType: 'percent', discountValue: 20 });
  assert.equal(coupon.calculateDiscount(100), 20);
});

test('Coupon.calculateDiscount(): fixed discount subtracts a flat amount', async () => {
  const coupon = await Coupon.create({ code: 'FIXED15', discountType: 'fixed', discountValue: 15 });
  assert.equal(coupon.calculateDiscount(100), 15);
});

test('Coupon.calculateDiscount(): a fixed discount is capped at the order amount (never goes negative)', async () => {
  const coupon = await Coupon.create({ code: 'FIXED200', discountType: 'fixed', discountValue: 200 });
  assert.equal(coupon.calculateDiscount(50), 50);
});

test('Coupon.calculateDiscount(): returns 0 when the order is below minOrderAmount', async () => {
  const coupon = await Coupon.create({ code: 'MINORDER', discountType: 'percent', discountValue: 20, minOrderAmount: 100 });
  assert.equal(coupon.calculateDiscount(50), 0);
});

test('Coupon.calculateDiscount(): returns 0 for an invalid (inactive) coupon', async () => {
  const coupon = await Coupon.create({ code: 'INACTIVE2', discountType: 'percent', discountValue: 20, active: false });
  assert.equal(coupon.calculateDiscount(100), 0);
});

// ---------------------------------------------------------------------------
// POST /api/coupons/validate — real controller + real model, end-to-end
// ---------------------------------------------------------------------------

test('validateCoupon: a valid, active coupon returns its discount info', async () => {
  await Coupon.create({ code: 'SUMMER25', discountType: 'percent', discountValue: 25, description: 'Summer sale' });
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'SUMMER25' });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.discountType, 'percent');
  assert.equal(res.body.discountValue, 25);
  assert.equal(res.body.description, 'Summer sale');
});

test('validateCoupon: the code lookup is case-insensitive (input is uppercased before matching)', async () => {
  await Coupon.create({ code: 'MIXEDCASE', discountType: 'fixed', discountValue: 5 });
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon2-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'mixedcase' });
  assert.equal(res.status, 200);
  assert.equal(res.body.code, 'MIXEDCASE');
});

test('validateCoupon: an unknown code returns 404', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon3-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'DOESNOTEXIST' });
  assert.equal(res.status, 404);
});

test('validateCoupon: an expired coupon returns 400', async () => {
  await Coupon.create({
    code: 'EXPIREDNOW', discountType: 'percent', discountValue: 10,
    validUntil: new Date(Date.now() - 1000),
  });
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon4-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'EXPIREDNOW' });
  assert.equal(res.status, 400);
});

test('validateCoupon: an inactive coupon returns 400', async () => {
  await Coupon.create({ code: 'TURNEDOFF', discountType: 'percent', discountValue: 10, active: false });
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon5-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'TURNEDOFF' });
  assert.equal(res.status, 400);
});

test('validateCoupon: a coupon already used by this user returns 400', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon6-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });
  const user = await User.findOne({ email });

  await Coupon.create({
    code: 'ALREADYUSED', discountType: 'percent', discountValue: 10,
    usedBy: [{ user: user._id }],
  });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'ALREADYUSED' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already used/i);
});

test('validateCoupon: a coupon used by a DIFFERENT user is still valid for this user', async () => {
  const otherUser = await User.create({ name: 'Other', email: 'other-user@example.com', password: PASSWORD });
  await Coupon.create({
    code: 'USEDBYOTHER', discountType: 'percent', discountValue: 10,
    usedBy: [{ user: otherUser._id }],
  });

  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-coupon7-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'USEDBYOTHER' });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
});

// ---------------------------------------------------------------------------
// createCoupon / listCoupons / deleteCoupon — real controller + real model
// ---------------------------------------------------------------------------

test('createCoupon: a valid admin request creates a real, persisted Coupon document', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.post('/api/coupons').set(csrf).send({
    code: 'newcode', discountType: 'fixed', discountValue: 30,
  });

  assert.equal(res.status, 201);
  const stored = await Coupon.findOne({ code: 'NEWCODE' }); // schema uppercases
  assert.ok(stored, 'the coupon must actually be persisted');
  assert.equal(stored.discountValue, 30);
});

test('createCoupon: a duplicate code is rejected with 409 (unique index)', async () => {
  await Coupon.create({ code: 'DUPETEST', discountType: 'percent', discountValue: 10 });
  const { agent, csrf } = await makeAdminAgent();

  const res = await agent.post('/api/coupons').set(csrf).send({
    code: 'DUPETEST', discountType: 'fixed', discountValue: 5,
  });
  assert.equal(res.status, 409);
});

test('listCoupons: returns real, previously-created coupons', async () => {
  await Coupon.create({ code: 'LIST1', discountType: 'percent', discountValue: 10 });
  await Coupon.create({ code: 'LIST2', discountType: 'fixed', discountValue: 5 });

  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.get('/api/coupons').set(csrf);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
});

test('deleteCoupon: removes the real document — a subsequent validate returns 404', async () => {
  const coupon = await Coupon.create({ code: 'TODELETE', discountType: 'percent', discountValue: 10 });
  const { agent, csrf } = await makeAdminAgent();

  const del = await agent.delete(`/api/coupons/${coupon._id}`).set(csrf);
  assert.equal(del.status, 200);

  const gone = await Coupon.findById(coupon._id);
  assert.equal(gone, null);

  const studentAgent = await agentWithCsrf(app);
  await studentAgent.agent.post('/api/auth/register').set(studentAgent.csrf).send({ name: 'S', email: `after-delete-${Date.now()}@example.com`, password: PASSWORD });
  const validateRes = await studentAgent.agent.post('/api/coupons/validate').set(studentAgent.csrf).send({ code: 'TODELETE' });
  assert.equal(validateRes.status, 404);
});
