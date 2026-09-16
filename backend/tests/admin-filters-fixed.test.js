import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Auth hardening security batch — two dead admin-list filters, fixed:
//   1) GET /api/v1/admin/users?subscription.status=... / .plan= never worked
//      at all: sanitizeMongo.js (mounted globally on /api/v1/admin/*) strips
//      any dotted req.query KEY before crudController.js's allowedFilters
//      loop ever saw it. Now uses non-dotted wire params (subscriptionStatus/
//      subscriptionPlan) mapped internally to the real nested field.
//   2) GET /api/v1/admin/courses?isPublished=... matched a field that does
//      not exist on Course at all (real field is `published`), always
//      returning an empty result rather than filtering or being ignored.
//      `language` is removed outright — no such field exists on Course.

const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: 'Admin', email: `admin-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role: 'admin',
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

// ---------------------------------------------------------------------------
// 6a: users subscription filter
// ---------------------------------------------------------------------------

test('GET /api/v1/admin/users?subscriptionStatus= filters by subscription.status (the dead filter now works)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await User.create({ name: 'Active', email: `active-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { status: 'active' } });
  await User.create({ name: 'Inactive', email: `inactive-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { status: 'inactive' } });

  const res = await agent.get('/api/v1/admin/users?subscriptionStatus=active').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data.every((u) => u.subscription?.status === 'active'));
  assert.ok(!res.body.data.some((u) => u.name === 'Inactive'));
});

test('GET /api/v1/admin/users?subscriptionPlan= filters by subscription.plan', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await User.create({ name: 'Pro', email: `pro-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { plan: 'pro' } });
  await User.create({ name: 'Basic', email: `basic-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { plan: 'basic' } });

  const res = await agent.get('/api/v1/admin/users?subscriptionPlan=pro').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((u) => u.subscription?.plan === 'pro'));
  assert.ok(!res.body.data.some((u) => u.name === 'Basic'));
});

test('GET /api/v1/admin/users?role= (plain, non-dotted filter) still works unchanged — backward-compat regression guard', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await User.create({ name: 'A Teacher', email: `teach-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'teacher' });
  await User.create({ name: 'A Student', email: `stud-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student' });

  const res = await agent.get('/api/v1/admin/users?role=teacher').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((u) => u.role === 'teacher'));
});

test('GET /api/v1/admin/users?subscription.status= (the OLD dotted param) remains a harmless no-op, not resurrected', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await User.create({ name: 'Active', email: `active2-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { status: 'active' } });
  await User.create({ name: 'Inactive', email: `inactive2-${Date.now()}@example.com`, password: STUDENT_PASSWORD, role: 'student', subscription: { status: 'inactive' } });

  const res = await agent.get('/api/v1/admin/users').query({ 'subscription.status': 'active' }).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  // sanitizeMongo strips the dotted key before it ever reaches the filter —
  // both users are returned, proving the dotted form is ignored, not that it
  // silently filters incorrectly.
  assert.ok(res.body.data.some((u) => u.name === 'Active'));
  assert.ok(res.body.data.some((u) => u.name === 'Inactive'));
});

// ---------------------------------------------------------------------------
// 6b: courses published/level filter
// ---------------------------------------------------------------------------

test('GET /api/v1/admin/courses?published= filters correctly (isPublished used to silently match nothing)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Live Course', description: 'x', published: true });
  await Course.create({ title: 'Draft Course', description: 'x', published: false });

  const res = await agent.get('/api/v1/admin/courses?published=true').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data.every((c) => c.published === true));
  assert.ok(!res.body.data.some((c) => c.title === 'Draft Course'));
});

test('GET /api/v1/admin/courses?level= still filters correctly (unaffected regression guard)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Beginner Course', description: 'x', level: 'Beginner', published: true });
  await Course.create({ title: 'Advanced Course', description: 'x', level: 'Advanced', published: true });

  const res = await agent.get('/api/v1/admin/courses?level=Beginner').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((c) => c.level === 'Beginner'));
});

test('GET /api/v1/admin/courses?isPublished= (old broken param) is now a harmless no-op, not a false-empty result', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  await Course.create({ title: 'Any Course', description: 'x', published: true });

  const res = await agent.get('/api/v1/admin/courses?isPublished=true').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  // isPublished is no longer in allowedFilters at all — it's silently
  // dropped, so the unfiltered course list is returned instead of an
  // always-empty result.
  assert.ok(res.body.data.some((c) => c.title === 'Any Course'));
});
