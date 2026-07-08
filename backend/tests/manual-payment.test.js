import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import ManualPayment from '../models/ManualPayment.js';
import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Integration coverage for the manual/offline payment flow
// (controllers/manualPaymentController.js) — the code path that approves
// bank-transfer/Western Union/MoneyGram/Payoneer payments and, on approval,
// grants a paid subscription + generates an invoice.
//
// Admin review (listManualPayments/reviewManualPayment) moved from the
// legacy /api/payments/manual* (protect+adminOnly) to the hardened
// /api/v1/admin/payments/manual* stack as part of Security Sprint 2 (SEC-3)
// — see routes/v1/admin/paymentsRoutes.js. submitManualPayment stays public
// and untouched. Tests the real controller/model/service code (no
// reimplemented logic).

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeAdminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

async function makeStudent(email) {
  return User.create({ name: 'Student', email, password: PASSWORD });
}

// ---------------------------------------------------------------------------
// submitManualPayment — validation + success (student-facing, public route)
// ---------------------------------------------------------------------------

test('submitManualPayment: rejects an unknown plan with 400', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/payments/manual')
    .set(csrf)
    .send({ plan: 'NotAPlan', method: 'bank', customer: { email: 'x@example.com', name: 'X' } });

  assert.equal(res.status, 400);
});

test('submitManualPayment: rejects a request missing the required "method" field with 400', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/payments/manual')
    .set(csrf)
    .send({ plan: 'Starter', customer: { email: 'x@example.com', name: 'X' } });

  assert.equal(res.status, 400);
});

test('submitManualPayment: creates a pending record priced from the server-side plan config, ignoring any client-supplied amount', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const plan = getPlan('Standard');

  const res = await agent
    .post('/api/payments/manual')
    .set(csrf)
    // Tampered amount/currency in the request body must be ignored — the
    // server must always price from config/plans.js.
    .send({
      plan: 'Standard',
      method: 'bank',
      amount: 1,
      currency: 'USD',
      customer: { email: 'buyer@example.com', name: 'Buyer' },
      reference: 'REF123',
    });

  assert.equal(res.status, 201);
  assert.ok(res.body.id);

  const record = await ManualPayment.findById(res.body.id);
  assert.equal(record.status, 'pending');
  assert.equal(record.amount, plan.amount);
  assert.equal(record.currency, plan.currency);
  assert.equal(record.reference, 'REF123');
});

// ---------------------------------------------------------------------------
// listManualPayments — authorization (MFA-protected admin API)
// ---------------------------------------------------------------------------

test('listManualPayments: unauthenticated request is rejected with 401', async () => {
  const res = await request(app).get('/api/v1/admin/payments/manual');
  assert.equal(res.status, 401);
});

test('listManualPayments: an authenticated admin without payments:read is rejected with 403', async () => {
  // 'editor' has courses:read/write and enrollments:read only — no
  // payments:read (see ROLE_PERMISSIONS in models/AdminUser.js).
  const { agent, csrf, cookieHeader } = await makeAdminAgent('editor');
  const res = await agent.get('/api/v1/admin/payments/manual').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 403);
});

test('listManualPayments: an admin receives the paginated envelope', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  await ManualPayment.create({ plan: 'Starter', amount: 56, method: 'bank', customer: { email: 'a@example.com' }, status: 'pending' });
  await ManualPayment.create({ plan: 'Starter', amount: 56, method: 'bank', customer: { email: 'b@example.com' }, status: 'pending' });

  const res = await agent.get('/api/v1/admin/payments/manual').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.data.length, 2);
});

// ---------------------------------------------------------------------------
// reviewManualPayment — authorization, validation, success (approve/reject),
// atomicity under concurrent approval, and database consistency
// ---------------------------------------------------------------------------

test('reviewManualPayment: unauthenticated request is rejected with 401', async () => {
  const record = await ManualPayment.create({ plan: 'Starter', amount: 56, method: 'bank', customer: { email: 'a@example.com' }, status: 'pending' });
  // A valid CSRF token/cookie pair is supplied (but no admin_at cookie), so
  // this isolates the auth check itself rather than being rejected earlier
  // by the globally-mounted CSRF middleware.
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(csrf).send({ status: 'approved' });
  assert.equal(res.status, 401);
});

test('reviewManualPayment: rejects an invalid status value with 400', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const record = await ManualPayment.create({ plan: 'Starter', amount: 56, method: 'bank', customer: { email: 'a@example.com' }, status: 'pending' });

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'not-a-real-status' });
  assert.equal(res.status, 400);
});

test('reviewManualPayment: returns 404 for a non-existent record', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const res = await agent.patch('/api/v1/admin/payments/manual/000000000000000000000000').set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 404);
});

test('reviewManualPayment: approving grants the subscription and creates exactly one paid invoice', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('approve-me@example.com');
  const plan = getPlan('Premium');
  const record = await ManualPayment.create({
    plan: 'Premium', amount: plan.amount, method: 'wu',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved', adminNote: 'Verified via WU MTCN' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');

  const updatedUser = await User.findById(student._id);
  assert.equal(updatedUser.subscription.status, 'active');
  assert.equal(updatedUser.subscription.plan, 'Premium');

  const invoices = await Invoice.find({ user: student._id });
  assert.equal(invoices.length, 1, 'exactly one invoice must be created for one approval');
  assert.equal(invoices[0].amount, plan.amount);
  assert.equal(invoices[0].status, 'paid');
});

test('reviewManualPayment: rejecting does not grant a subscription or create an invoice', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('reject-me@example.com');
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 56, method: 'bank',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'rejected', adminNote: 'Reference not found' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'rejected');

  const updatedUser = await User.findById(student._id);
  assert.equal(updatedUser.subscription?.status ?? 'inactive', 'inactive');

  const invoices = await Invoice.find({ user: student._id });
  assert.equal(invoices.length, 0);
});

// Verifies the atomic-claim guarantee documented in the controller: two
// concurrent approval requests for the same record must never both succeed
// in granting a subscription / creating an invoice. This is the realistic
// failure mode this code actually defends against (a double-click or two
// admins racing), and is the strongest available proxy for "transaction
// rollback" / "database consistency" here — there is no other code path
// in reviewManualPayment that can genuinely fail mid-transaction without
// mocking internals, which would test synthetic behavior rather than the
// real implementation.
test('reviewManualPayment: two concurrent approvals of the same record never double-enroll or double-invoice', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('race-me@example.com');
  const record = await ManualPayment.create({
    plan: 'Standard', amount: 84, method: 'moneygram',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });

  const headers = { ...csrf, Cookie: cookieHeader };
  const [first, second] = await Promise.all([
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' }),
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' }),
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const invoices = await Invoice.find({ user: student._id });
  assert.equal(invoices.length, 1, 'concurrent double-approval must never create more than one invoice');

  const finalRecord = await ManualPayment.findById(record._id);
  assert.equal(finalRecord.status, 'approved');
});
