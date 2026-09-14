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
// Auth hardening security batch update: GET /api/coupons and GET
// /api/contact (this file's own "admin-gated READ routes still on the
// legacy stack") have themselves now been migrated too — reachable with
// nothing but a regular User session whose `role` field said 'admin' was
// exactly the defect this batch closes. They are now on
// /api/v1/admin/{coupons,contact} (see tests/auth-hardening-security-
// batch.test.js for their new RBAC/401/403 coverage). This file now covers
// only that EVERY one of these routes — reads included — is gone from the
// legacy protect+adminOnly router, for any caller, including an
// authenticated legacy admin.

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

// Every route this file used to cover, now migrated off the legacy router
// entirely (see the B1 / auth-hardening-security-batch migration notes
// above) — mutations from the original B1 pass, plus the two admin reads
// (GET /api/coupons, GET /api/contact) closed by the auth hardening batch.
const MIGRATED_ROUTES = [
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

test('every migrated route no longer exists on the legacy router (404) — for an unauthenticated caller, a regular non-admin, and an authenticated legacy admin alike', async () => {
  const agents = [
    (await agentWithCsrf(app)),
    await makeStudentAgent(),
    await makeAdminAgent(),
  ];
  for (const { agent, csrf } of agents) {
    for (const [method, path, body] of MIGRATED_ROUTES) {
      const res = await agent[method](path).set(csrf).send(body);
      assert.equal(res.status, 404, `${method.toUpperCase()} ${path} expected 404 (migrated route), got ${res.status}`);
    }
  }
});
