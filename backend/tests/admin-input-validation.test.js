import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Course from '../models/Course.js';
import ManualPayment from '../models/ManualPayment.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Production Polish Sprint — Medium findings:
// 1. Several hand-rolled admin sub-routes (userAdminController.js,
//    manualPaymentController.js) skipped the ObjectId.isValid(...) guard the
//    generic CRUD routes already have, so a malformed id/teacherId reached
//    Mongoose as an unhandled CastError (a 500, not a clean 400).
// 2. routes/v1/admin/coursesRoutes.js's allowedFilters referenced
//    `isPublished`/`language`, neither of which exist on the Course schema
//    (the real boolean field is `published`, and there is no language
//    field) — a filter that silently matched zero documents instead of
//    erroring.

const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';
const MALFORMED_ID = 'not-a-valid-object-id';

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

// ---------------------------------------------------------------------------
// ObjectId validation
// ---------------------------------------------------------------------------

test('PATCH /api/v1/admin/users/:id/role rejects a malformed id with 400, not a 500', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/users/${MALFORMED_ID}/role`).set({ ...csrf, Cookie: cookieHeader })
    .send({ role: 'student' });
  assert.equal(res.status, 400);
});

test('PATCH /api/v1/admin/users/:id/teacher rejects a malformed path id with 400', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/users/${MALFORMED_ID}/teacher`).set({ ...csrf, Cookie: cookieHeader })
    .send({ teacherId: '' });
  assert.equal(res.status, 400);
});

test('PATCH /api/v1/admin/users/:id/teacher rejects a malformed teacherId in the body with 400, even when the path id is valid', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await User.create({ name: 'Student', email: `s-${Date.now()}@example.com`, password: STUDENT_PASSWORD });

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/teacher`).set({ ...csrf, Cookie: cookieHeader })
    .send({ teacherId: MALFORMED_ID });
  assert.equal(res.status, 400);
});

test('PATCH /api/v1/admin/users/:id/family rejects a malformed id with 400', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/users/${MALFORMED_ID}/family`).set({ ...csrf, Cookie: cookieHeader })
    .send({ familyName: 'X' });
  assert.equal(res.status, 400);
});

test('PATCH /api/v1/admin/users/:id/subscription rejects a malformed id with 400 (checked after action validation)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/users/${MALFORMED_ID}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate' });
  assert.equal(res.status, 400);
});

test('PATCH /api/v1/admin/payments/manual/:id rejects a malformed id with 400, not a 500', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/payments/manual/${MALFORMED_ID}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });
  assert.equal(res.status, 400);
});

test('legitimate, well-formed ids for all five migrated sub-routes are unaffected by the new validation (regression check)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await User.create({ name: 'Student2', email: `s2-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const anotherStudent = await User.create({ name: 'Student3', email: `s3-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const teacher = await User.create({ name: 'Teacher', email: `t-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'teacher' });
  const payment = await ManualPayment.create({ plan: 'Starter', amount: 56, method: 'bank', customer: { email: 'x@example.com' }, status: 'pending' });

  const role = await agent.patch(`/api/v1/admin/users/${student._id}/role`).set({ ...csrf, Cookie: cookieHeader }).send({ role: 'parent' });
  assert.equal(role.status, 200);

  const assign = await agent.patch(`/api/v1/admin/users/${anotherStudent._id}/teacher`).set({ ...csrf, Cookie: cookieHeader }).send({ teacherId: teacher._id.toString() });
  assert.equal(assign.status, 200);

  const family = await agent.patch(`/api/v1/admin/users/${student._id}/family`).set({ ...csrf, Cookie: cookieHeader }).send({ familyName: 'Test Family' });
  assert.equal(family.status, 200);

  const subscription = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader }).send({ action: 'activate' });
  assert.equal(subscription.status, 200);

  const review = await agent.patch(`/api/v1/admin/payments/manual/${payment._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'rejected' });
  assert.equal(review.status, 200);
});

// ---------------------------------------------------------------------------
// Courses filter allowlist correction
// ---------------------------------------------------------------------------

test('GET /api/v1/admin/courses?published=true correctly filters on the real schema field', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Published Course', description: 'x', published: true });
  await Course.create({ title: 'Draft Course', description: 'x', published: false });

  const res = await agent.get('/api/v1/admin/courses?published=true').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].title, 'Published Course');
});

test('GET /api/v1/admin/courses?level=Beginner still filters correctly (unaffected by the allowlist fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Beginner Course', description: 'x', level: 'Beginner' });
  await Course.create({ title: 'Advanced Course', description: 'x', level: 'Advanced' });

  const res = await agent.get('/api/v1/admin/courses?level=Beginner').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].title, 'Beginner Course');
});

test('GET /api/v1/admin/courses?isPublished=true (the old, incorrect field name) is now silently ignored rather than matching zero documents', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Any Course', description: 'x', published: true });

  const res = await agent.get('/api/v1/admin/courses?isPublished=true').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1, 'an unrecognized filter key must be ignored, not silently match nothing');
});
