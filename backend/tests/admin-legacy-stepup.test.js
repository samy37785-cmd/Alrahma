import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Security Sprint 1 — SEC-2 (legacy non-MFA admin path, routes/authRoutes.js),
// part 1 of 2 (split across two files to stay well under authLimiter's
// 20-requests/15min-per-IP budget, which is mounted on the whole /api/auth
// prefix — see app.js:149 — and therefore counts every request in this
// suite, not just logins).
//
// These 5 routes authenticate via the regular User JWT (protect + adminOnly),
// not the hardened AdminUser+MFA stack, so a stolen/replayed session cookie
// alone was previously sufficient to grant roles, mint admin accounts, or
// activate subscriptions. The interim fix (Stage 1) adds requireStepUp,
// which re-checks the caller's current password in the request body before
// any of the 5 mutating routes proceeds. This file covers: the step-up
// gate's core missing/wrong/correct-password behavior (via the role route),
// the subscription route, and adminCreateUser. Part 2 covers teacher,
// family, the unaffected read routes, and existing auth/authz.

const ADMIN_PASSWORD = 'Adm1n-Str0ng-Pass!';

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

async function makeTargetStudent() {
  return User.create({
    name: 'Target Student', email: `target${Date.now()}${Math.random()}@example.com`,
    password: 'Stud3nt-Str0ng-Pass!', role: 'student',
  });
}

test('PATCH /api/auth/users/:id/role: step-up gate rejects missing password (400), rejects wrong password (401), and passes with the correct password (200, existing behavior preserved)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const target = await makeTargetStudent();

  const missing = await agent.patch(`/api/auth/users/${target._id}/role`).set(csrf).send({ role: 'teacher' });
  assert.equal(missing.status, 400);

  const wrong = await agent.patch(`/api/auth/users/${target._id}/role`).set(csrf)
    .send({ role: 'teacher', currentPassword: 'totally-wrong-password' });
  assert.equal(wrong.status, 401);

  const stillUnchanged = await User.findById(target._id);
  assert.equal(stillUnchanged.role, 'student', 'role must not change without a valid step-up');

  const correct = await agent.patch(`/api/auth/users/${target._id}/role`).set(csrf)
    .send({ role: 'teacher', currentPassword: ADMIN_PASSWORD });
  assert.equal(correct.status, 200);
  assert.equal(correct.body.role, 'teacher');
  const updated = await User.findById(target._id);
  assert.equal(updated.role, 'teacher');
});

test('PATCH /api/auth/users/:id/subscription requires step-up, and succeeds with it', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const target = await makeTargetStudent();

  const denied = await agent.patch(`/api/auth/users/${target._id}/subscription`).set(csrf)
    .send({ action: 'activate', plan: 'Pro' });
  assert.equal(denied.status, 400);

  const allowed = await agent.patch(`/api/auth/users/${target._id}/subscription`).set(csrf)
    .send({ action: 'activate', plan: 'Pro', currentPassword: ADMIN_PASSWORD });
  assert.equal(allowed.status, 200);
  const updated = await User.findById(target._id);
  assert.equal(updated.subscription.status, 'active');
});

test('POST /api/auth/users (adminCreateUser) requires step-up, and succeeds with it', async () => {
  const { agent, csrf } = await makeAdminAgent();

  const denied = await agent.post('/api/auth/users').set(csrf)
    .send({ name: 'New Teacher', email: `new-teacher-${Date.now()}@example.com`, password: 'Stud3nt-Str0ng-Pass!', role: 'teacher' });
  assert.equal(denied.status, 400);

  const email = `new-teacher-${Date.now()}@example.com`;
  const allowed = await agent.post('/api/auth/users').set(csrf)
    .send({ name: 'New Teacher', email, password: 'Stud3nt-Str0ng-Pass!', role: 'teacher', currentPassword: ADMIN_PASSWORD });
  assert.equal(allowed.status, 201);
  const created = await User.findOne({ email });
  assert.ok(created, 'user must be created once step-up is satisfied');
});
