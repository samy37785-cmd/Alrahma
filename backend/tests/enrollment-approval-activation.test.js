import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Invoice from '../models/Invoice.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Scope correction (see docs/current-project-status.md): PATCH /api/v1/
// admin/enrollments/:id/approve is the one admin action that links a
// booking to a registered account and activates their subscription/content
// access end to end. This proves the whole chain, including the exact bug
// this correction fixes: before this action existed, no live route could
// ever set User.subscription.status='active' again (see models/User.js's
// hasActiveSubscription()), so course content stayed permanently locked for
// every new student regardless of admin approval.

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

function studentBearer(user) {
  const token = jwt.sign({ id: user._id.toString(), v: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  return `Bearer ${token}`;
}

async function createPublishedCourse() {
  return Course.create({
    title: 'Tajweed Foundations', description: 'x', published: true,
    resources: [{ type: 'link', label: 'Book', url: 'https://files/book.pdf' }],
  });
}

async function pendingBooking(overrides = {}) {
  return Enrollment.create({
    name: 'Amina Student', email: `amina-${Date.now()}${Math.random()}@example.com`,
    whatsapp: '+447700900000', plan: 'Starter', status: 'pending',
    bookingRef: `AR-TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    ...overrides,
  });
}

test('approve with a matching registered user: 200, subscription active, invoice created, course content unlocks', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const course = await createPublishedCourse();
  const booking = await pendingBooking();
  const student = await User.create({ name: 'Amina', email: booking.email, password: 'Sup3r-Str0ng-Pass!', role: 'student' });

  const res = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`)
    .set({ ...csrf, Cookie: cookieHeader });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.enrollment.status, 'enrolled');
  assert.equal(res.body.user.subscription.status, 'active');
  assert.equal(res.body.user.subscription.plan, 'Starter');

  const savedEnrollment = await Enrollment.findById(booking._id).lean();
  assert.equal(savedEnrollment.status, 'enrolled');

  const invoiceCount = await Invoice.countDocuments({ user: student._id });
  assert.equal(invoiceCount, 1);

  const reloadedUser = await User.findById(student._id);
  assert.equal(reloadedUser.hasActiveSubscription(), true, 'the exact gate courseController/progressController check');

  const courseRes = await agent.get(`/api/courses/${course._id}`)
    .set('Authorization', studentBearer(reloadedUser));
  assert.equal(courseRes.status, 200);
  assert.equal(courseRes.body.locked, undefined, 'unlocked course response has no locked flag');
  assert.equal(courseRes.body.resources[0].url, 'https://files/book.pdf', 'real resource URL must be present once unlocked');
});

test('approve with no matching registered user: 422, nothing activated, booking status unchanged', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const booking = await pendingBooking({ email: 'nobody-registered@example.com' });

  const res = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`)
    .set({ ...csrf, Cookie: cookieHeader });

  assert.equal(res.status, 422);
  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.status, 'pending', 'a failed approval must not partially transition the booking');
  assert.equal(await Invoice.countDocuments(), 0);
});

test('double-approve (already enrolled) returns 409 and does not re-activate', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const booking = await pendingBooking();
  await User.create({ name: 'Amina', email: booking.email, password: 'Sup3r-Str0ng-Pass!', role: 'student' });

  const first = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(first.status, 200);

  const invoiceCountAfterFirst = await Invoice.countDocuments();

  const second = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(second.status, 409);
  assert.equal(await Invoice.countDocuments(), invoiceCountAfterFirst, 'a rejected double-approve must not create a second invoice');
});

test('a cancelled booking cannot be approved (409)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const booking = await pendingBooking({ status: 'cancelled' });
  await User.create({ name: 'Amina', email: booking.email, password: 'Sup3r-Str0ng-Pass!', role: 'student' });

  const res = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 409);
});

test('regression guard: a pending (never-approved) booking leaves course content locked for the matching student', async () => {
  const course = await createPublishedCourse();
  const booking = await pendingBooking();
  const student = await User.create({ name: 'Amina', email: booking.email, password: 'Sup3r-Str0ng-Pass!', role: 'student' });

  assert.equal(student.hasActiveSubscription(), false);

  const { agent } = await agentWithCsrf(app);
  const courseRes = await agent.get(`/api/courses/${course._id}`).set('Authorization', studentBearer(student));
  assert.equal(courseRes.status, 200);
  assert.equal(courseRes.body.locked, true);
  assert.deepEqual(courseRes.body.resources, []);
});

test('PATCH .../approve requires enrollments:write — a viewer (no such permission) is forbidden (403)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('viewer');
  const booking = await pendingBooking();

  const res = await agent.patch(`/api/v1/admin/enrollments/${booking._id}/approve`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 403);
});
