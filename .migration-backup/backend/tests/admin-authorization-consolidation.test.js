import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T11: blogRoutes.js, couponRoutes.js, reviewRoutes.js, and
// contactRoutes.js each used to define their own local, independently
// duplicated admin-check middleware (message: 'Admins only') instead of the
// shared adminOnly from middleware/auth.js (message: 'Admin access
// required'). This consolidated them onto the shared middleware.
//
// B1 migration update: the mutation routes this file originally covered
// (POST/PATCH/DELETE for blog, coupons, and contact; PATCH .../moderate for
// reviews) have since moved to /api/v1/admin/{blog,coupons,contact,reviews}
// (MFA + RBAC + audit-logged — see routes/v1/admin/). Their RBAC/401/403/
// audit coverage now lives in tests/admin-v1-content-migration.test.js
// (and, for coupons/referrals specifically, tests/coupon.test.js and
// tests/referral.test.js). This file now covers only what's still actually
// reachable on the legacy protect+adminOnly stack — the admin-only READ
// endpoints (GET /api/coupons, GET /api/contact) that were never part of
// the mutation migration — plus confirms every migrated mutation path is
// gone from the legacy router.

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

// Admin-gated READ routes still on the legacy protect+adminOnly stack.
const ADMIN_READ_ROUTES = [
  ['get', '/api/coupons', undefined],
  ['get', '/api/contact', undefined],
];

// Every mutation route this file used to cover, now migrated off the legacy
// router entirely (see the B1 migration note above).
const MIGRATED_MUTATION_ROUTES = [
  ['post',   '/api/blog',                {}],
  ['patch',  '/api/blog/000000000000000000000000', {}],
  ['delete', '/api/blog/000000000000000000000000', undefined],
  ['post',   '/api/coupons',             {}],
  ['patch',  '/api/coupons/000000000000000000000000', {}],
  ['delete', '/api/coupons/000000000000000000000000', undefined],
  ['patch',  '/api/reviews/000000000000000000000000/moderate', { status: 'approved' }],
  ['patch',  '/api/contact/000000000000000000000000', { status: 'read' }],
];

test('every remaining admin-gated legacy read route is rejected with 401 when unauthenticated', async () => {
  for (const [method, path] of ADMIN_READ_ROUTES) {
    const { agent, csrf } = await agentWithCsrf(app);
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} expected 401, got ${res.status}`);
  }
});

test('every remaining admin-gated legacy read route is rejected with 403 for an authenticated non-admin', async () => {
  const { agent, csrf } = await makeStudentAgent();
  for (const [method, path] of ADMIN_READ_ROUTES) {
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${path} expected 403, got ${res.status}`);
    assert.equal(res.body.message, 'Admin access required');
  }
});

test('an authenticated admin passes the authorization gate on every remaining legacy read route', async () => {
  const { agent, csrf } = await makeAdminAgent();

  const coupons = await agent.get('/api/coupons').set(csrf);
  assert.equal(coupons.status, 200);

  const contacts = await agent.get('/api/contact').set(csrf);
  assert.equal(contacts.status, 200);
});

test('every migrated mutation route no longer exists on the legacy router (404) — even for an authenticated admin', async () => {
  const { agent, csrf } = await makeAdminAgent();
  for (const [method, path, body] of MIGRATED_MUTATION_ROUTES) {
    const res = await agent[method](path).set(csrf).send(body);
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404 (migrated route), got ${res.status}`);
  }
});
