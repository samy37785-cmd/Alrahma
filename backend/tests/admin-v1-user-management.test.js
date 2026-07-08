import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Security Sprint 2 -- SEC-2 Stage 2: migrates the create/role/subscription/
// teacher/family mutations off the legacy non-MFA /api/auth/users* path onto
// the hardened /api/v1/admin/users* stack (verifyAccessToken + RBAC +
// auditFromReq — see routes/v1/admin/usersRoutes.js and
// controllers/userAdminController.js). Business logic is unchanged from the
// legacy controller; these tests confirm it still behaves the same, just
// reachable only through the MFA-protected route now, and that the old
// routes are gone.

const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';

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

async function makeUser(overrides = {}) {
  return User.create({
    name: 'Target User', email: `target-${Date.now()}${Math.random()}@example.com`,
    password: STUDENT_PASSWORD, role: 'student', ...overrides,
  });
}

test('POST /api/v1/admin/users creates a teacher account', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const email = `new-teacher-${Date.now()}@example.com`;

  const res = await agent.post('/api/v1/admin/users').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'New Teacher', email, password: STUDENT_PASSWORD, role: 'teacher' });

  assert.equal(res.status, 201);
  const created = await User.findOne({ email });
  assert.ok(created, 'user must be created');
  assert.equal(created.role, 'teacher');
});

test('POST /api/v1/admin/users rejects an invalid role', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.post('/api/v1/admin/users').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'X', email: `x-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'superuser' });
  assert.equal(res.status, 400);
});

test('POST /api/v1/admin/users is forbidden for a viewer (no users:write)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('viewer');
  const res = await agent.post('/api/v1/admin/users').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'X', email: `x2-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'teacher' });
  assert.equal(res.status, 403);
});

test('PATCH /api/v1/admin/users/:id/role changes role and unassigns former students when a teacher is demoted', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const teacher = await makeUser({ role: 'teacher', email: `teacher-${Date.now()}@example.com` });
  const student = await makeUser({ teacher: teacher._id });

  const res = await agent.patch(`/api/v1/admin/users/${teacher._id}/role`).set({ ...csrf, Cookie: cookieHeader })
    .send({ role: 'student' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'student');

  const updatedStudent = await User.findById(student._id);
  assert.equal(updatedStudent.teacher, null, 'students must be unassigned when their teacher role is revoked');
});

test('PATCH /api/v1/admin/users/:id/subscription activates a subscription', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUser();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Pro' });

  assert.equal(res.status, 200);
  assert.equal(res.body.subscription.status, 'active');
  assert.equal(res.body.subscription.plan, 'Pro');
});

test('PATCH /api/v1/admin/users/:id/teacher assigns a teacher and rejects a non-teacher target', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUser();
  const teacher = await makeUser({ role: 'teacher', email: `teacher2-${Date.now()}@example.com` });
  const notATeacher = await makeUser({ email: `nope-${Date.now()}@example.com` });

  const bad = await agent.patch(`/api/v1/admin/users/${student._id}/teacher`).set({ ...csrf, Cookie: cookieHeader })
    .send({ teacherId: notATeacher._id.toString() });
  assert.equal(bad.status, 400);

  const good = await agent.patch(`/api/v1/admin/users/${student._id}/teacher`).set({ ...csrf, Cookie: cookieHeader })
    .send({ teacherId: teacher._id.toString() });
  assert.equal(good.status, 200);
  const updated = await User.findById(student._id);
  assert.equal(String(updated.teacher), String(teacher._id));
});

test('PATCH /api/v1/admin/users/:id/family sets the family name', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUser();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/family`).set({ ...csrf, Cookie: cookieHeader })
    .send({ familyName: "Ammar's family" });

  assert.equal(res.status, 200);
  assert.equal(res.body.familyName, "Ammar's family");
});

test('GET /api/v1/admin/users/teachers lists only teachers', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await makeUser({ role: 'teacher', email: `t1-${Date.now()}@example.com` });
  await makeUser();

  const res = await agent.get('/api/v1/admin/users/teachers').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
});

test('GET /api/v1/admin/users returns the populated teacher field', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const teacher = await makeUser({ role: 'teacher', email: `t2-${Date.now()}@example.com` });
  await makeUser({ teacher: teacher._id });

  const res = await agent.get('/api/v1/admin/users').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  const found = res.body.data.find((u) => u.teacher);
  assert.ok(found, 'expected at least one user with a populated teacher');
  assert.equal(found.teacher.email, teacher.email);
});

test('mutating routes reject an unauthenticated request with 401', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch('/api/v1/admin/users/000000000000000000000000/role').set(csrf).send({ role: 'admin' });
  assert.equal(res.status, 401);
});

test('legacy /api/auth/users* admin routes no longer exist (404)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const read = await agent.get('/api/auth/users').set(csrf);
  assert.equal(read.status, 404);

  const write = await agent.patch('/api/auth/users/000000000000000000000000/role').set(csrf).send({ role: 'admin' });
  assert.equal(write.status, 404);
});
