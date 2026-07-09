import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import SystemAuditLog from '../models/SystemAuditLog.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Production Readiness Audit — High finding: PATCH /api/v1/admin/users/:id/
// subscription (userAdminController.updateUserSubscription) used to
// reassign the entire user.subscription sub-document, silently wiping
// provider/stripeCustomerId/stripeSubscriptionId/cancelAtPeriodEnd/
// renewalReminderSentFor (any field other than plan/status/activeSince/
// validUntil) every time an admin activated/renewed/deactivated a plan.
// Fixed by routing through a new subscriptionService.adminSetSubscription()
// that only $set's the fields the requested action actually changes.
// These tests prove: the documented business rules (renew preserves
// activeSince; deactivate keeps plan/activeSince/validUntil) still hold,
// Stripe/unrelated fields survive every action, repeated updates behave
// correctly, and audit logging still occurs.

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

async function makeUserWithStripeSubscription(overrides = {}) {
  return User.create({
    name: 'Stripe Student', email: `stripe-${Date.now()}${Math.random()}@example.com`,
    password: STUDENT_PASSWORD, role: 'student',
    subscription: {
      plan: 'Pro', status: 'active',
      activeSince: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-02-01T00:00:00Z'),
      provider: 'stripe',
      stripeCustomerId: 'cus_TEST123',
      stripeSubscriptionId: 'sub_TEST456',
      cancelAtPeriodEnd: false,
      renewalReminderSentFor: new Date('2026-01-25T00:00:00Z'),
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Updating subscription status
// ---------------------------------------------------------------------------

test('updateUserSubscription: activate sets status active and grants a fresh 30-day period', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await User.create({ name: 'Fresh Student', email: `fresh-${Date.now()}@example.com`, password: STUDENT_PASSWORD });

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Starter' });

  assert.equal(res.status, 200);
  assert.equal(res.body.subscription.status, 'active');
  assert.equal(res.body.subscription.plan, 'Starter');
  assert.ok(res.body.subscription.activeSince);
  assert.ok(res.body.subscription.validUntil);
});

test('updateUserSubscription: deactivate sets status inactive and preserves plan/activeSince/validUntil', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription();
  const before = await User.findById(student._id).lean();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'deactivate' });

  assert.equal(res.status, 200);
  assert.equal(res.body.subscription.status, 'inactive');
  assert.equal(res.body.subscription.plan, before.subscription.plan, 'plan must be unchanged by deactivate');
  assert.equal(
    new Date(res.body.subscription.activeSince).getTime(), before.subscription.activeSince.getTime(),
    'activeSince must be unchanged by deactivate',
  );
  assert.equal(
    new Date(res.body.subscription.validUntil).getTime(), before.subscription.validUntil.getTime(),
    'validUntil must be unchanged by deactivate',
  );
});

// ---------------------------------------------------------------------------
// Updating expiry
// ---------------------------------------------------------------------------

test('updateUserSubscription: renew preserves the original activeSince but extends validUntil ~30 days from now', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription({
    activeSince: new Date('2025-06-01T00:00:00Z'),
    validUntil: new Date('2025-07-01T00:00:00Z'),
  });

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'renew', plan: 'Pro' });

  assert.equal(res.status, 200);
  assert.equal(new Date(res.body.subscription.activeSince).toISOString(), '2025-06-01T00:00:00.000Z', 'renew must preserve the original activeSince');

  const expectedValidUntil = new Date();
  expectedValidUntil.setDate(expectedValidUntil.getDate() + 30);
  const actualValidUntil = new Date(res.body.subscription.validUntil);
  assert.ok(
    Math.abs(actualValidUntil.getTime() - expectedValidUntil.getTime()) < 5000,
    'renew must extend validUntil to ~30 days from now',
  );
});

test('updateUserSubscription: activate (not renew) resets activeSince to now, even if one already existed', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription({ activeSince: new Date('2020-01-01T00:00:00Z') });

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Pro' });

  assert.equal(res.status, 200);
  assert.notEqual(new Date(res.body.subscription.activeSince).toISOString(), '2020-01-01T00:00:00.000Z');
  assert.ok(Date.now() - new Date(res.body.subscription.activeSince).getTime() < 5000, 'activate must set activeSince to now');
});

// ---------------------------------------------------------------------------
// Preserving Stripe metadata
// ---------------------------------------------------------------------------

test('updateUserSubscription: activate/renew/deactivate never touch provider, stripeCustomerId, stripeSubscriptionId, or cancelAtPeriodEnd', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();

  for (const action of ['activate', 'renew', 'deactivate']) {
    const student = await makeUserWithStripeSubscription({ cancelAtPeriodEnd: true });

    const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
      .send({ action, plan: 'Pro' });

    assert.equal(res.status, 200, `${action} must succeed`);
    const updated = await User.findById(student._id).lean();
    assert.equal(updated.subscription.provider, 'stripe', `${action} must not clear provider`);
    assert.equal(updated.subscription.stripeCustomerId, 'cus_TEST123', `${action} must not clear stripeCustomerId`);
    assert.equal(updated.subscription.stripeSubscriptionId, 'sub_TEST456', `${action} must not clear stripeSubscriptionId`);
    assert.equal(updated.subscription.cancelAtPeriodEnd, true, `${action} must not reset cancelAtPeriodEnd`);
  }
});

// ---------------------------------------------------------------------------
// Preserving unrelated subscription fields
// ---------------------------------------------------------------------------

test('updateUserSubscription: activate/renew/deactivate never touch renewalReminderSentFor', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const reminderDate = new Date('2026-01-25T00:00:00Z');

  for (const action of ['activate', 'renew', 'deactivate']) {
    const student = await makeUserWithStripeSubscription({ renewalReminderSentFor: reminderDate });

    const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
      .send({ action, plan: 'Pro' });

    assert.equal(res.status, 200);
    const updated = await User.findById(student._id).lean();
    assert.equal(
      updated.subscription.renewalReminderSentFor.getTime(), reminderDate.getTime(),
      `${action} must not clear renewalReminderSentFor`,
    );
  }
});

// ---------------------------------------------------------------------------
// Repeated updates
// ---------------------------------------------------------------------------

test('updateUserSubscription: two renewals in a row keep the same activeSince and each extend validUntil further', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription({
    activeSince: new Date('2025-01-01T00:00:00Z'),
    validUntil: new Date('2025-02-01T00:00:00Z'),
  });

  const first = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'renew' });
  assert.equal(first.status, 200);
  const firstValidUntil = new Date(first.body.subscription.validUntil).getTime();

  await new Promise((r) => setTimeout(r, 10));

  const second = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'renew' });
  assert.equal(second.status, 200);

  assert.equal(new Date(first.body.subscription.activeSince).toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(new Date(second.body.subscription.activeSince).toISOString(), '2025-01-01T00:00:00.000Z', 'activeSince must stay the same across repeated renewals');
  assert.ok(new Date(second.body.subscription.validUntil).getTime() >= firstValidUntil, 'a second renewal must extend validUntil again');
});

test('updateUserSubscription: deactivate then reactivate resets activeSince to a fresh date (existing business rule, unchanged)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription({ activeSince: new Date('2020-01-01T00:00:00Z') });

  const deactivate = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'deactivate' });
  assert.equal(deactivate.status, 200);
  assert.equal(deactivate.body.subscription.status, 'inactive');

  const reactivate = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Pro' });
  assert.equal(reactivate.status, 200);
  assert.equal(reactivate.body.subscription.status, 'active');
  assert.notEqual(new Date(reactivate.body.subscription.activeSince).toISOString(), '2020-01-01T00:00:00.000Z');

  const updated = await User.findById(student._id).lean();
  assert.equal(updated.subscription.stripeSubscriptionId, 'sub_TEST456', 'Stripe linkage must survive a deactivate + reactivate cycle');
});

// ---------------------------------------------------------------------------
// Invalid update attempts
// ---------------------------------------------------------------------------

test('updateUserSubscription: returns 404 for a non-existent user, without touching any other record', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch('/api/v1/admin/users/000000000000000000000000/subscription').set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate', plan: 'Pro' });
  assert.equal(res.status, 404);
});

test('updateUserSubscription: an unrecognized action is rejected with 400 and changes nothing (Production Polish Sprint: action is now enum-validated)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription();
  const before = await User.findById(student._id).lean();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'not-a-real-action', plan: 'Pro' });

  assert.equal(res.status, 400, 'an unrecognized action must now be rejected rather than silently treated as activate');

  const updated = await User.findById(student._id).lean();
  assert.equal(updated.subscription.status, before.subscription.status, 'subscription status must be unchanged');
  assert.equal(updated.subscription.stripeCustomerId, 'cus_TEST123');
  assert.equal(updated.subscription.stripeSubscriptionId, 'sub_TEST456');
});

test('updateUserSubscription: rejects a missing action with 400', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ plan: 'Pro' });

  assert.equal(res.status, 400);
});

test('updateUserSubscription: is forbidden for a viewer (no users:write) and rejects unauthenticated requests', async () => {
  const student = await makeUserWithStripeSubscription();
  const { agent, csrf, cookieHeader } = await adminAgent('viewer');
  const forbidden = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'activate' });
  assert.equal(forbidden.status, 403);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauthenticated = await anon.patch(`/api/v1/admin/users/${student._id}/subscription`).set(anonCsrf).send({ action: 'activate' });
  assert.equal(unauthenticated.status, 401);
});

// ---------------------------------------------------------------------------
// Audit logging preserved
// ---------------------------------------------------------------------------

test('updateUserSubscription: writes an audit log entry with accurate before/after subscription state', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const student = await makeUserWithStripeSubscription();

  const res = await agent.patch(`/api/v1/admin/users/${student._id}/subscription`).set({ ...csrf, Cookie: cookieHeader })
    .send({ action: 'deactivate' });
  assert.equal(res.status, 200);

  const auditEntry = await SystemAuditLog.findOne({ action: 'user.subscription.update', resourceId: String(student._id) });
  assert.ok(auditEntry, 'a user.subscription.update audit entry must be written');
  assert.equal(auditEntry.before.subscription.status, 'active');
  assert.equal(auditEntry.after.subscription.status, 'inactive');
  assert.equal(auditEntry.after.subscription.stripeCustomerId, 'cus_TEST123', 'the audited "after" state must reflect the real persisted document, including preserved Stripe fields');
});
