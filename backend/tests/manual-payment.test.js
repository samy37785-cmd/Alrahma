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
// in granting a subscription / creating an invoice. Exactly one request wins
// the atomic pending-status claim (200); the loser gets 409, not a
// false-positive 200 — that 409 is itself the fix under test (see the
// approve-vs-reject and duplicate-reject tests below for the same guard
// exercised from the other angles).
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

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one concurrent approval must win (200); the other must get 409, not a false-positive 200');

  const invoices = await Invoice.find({ user: student._id });
  assert.equal(invoices.length, 1, 'concurrent double-approval must never create more than one invoice');

  const finalRecord = await ManualPayment.findById(record._id);
  assert.equal(finalRecord.status, 'approved');
});

// Regression coverage for the B3 fix: reject() previously had no atomic
// pending-status guard at all, unlike approve() — so it could silently
// overwrite an already-approved (enrolled + invoiced) record, and a race
// between an approve and a reject request (or two reject requests) could
// leave the DB and the emails sent to the student disagreeing about what
// actually happened.

test('reviewManualPayment: approve-vs-reject race — exactly one wins (200), the other gets 409, and the DB matches the winner', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('approve-reject-race@example.com');
  const record = await ManualPayment.create({
    plan: 'Standard', amount: 84, method: 'moneygram',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });

  const headers = { ...csrf, Cookie: cookieHeader };
  const [approve, reject] = await Promise.all([
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' }),
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'rejected' }),
  ]);

  const statuses = [approve.status, reject.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one of approve/reject must win the race; the other must get 409');

  const finalRecord = await ManualPayment.findById(record._id);
  const invoices = await Invoice.find({ user: student._id });
  const updatedUser = await User.findById(student._id);

  if (approve.status === 200) {
    assert.equal(finalRecord.status, 'approved');
    assert.equal(invoices.length, 1, 'the winning approval must still create exactly one invoice');
    assert.equal(updatedUser.subscription.status, 'active');
  } else {
    assert.equal(finalRecord.status, 'rejected');
    assert.equal(invoices.length, 0, 'a winning rejection must never leave an invoice behind');
    assert.equal(updatedUser.subscription?.status ?? 'inactive', 'inactive');
  }
});

test('reviewManualPayment: rejecting an already-approved record returns 409 and does not change its status', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('reject-after-approve@example.com');
  const record = await ManualPayment.create({
    plan: 'Standard', amount: 84, method: 'moneygram',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const headers = { ...csrf, Cookie: cookieHeader };

  const approve = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' });
  assert.equal(approve.status, 200);

  const lateReject = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers)
    .send({ status: 'rejected', adminNote: 'Too late — already approved' });
  assert.equal(lateReject.status, 409);

  const finalRecord = await ManualPayment.findById(record._id);
  assert.equal(finalRecord.status, 'approved', 'a rejection arriving after approval must not overwrite the approved status');
  assert.equal(finalRecord.adminNote, undefined, 'the rejected note must never be applied once the record is no longer pending');

  const invoices = await Invoice.find({ user: student._id });
  assert.equal(invoices.length, 1, 'the original approval invoice must be untouched');
});

test('reviewManualPayment: a duplicate reject attempt after a successful reject returns 409', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('duplicate-reject@example.com');
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 56, method: 'bank',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const headers = { ...csrf, Cookie: cookieHeader };

  const first = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers)
    .send({ status: 'rejected', adminNote: 'First rejection' });
  assert.equal(first.status, 200);

  const second = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers)
    .send({ status: 'rejected', adminNote: 'Second rejection attempt' });
  assert.equal(second.status, 409);

  const finalRecord = await ManualPayment.findById(record._id);
  assert.equal(finalRecord.status, 'rejected');
  assert.equal(finalRecord.adminNote, 'First rejection', 'the second, no-op reject attempt must not overwrite the admin note');
});

test('reviewManualPayment: two concurrent reject requests for the same record — exactly one wins (200), the other gets 409', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const student = await makeStudent('concurrent-reject@example.com');
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 56, method: 'bank',
    customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const headers = { ...csrf, Cookie: cookieHeader };

  const [first, second] = await Promise.all([
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'rejected' }),
    agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'rejected' }),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one concurrent rejection must win (200); the other must get 409');

  const finalRecord = await ManualPayment.findById(record._id);
  assert.equal(finalRecord.status, 'rejected');
});
