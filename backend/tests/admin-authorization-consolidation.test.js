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
// tests/referral.test.js).
//
// AR-04 update: the last two admin reads on that stack (GET /api/coupons,
// GET /api/contact) are closed too, and adminOnly itself is gone. This file
// now confirms that every one of those paths answers 404, including to a
// role 'admin' account. The full AR-04 matrix (every closed read, and the
// MFA / IP / permission checks on their /api/v1/admin replacements) is in
// tests/admin-legacy-routes-ar04*.test.js.

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

// The admin READ routes the legacy stack used to serve (closed, AR-04).
const CLOSED_ADMIN_READ_ROUTES = [
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

test('the closed legacy admin read routes answer 404 to an anonymous caller', async () => {
  for (const [method, path] of CLOSED_ADMIN_READ_ROUTES) {
    const { agent, csrf } = await agentWithCsrf(app);
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404, got ${res.status}`);
  }
});

test('the closed legacy admin read routes answer 404 to a student', async () => {
  const { agent, csrf } = await makeStudentAgent();
  for (const [method, path] of CLOSED_ADMIN_READ_ROUTES) {
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404, got ${res.status}`);
  }
});

test('the closed legacy admin read routes answer 404 even to a role "admin" account (AR-04)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  for (const [method, path] of CLOSED_ADMIN_READ_ROUTES) {
    const res = await agent[method](path).set(csrf).send({});
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404, got ${res.status}`);
  }
});

test('every migrated mutation route no longer exists on the legacy router (404) — even for an authenticated admin', async () => {
  const { agent, csrf } = await makeAdminAgent();
  for (const [method, path, body] of MIGRATED_MUTATION_ROUTES) {
    const res = await agent[method](path).set(csrf).send(body);
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404 (migrated route), got ${res.status}`);
  }
});
