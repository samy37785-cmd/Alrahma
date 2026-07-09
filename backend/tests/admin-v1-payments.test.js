import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import ManualPayment from '../models/ManualPayment.js';
import SystemConfig from '../models/SystemConfig.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Security Sprint 2 -- SEC-3: migrates manual-payment review off the legacy
// /api/payments/manual/:id (protect+adminOnly, no MFA) onto the hardened
// /api/v1/admin/payments/manual/:id stack (verifyAccessToken + RBAC), with
// financialGuard wired at the route level -- not router-wide -- so listing/
// reading is never blocked while frozen, only the approve/reject mutation is,
// and the super-admin emergency override still works now that the route
// actually populates req.adminUser.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

async function makePendingPayment() {
  return ManualPayment.create({
    plan: 'Pro', amount: 49, currency: 'EUR', method: 'wu',
    customer: { name: 'Student', email: `student-${Date.now()}${Math.random()}@example.com` },
    reference: 'ABC123', status: 'pending',
  });
}

test('GET /api/v1/admin/payments/manual lists manual payments', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await makePendingPayment();

  const res = await agent.get('/api/v1/admin/payments/manual').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('PATCH /api/v1/admin/payments/manual/:id approves a payment', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const payment = await makePendingPayment();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
});

test('PATCH .../manual/:id is forbidden for a viewer (no payments:write)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('viewer');
  const payment = await makePendingPayment();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });
  assert.equal(res.status, 403);
});

test('financialGuard blocks approval for a regular admin while financials are frozen', async () => {
  await SystemConfig.set('financials_frozen', 'true');
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const payment = await makePendingPayment();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });

  assert.equal(res.status, 423);
  assert.equal(res.body.code, 'FINANCIALS_FROZEN');
});

test('financialGuard does not block the super-admin emergency override', async () => {
  await SystemConfig.set('financials_frozen', 'true');
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const payment = await makePendingPayment();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
});

test('financialGuard does not block reads while financials are frozen', async () => {
  await SystemConfig.set('financials_frozen', 'true');
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  await makePendingPayment();

  const res = await agent.get('/api/v1/admin/payments/manual').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
});

test('legacy /api/payments/manual admin routes no longer exist', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const list = await agent.get('/api/payments/manual').set(csrf);
  assert.equal(list.status, 404);

  const review = await agent.patch('/api/payments/manual/000000000000000000000000').set(csrf).send({ status: 'approved' });
  assert.equal(review.status, 404);
});

test('unauthenticated request to review a payment is rejected with 401', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const payment = await makePendingPayment();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set(csrf).send({ status: 'approved' });
  assert.equal(res.status, 401);
});
