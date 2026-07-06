import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T9: express-validator failures used to respond with
// `{ errors: [...] }` (utils/validationHelper.js) while every other error
// response in the API — manual checks, the global errorHandler, Mongoose
// ValidationError — responds with `{ message: "..." }`. A repo-wide audit
// found zero frontend code anywhere reading `.errors`, so this was a latent
// inconsistency with no live consumer; handleValidationErrors now joins
// express-validator's messages into the same `{ message }` shape as
// everywhere else. These tests lock that contract in across all of its call
// sites.

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

function assertMessageShape(res) {
  assert.equal(res.status, 422);
  assert.equal(typeof res.body.message, 'string');
  assert.ok(res.body.message.length > 0);
  assert.equal(res.body.errors, undefined, 'the old { errors: [...] } shape must not appear alongside { message }');
}

test('couponController.createCoupon: express-validator failure returns { message }, not { errors }', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.post('/api/coupons').set(csrf).send({}); // missing every required field
  assertMessageShape(res);
});

test('blogController.createPost: express-validator failure returns { message }, not { errors }', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.post('/api/blog').set(csrf).send({});
  assertMessageShape(res);
});

test('reviewController.createReview: express-validator failure returns { message }, not { errors }', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student${Date.now()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });

  const res = await agent.post('/api/reviews').set(csrf).send({ rating: 99 }); // out of 1–5 range, body missing
  assertMessageShape(res);
});

test('contactController.submitContact: express-validator failure returns { message }, not { errors }', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/contact').set(csrf).send({}); // missing every required field
  assertMessageShape(res);
});

test('combines multiple field errors into one readable message', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.post('/api/coupons').set(csrf).send({ discountType: 'bogus' }); // multiple violations: code missing, discountValue missing, discountType invalid
  assertMessageShape(res);
  assert.ok(res.body.message.includes(','), 'multiple validation failures should be joined into one message');
});
