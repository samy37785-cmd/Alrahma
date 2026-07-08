import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Security Sprint 1 — SEC-1 (mass-assignment on PUT /api/v1/admin/users/:id).
// crudController.js's generic update() does an unfiltered
// Object.assign(doc, body); usersRoutes.js previously passed no
// updateMiddleware, so any User field — including password, role,
// subscription, resetToken/resetTokenExpiry, tokenVersion, googleId, and
// referralCode — was directly settable by anyone holding users:write. The
// fix adds an explicit allowlist (USER_UPDATABLE_FIELDS in usersRoutes.js).
// These tests prove every sensitive field is now blocked, that legitimate
// profile fields still update, and that existing auth/authz is unaffected.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}@example.com`, password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

async function makeTargetUser(overrides = {}) {
  return User.create({
    name: 'Target User', email: `target-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'student', ...overrides,
  });
}

test('PUT /api/v1/admin/users/:id cannot set password (mass-assignment fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser();
  const originalHash = (await User.findById(target._id).select('+password')).password;

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ password: 'attacker-chosen-password' });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id).select('+password');
  assert.equal(after.password, originalHash, 'password hash must be unchanged');
});

test('PUT /api/v1/admin/users/:id cannot set role (privilege escalation fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser({ role: 'student' });

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ role: 'admin' });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id);
  assert.equal(after.role, 'student', 'role must not be settable via generic update');
});

test('PUT /api/v1/admin/users/:id cannot set subscription, tokenVersion, googleId, or referralCode', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser();
  const before = await User.findById(target._id).lean();

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({
      subscription: { plan: 'Pro', status: 'active', validUntil: new Date(Date.now() + 365 * 86400000) },
      tokenVersion: 999,
      googleId: 'attacker-linked-google-id',
      referralCode: 'HIJACKED1',
    });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id).lean();
  assert.equal(after.subscription.status, before.subscription.status, 'subscription must not be settable');
  assert.equal(after.tokenVersion, before.tokenVersion, 'tokenVersion must not be settable');
  assert.equal(after.googleId, before.googleId, 'googleId must not be settable');
  assert.equal(after.referralCode, before.referralCode, 'referralCode must not be settable');
});

test('PUT /api/v1/admin/users/:id cannot set resetToken or resetTokenExpiry (forged-reset-token bypass fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser();

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({
      resetToken: 'attacker-forged-hash',
      resetTokenExpiry: new Date(Date.now() + 3600_000),
    });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id).select('+resetToken +resetTokenExpiry');
  assert.equal(after.resetToken, undefined, 'resetToken must not be settable via generic update');
  assert.equal(after.resetTokenExpiry, undefined, 'resetTokenExpiry must not be settable via generic update');
});

test('PUT /api/v1/admin/users/:id still updates legitimate profile fields', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser({ bio: 'Original bio' });

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'Corrected Name', bio: 'Updated bio', specialization: 'Tajweed' });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id);
  assert.equal(after.name, 'Corrected Name');
  assert.equal(after.bio, 'Updated bio');
  assert.equal(after.specialization, 'Tajweed');
});

test('PUT /api/v1/admin/users/:id applies allowed fields even when sent alongside disallowed ones', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser();

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'Mixed Request', role: 'admin' });

  assert.equal(res.status, 200);
  const after = await User.findById(target._id);
  assert.equal(after.name, 'Mixed Request', 'legitimate field in the same request must still apply');
  assert.equal(after.role, 'student', 'disallowed field in the same request must still be blocked');
});

// --- Existing authentication/authorization must be unaffected ---

test('PUT /api/v1/admin/users/:id still rejects unauthenticated requests with 401', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const target = await makeTargetUser();

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set(csrf)
    .send({ name: 'Should not apply' });

  assert.equal(res.status, 401);
});

test('PUT /api/v1/admin/users/:id still rejects a role without users:write (viewer) with 403', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('viewer');
  const target = await makeTargetUser();

  const res = await agent
    .put(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'Should not apply' });

  assert.equal(res.status, 403);
});

test('GET /api/v1/admin/users/:id still works for an authorized admin (read path unaffected)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const target = await makeTargetUser();

  const res = await agent
    .get(`/api/v1/admin/users/${target._id}`)
    .set({ ...csrf, Cookie: cookieHeader });

  assert.equal(res.status, 200);
  assert.equal(res.body.email, target.email);
});
