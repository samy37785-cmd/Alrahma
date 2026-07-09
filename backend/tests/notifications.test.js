import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import ManualPayment from '../models/ManualPayment.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import { createNotification } from '../controllers/notificationController.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Feature Sprint 1 — the Notification model/read-API (controllers/
// notificationController.js, routes/notificationRoutes.js) already existed
// but createNotification() was never called anywhere: no business event in
// the app produced a single Notification row. This file covers (a) the
// pre-existing read/mark-read API, which had no test file at all, and (b)
// every new createNotification() call site wired into real business events
// in this sprint (manual/PayPal payments, live classes, certificates,
// messages, review moderation, the renewal-reminder cron).

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeUserAgent(overrides = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `user-${Date.now()}-${Math.random()}@example.com`;
  const user = await User.create({ name: 'Test User', email, password: PASSWORD, ...overrides });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf, user };
}

async function makeAdminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

// ---------------------------------------------------------------------------
// createNotification() helper
// ---------------------------------------------------------------------------

test('createNotification: creates a notification for a real recipient', async () => {
  const user = await User.create({ name: 'Recipient', email: 'recipient1@example.com', password: PASSWORD });
  const created = await createNotification({
    recipient: user._id, type: 'admin_announcement', title: 'Hello', body: 'World', link: '/dashboard',
  });
  assert.ok(created);
  const stored = await Notification.findById(created._id);
  assert.equal(String(stored.recipient), String(user._id));
  assert.equal(stored.read, false);
});

test('createNotification: no-ops (does not throw, does not write) when recipient is missing', async () => {
  const result = await createNotification({
    recipient: null, type: 'payment_received', title: 'x', body: 'y',
  });
  assert.equal(result, null);
  assert.equal(await Notification.countDocuments(), 0);
});

// ---------------------------------------------------------------------------
// Read API: getMyNotifications / getUnreadCount / markRead / markAllRead / delete
// ---------------------------------------------------------------------------

test('getMyNotifications: returns only the caller\'s own notifications, newest first, with pagination + unread totals', async () => {
  const { agent, user } = await makeUserAgent();
  const other = await User.create({ name: 'Other', email: 'other1@example.com', password: PASSWORD });

  await createNotification({ recipient: other._id, type: 'admin_announcement', title: 'Not mine', body: 'x' });
  await Promise.all([0, 1, 2].map((i) =>
    createNotification({ recipient: user._id, type: 'admin_announcement', title: `Mine ${i}`, body: 'x' })));

  const res = await agent.get('/api/notifications');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.unreadCount, 3);
  assert.equal(res.body.notifications.length, 3);
  assert.ok(res.body.notifications.every((n) => n.title.startsWith('Mine')));
});

test('getMyNotifications: ?unread=true filters to unread only', async () => {
  const { agent, user } = await makeUserAgent();
  const n1 = await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'A', body: 'x' });
  await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'B', body: 'x' });
  await Notification.updateOne({ _id: n1._id }, { read: true });

  const res = await agent.get('/api/notifications?unread=true');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.notifications[0].title, 'B');
});

test('getUnreadCount: reflects only the caller\'s unread notifications', async () => {
  const { agent, user } = await makeUserAgent();
  await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'A', body: 'x' });
  await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'B', body: 'x' });

  const res = await agent.get('/api/notifications/unread');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
});

test('markRead: marks the caller\'s own notification as read and rejects marking another user\'s', async () => {
  const { agent, csrf, user } = await makeUserAgent();
  const other = await User.create({ name: 'Other2', email: 'other2@example.com', password: PASSWORD });

  const mine  = await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'Mine', body: 'x' });
  const theirs = await createNotification({ recipient: other._id, type: 'admin_announcement', title: 'Theirs', body: 'x' });

  const ok = await agent.patch(`/api/notifications/${mine._id}/read`).set(csrf);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.notification.read, true);

  const forbidden = await agent.patch(`/api/notifications/${theirs._id}/read`).set(csrf);
  assert.equal(forbidden.status, 404);
  assert.equal((await Notification.findById(theirs._id)).read, false);
});

test('markAllRead: marks every one of the caller\'s unread notifications as read, leaving other users\' untouched', async () => {
  const { agent, csrf, user } = await makeUserAgent();
  const other = await User.create({ name: 'Other3', email: 'other3@example.com', password: PASSWORD });
  await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'A', body: 'x' });
  await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'B', body: 'x' });
  await createNotification({ recipient: other._id, type: 'admin_announcement', title: 'C', body: 'x' });

  const res = await agent.patch('/api/notifications/read-all').set(csrf);
  assert.equal(res.status, 200);

  assert.equal(await Notification.countDocuments({ recipient: user._id, read: false }), 0);
  assert.equal(await Notification.countDocuments({ recipient: other._id, read: false }), 1);
});

test('deleteNotification: removes the caller\'s own notification; 404 for another user\'s', async () => {
  const { agent, csrf, user } = await makeUserAgent();
  const other = await User.create({ name: 'Other4', email: 'other4@example.com', password: PASSWORD });
  const mine   = await createNotification({ recipient: user._id, type: 'admin_announcement', title: 'Mine', body: 'x' });
  const theirs = await createNotification({ recipient: other._id, type: 'admin_announcement', title: 'Theirs', body: 'x' });

  const ok = await agent.delete(`/api/notifications/${mine._id}`).set(csrf);
  assert.equal(ok.status, 200);
  assert.equal(await Notification.findById(mine._id), null);

  const forbidden = await agent.delete(`/api/notifications/${theirs._id}`).set(csrf);
  assert.equal(forbidden.status, 404);
  assert.notEqual(await Notification.findById(theirs._id), null);
});

// ---------------------------------------------------------------------------
// Manual payment approve/reject
// ---------------------------------------------------------------------------

test('manual payment approved: notifies the student with a payment_received notification', async () => {
  const student = await User.create({ name: 'Student', email: 'manual-approve@example.com', password: PASSWORD });
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 10, method: 'bank', customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const { agent, csrf, cookieHeader } = await makeAdminAgent();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`)
    .set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);

  const notifs = await Notification.find({ recipient: student._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'payment_received');
  assert.match(notifs[0].body, /Starter/);
});

test('manual payment rejected: notifies the student with a payment_failed notification', async () => {
  const student = await User.create({ name: 'Student', email: 'manual-reject@example.com', password: PASSWORD });
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 10, method: 'bank', customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const { agent, csrf, cookieHeader } = await makeAdminAgent();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`)
    .set({ ...csrf, Cookie: cookieHeader }).send({ status: 'rejected', adminNote: 'Bad reference' });
  assert.equal(res.status, 200);

  const notifs = await Notification.find({ recipient: student._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'payment_failed');
  assert.match(notifs[0].body, /Bad reference/);
});

test('manual payment approved for a guest (no userId): no notification is created and the request still succeeds', async () => {
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 10, method: 'bank', customer: { email: 'guest@example.com', name: 'Guest' },
    userId: null, status: 'pending',
  });
  const { agent, csrf, cookieHeader } = await makeAdminAgent();

  const res = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`)
    .set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(await Notification.countDocuments(), 0);
});

test('manual payment: a second approval attempt after the first (409, already processed) does not create a second notification', async () => {
  const student = await User.create({ name: 'Student', email: 'manual-dup@example.com', password: PASSWORD });
  const record = await ManualPayment.create({
    plan: 'Starter', amount: 10, method: 'bank', customer: { email: student.email, name: student.name },
    userId: student._id, status: 'pending',
  });
  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const headers = { ...csrf, Cookie: cookieHeader };

  const first  = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' });
  const second = await agent.patch(`/api/v1/admin/payments/manual/${record._id}`).set(headers).send({ status: 'approved' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal(await Notification.countDocuments({ recipient: student._id }), 1);
});

// ---------------------------------------------------------------------------
// PayPal webhook (success + failure + duplicate delivery)
// ---------------------------------------------------------------------------

const PAYPAL_HEADERS = {
  'paypal-cert-url':          'https://api.paypal.com/some/cert',
  'paypal-auth-algo':         'SHA256withRSA',
  'paypal-transmission-id':   'txn-id',
  'paypal-transmission-sig':  'sig',
  'paypal-transmission-time': new Date().toISOString(),
};

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

function mockPaypalFetch(t, { captureStatus = 'COMPLETED' } = {}) {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('/v1/oauth2/token')) return jsonResponse({ access_token: 'fake-access-token' });
    if (u.includes('/v1/notifications/verify-webhook-signature')) return jsonResponse({ verification_status: 'SUCCESS' });
    if (/\/v2\/checkout\/orders\/.+\/capture$/.test(u)) {
      return jsonResponse({ status: captureStatus, purchase_units: [{ payments: { captures: [{ id: 'CAP-DIRECT' }] } }] });
    }
    throw new Error(`Unexpected fetch call in test: ${u}`);
  });
}

before(() => {
  process.env.PAYPAL_WEBHOOK_ID = 'webhook_id_for_tests';
  process.env.PAYPAL_CLIENT_ID = 'client_id_for_tests';
  process.env.PAYPAL_CLIENT_SECRET = 'client_secret_for_tests';
});

test('PayPal PAYMENT.CAPTURE.COMPLETED: notifies the payer with a payment_received notification', async (t) => {
  mockPaypalFetch(t);
  const user = await User.create({ name: 'Payer', email: 'paypal-payer@example.com', password: PASSWORD });
  await Payment.create({
    plan: 'Starter', amount: 10, gateway: 'paypal', status: 'pending',
    gatewayOrderId: 'ORDER-NOTIF-1', userId: user._id, customer: { email: user.email, name: user.name },
  });

  const res = await request(app).post('/api/payments/paypal/webhook').set(PAYPAL_HEADERS).send({
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: 'CAP-1', supplementary_data: { related_ids: { order_id: 'ORDER-NOTIF-1' } } },
  });
  assert.equal(res.status, 200);

  const notifs = await Notification.find({ recipient: user._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'payment_received');
});

test('PayPal capture not completed: notifies the payer with a payment_failed notification', async (t) => {
  // Only the direct capture endpoint (capturePaypalOrder) forwards the
  // gateway's real capture status through to finalizePaypalOrder — the
  // PAYMENT.CAPTURE.COMPLETED webhook event, by definition, always means the
  // capture succeeded, so it hardcodes status: 'COMPLETED' regardless of the
  // event payload and can never exercise this branch.
  mockPaypalFetch(t, { captureStatus: 'DECLINED' });
  const user = await User.create({ name: 'Payer2', email: 'paypal-payer2@example.com', password: PASSWORD });
  await Payment.create({
    plan: 'Starter', amount: 10, gateway: 'paypal', status: 'pending',
    gatewayOrderId: 'ORDER-NOTIF-2', userId: user._id, customer: { email: user.email, name: user.name },
  });

  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/payments/paypal/ORDER-NOTIF-2/capture').set(csrf).send();
  assert.equal(res.status, 200);

  const notifs = await Notification.find({ recipient: user._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'payment_failed');
});

test('PayPal duplicate webhook delivery for an already-paid order does not create a second notification', async (t) => {
  mockPaypalFetch(t);
  const user = await User.create({ name: 'Payer3', email: 'paypal-payer3@example.com', password: PASSWORD });
  await Payment.create({
    plan: 'Starter', amount: 10, gateway: 'paypal', status: 'pending',
    gatewayOrderId: 'ORDER-NOTIF-3', userId: user._id, customer: { email: user.email, name: user.name },
  });

  const body = {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: 'CAP-3', supplementary_data: { related_ids: { order_id: 'ORDER-NOTIF-3' } } },
  };
  const first  = await request(app).post('/api/payments/paypal/webhook').set(PAYPAL_HEADERS).send(body);
  const second = await request(app).post('/api/payments/paypal/webhook').set(PAYPAL_HEADERS).send(body);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(await Notification.countDocuments({ recipient: user._id }), 1);
});

// ---------------------------------------------------------------------------
// Live classes: scheduled + cancelled
// ---------------------------------------------------------------------------

test('createClass: notifies the student with a class_scheduled notification', async () => {
  const { agent, csrf, user: teacher } = await makeUserAgent({ role: 'teacher' });
  const student = await User.create({ name: 'Classy Student', email: 'classy-student@example.com', password: PASSWORD, role: 'student', teacher: teacher._id });

  const res = await agent.post('/api/classes').set(csrf).send({
    student: student._id, title: 'Tajweed 101', startsAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(res.status, 201);

  const notifs = await Notification.find({ recipient: student._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'class_scheduled');
  assert.match(notifs[0].body, /Tajweed 101/);
});

test('updateClass: cancelling notifies the student with a class_cancelled notification exactly once, even if saved again while already cancelled', async () => {
  const { agent, csrf, user: teacher } = await makeUserAgent({ role: 'teacher' });
  const student = await User.create({ name: 'Cancel Student', email: 'cancel-student@example.com', password: PASSWORD, role: 'student', teacher: teacher._id });

  const create = await agent.post('/api/classes').set(csrf).send({
    student: student._id, title: 'Recitation', startsAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(create.status, 201);
  const classId = create.body._id;

  const cancel = await agent.patch(`/api/classes/${classId}`).set(csrf).send({ status: 'cancelled' });
  assert.equal(cancel.status, 200);

  // Unrelated edit while already cancelled must not fire a second notification.
  const editAgain = await agent.patch(`/api/classes/${classId}`).set(csrf).send({ notes: 'rescheduling later' });
  assert.equal(editAgain.status, 200);

  const notifs = await Notification.find({ recipient: student._id, type: 'class_cancelled' });
  assert.equal(notifs.length, 1);
});

// ---------------------------------------------------------------------------
// Certificate issued
// ---------------------------------------------------------------------------

test('issueCertificate: notifies the student with a certificate_issued notification', async () => {
  const student = await User.create({ name: 'Grad', email: 'grad@example.com', password: PASSWORD });
  const { agent, csrf, cookieHeader } = await makeAdminAgent();

  const res = await agent.post('/api/v1/admin/certificates').set({ ...csrf, Cookie: cookieHeader })
    .send({ userId: student._id, title: 'Juz Amma Completion' });
  assert.equal(res.status, 201);

  const notifs = await Notification.find({ recipient: student._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'certificate_issued');
  assert.match(notifs[0].body, /Juz Amma Completion/);
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

test('sendMessage: notifies the recipient with a message_received notification (body truncated to fit Notification.body\'s 500-char cap)', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'msg-teacher@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await makeUserAgent({ role: 'student', teacher: teacher._id });

  const longBody = 'x'.repeat(300);
  const res = await agent.post('/api/messages').set(csrf).send({ to: teacher._id, body: longBody });
  assert.equal(res.status, 201);

  const notifs = await Notification.find({ recipient: teacher._id });
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'message_received');
  assert.ok(notifs[0].body.length <= 500);
});

// ---------------------------------------------------------------------------
// Review moderation
// ---------------------------------------------------------------------------

test('moderateReview: approving notifies the student with a review_approved notification exactly once, even if approved again', async () => {
  const student = await User.create({ name: 'Reviewer', email: 'reviewer@example.com', password: PASSWORD });
  const teacher = await User.create({ name: 'Reviewed Teacher', email: 'reviewed-teacher@example.com', password: PASSWORD, role: 'teacher' });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'Great teacher', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const headers = { ...csrf, Cookie: cookieHeader };

  const first = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set(headers).send({ status: 'approved' });
  assert.equal(first.status, 200);

  // Re-approving (e.g. editing adminNote afterwards) must not duplicate the notification.
  const second = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set(headers).send({ status: 'approved', adminNote: 'still good' });
  assert.equal(second.status, 200);

  const notifs = await Notification.find({ recipient: student._id, type: 'review_approved' });
  assert.equal(notifs.length, 1);
});

test('moderateReview: rejecting does not create a review_approved notification', async () => {
  const student = await User.create({ name: 'Reviewer2', email: 'reviewer2@example.com', password: PASSWORD });
  const teacher = await User.create({ name: 'Reviewed Teacher2', email: 'reviewed-teacher2@example.com', password: PASSWORD, role: 'teacher' });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 2, body: 'Not great', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'rejected' });
  assert.equal(res.status, 200);

  assert.equal(await Notification.countDocuments({ recipient: student._id }), 0);
});

// ---------------------------------------------------------------------------
// Cron: subscription expiration reminders
// ---------------------------------------------------------------------------

test('sendRenewalReminders: notifies each qualifying user with a subscription_expiring notification, once per billing period', async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  const validUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const user = await User.create({
    name: 'Expiring User', email: 'expiring@example.com', password: PASSWORD,
    subscription: { status: 'active', plan: 'Starter', validUntil },
  });

  const first = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', 'test-cron-secret');
  assert.equal(first.status, 200);

  const notifs1 = await Notification.find({ recipient: user._id, type: 'subscription_expiring' });
  assert.equal(notifs1.length, 1);

  // Running the cron again the same day must not double-notify — mirrors the
  // existing renewalReminderSentFor email idempotency guard.
  const second = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', 'test-cron-secret');
  assert.equal(second.status, 200);

  const notifs2 = await Notification.find({ recipient: user._id, type: 'subscription_expiring' });
  assert.equal(notifs2.length, 1);
});
