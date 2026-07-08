import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Security Sprint 1 — SEC-2 (legacy non-MFA admin path, routes/authRoutes.js),
// part 2 of 2 — see admin-legacy-stepup.test.js for context and the
// authLimiter budget rationale for the file split. This file covers the
// remaining two mutating routes (teacher, family), confirms the read-only
// routes are unaffected, and confirms existing authentication/authorization
// (401/403) still work exactly as before requireStepUp was added.

const ADMIN_PASSWORD = 'Adm1n-Str0ng-Pass!';
const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeAdminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `admin${Date.now()}${Math.random()}@example.com`;
  await User.create({ name: 'Admin', email, password: ADMIN_PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

async function makeStudentAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student${Date.now()}${Math.random()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: STUDENT_PASSWORD });
  return { agent, csrf };
}

async function makeTargetStudent() {
  return User.create({
    name: 'Target Student', email: `target${Date.now()}${Math.random()}@example.com`,
    password: STUDENT_PASSWORD, role: 'student',
  });
}

test('PATCH /api/auth/users/:id/teacher requires step-up, and succeeds with it', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const student = await makeTargetStudent();
  const teacher = await User.create({
    name: 'Teacher', email: `teacher${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'teacher',
  });

  const denied = await agent.patch(`/api/auth/users/${student._id}/teacher`).set(csrf)
    .send({ teacherId: teacher._id.toString() });
  assert.equal(denied.status, 400);

  const allowed = await agent.patch(`/api/auth/users/${student._id}/teacher`).set(csrf)
    .send({ teacherId: teacher._id.toString(), currentPassword: ADMIN_PASSWORD });
  assert.equal(allowed.status, 200);
  const updated = await User.findById(student._id);
  assert.equal(String(updated.teacher), String(teacher._id));
});

test('PATCH /api/auth/users/:id/family requires step-up, and succeeds with it', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const target = await makeTargetStudent();

  const denied = await agent.patch(`/api/auth/users/${target._id}/family`).set(csrf)
    .send({ familyName: "Ammar's family" });
  assert.equal(denied.status, 400);

  const allowed = await agent.patch(`/api/auth/users/${target._id}/family`).set(csrf)
    .send({ familyName: "Ammar's family", currentPassword: ADMIN_PASSWORD });
  assert.equal(allowed.status, 200);
  const updated = await User.findById(target._id);
  assert.equal(updated.familyName, "Ammar's family");
});

test('GET /api/auth/users does not require step-up (read routes unaffected)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const res = await agent.get('/api/auth/users').set(csrf);
  assert.equal(res.status, 200);
});

test('legacy admin mutating routes still reject an unauthenticated request with 401 (existing authentication unaffected)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch('/api/auth/users/000000000000000000000000/role').set(csrf)
    .send({ role: 'admin', currentPassword: 'irrelevant' });
  assert.equal(res.status, 401);
});

test('legacy admin mutating routes still reject an authenticated non-admin with 403 (existing authorization unaffected, step-up never reached)', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.patch('/api/auth/users/000000000000000000000000/role').set(csrf)
    .send({ role: 'admin', currentPassword: STUDENT_PASSWORD });
  assert.equal(res.status, 403);
});
