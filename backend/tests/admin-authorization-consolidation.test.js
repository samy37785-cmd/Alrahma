import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T11: blogRoutes.js, couponRoutes.js, reviewRoutes.js, and
// contactRoutes.js each used to define their own local, independently
// duplicated admin-check middleware (message: 'Admins only') instead of the
// shared adminOnly from middleware/auth.js (message: 'Admin access
// required'). This consolidates them onto the shared middleware. These
// routers had zero prior test coverage of their admin-gated endpoints, so
// this file locks in that every one of them still enforces the exact same
// 401 (unauthenticated) / 403 (authenticated non-admin) / pass-through
// (admin) behavior as before — the only intentional payload change is the
// 403 message text, now standardized to the shared middleware's wording,
// which nothing in the frontend or test suite depended on (verified via a
// repo-wide grep before making this change).

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

async function makeStudentAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student${Date.now()}${Math.random()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: PASSWORD });
  return { agent, csrf };
}

// Each entry: [method, path, body] for every admin-gated route touched by T11.
const ADMIN_ROUTES = [
  ['post',   '/api/blog',                {}],
  ['patch',  '/api/blog/000000000000000000000000', {}],
  ['delete', '/api/blog/000000000000000000000000', undefined],
  ['get',    '/api/coupons',             undefined],
  ['post',   '/api/coupons',             {}],
  ['patch',  '/api/coupons/000000000000000000000000', {}],
  ['delete', '/api/coupons/000000000000000000000000', undefined],
  ['patch',  '/api/reviews/000000000000000000000000/moderate', { status: 'approved' }],
  ['get',    '/api/contact',             undefined],
  ['patch',  '/api/contact/000000000000000000000000', { status: 'read' }],
];

test('every admin-gated route is rejected with 401 when unauthenticated', async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const { agent, csrf } = await agentWithCsrf(app);
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} expected 401, got ${res.status}`);
  }
});

test('every admin-gated route is rejected with 403 for an authenticated non-admin', async () => {
  const { agent, csrf } = await makeStudentAgent();
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${path} expected 403, got ${res.status}`);
    assert.equal(res.body.message, 'Admin access required');
  }
});

test('an authenticated admin passes the authorization gate on every route (blog)', async () => {
  const { agent, csrf } = await makeAdminAgent();

  // POST / with an empty body: past the auth gate, express-validator now
  // rejects it (422) — proves the gate was passed, not bypassed.
  const create = await agent.post('/api/blog').set(csrf).send({});
  assert.equal(create.status, 422);

  // PATCH/DELETE on a non-existent id: past the auth gate, controller 404s.
  const update = await agent.patch('/api/blog/000000000000000000000000').set(csrf).send({ title: 'x' });
  assert.equal(update.status, 404);
  const del = await agent.delete('/api/blog/000000000000000000000000').set(csrf);
  assert.equal(del.status, 404);
});

test('an authenticated admin passes the authorization gate on every route (coupons)', async () => {
  const { agent, csrf } = await makeAdminAgent();

  const list = await agent.get('/api/coupons').set(csrf);
  assert.equal(list.status, 200);

  const create = await agent.post('/api/coupons').set(csrf).send({});
  assert.equal(create.status, 422);

  const update = await agent.patch('/api/coupons/000000000000000000000000').set(csrf).send({});
  assert.notEqual(update.status, 401);
  assert.notEqual(update.status, 403);

  const del = await agent.delete('/api/coupons/000000000000000000000000').set(csrf);
  assert.notEqual(del.status, 401);
  assert.notEqual(del.status, 403);
});

test('an authenticated admin passes the authorization gate on every route (reviews)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.patch('/api/reviews/000000000000000000000000/moderate').set(csrf).send({ status: 'approved' });
  assert.equal(res.status, 404); // past the gate, controller reports "not found"
});

test('an authenticated admin passes the authorization gate on every route (contact)', async () => {
  const { agent, csrf } = await makeAdminAgent();

  const list = await agent.get('/api/contact').set(csrf);
  assert.equal(list.status, 200);

  const update = await agent.patch('/api/contact/000000000000000000000000').set(csrf).send({ status: 'read' });
  assert.notEqual(update.status, 401);
  assert.notEqual(update.status, 403);
});
