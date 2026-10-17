import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import TrialRequest from '../models/TrialRequest.js';
import Subscriber from '../models/Subscriber.js';
import ContactMessage from '../models/ContactMessage.js';
import Coupon from '../models/Coupon.js';
import Certificate from '../models/Certificate.js';
import CourseProgress from '../models/CourseProgress.js';
import HifzProgress from '../models/HifzProgress.js';
import Invoice from '../models/Invoice.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// AR-04: a regular account with role 'admin' used to read every booking,
// trial lead, contact message, subscriber, coupon, certificate, invoice and
// student progress report with a password alone (protect + adminOnly). None
// of that went through the admin console's TOTP MFA or IP allowlist.
//
// Those reads now exist only under /api/v1/admin. This file proves, on the
// Mongo backend:
//   - every old path answers 404 to everyone, including a role 'admin'
//     account, and returns none of the data;
//   - a student's own routes still work;
//   - the new admin routes refuse a role 'admin' account, an admin without
//     a verified MFA step, and an admin without the permission, and serve
//     an MFA-verified admin.
// The IP allowlist is covered in admin-legacy-routes-ar04-ip.test.js (it is
// read once at import, so it needs its own process), and the Supabase
// backend in admin-legacy-routes-ar04-supabase.test.js and the
// auth-booking contract gate.

const PASSWORD = 'Str0ngP@ssw0rd!';
const MARKER = 'ar04-leak-marker';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function accountAgent(role) {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `${role}-${Date.now()}${Math.random()}@example.com`;
  const user = await User.create({ name: `${role} account`, email, password: PASSWORD, role });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login as ${role}`);
  return { agent, csrf, user };
}

async function adminConsoleAgent(role = 'admin', { mfaEnabled = true, mfaVerified = true, stage } = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role, mfaEnabled,
  });
  const token = stage
    ? signStageToken(admin._id, stage)
    : signAccessToken(admin._id, admin.role, mfaVerified);
  return { agent, cookie: `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}` };
}

// A pre-auth token from the middle of the login flow (password done, TOTP
// not yet): it carries a 'stage' field and must never open a data route.
function signStageToken(adminId, stage) {
  return jwt.sign({ id: String(adminId), stage }, process.env.ADMIN_JWT_ACCESS_SECRET, { expiresIn: '5m' });
}

// One record of every kind the old routes exposed, each carrying MARKER, plus
// a student with progress, memorisation and a certificate.
async function seedEverything() {
  const student = await User.create({ name: `Student ${MARKER}`, email: `student-${Date.now()}@example.com`, password: PASSWORD });
  const course = await Course.create({ title: `Course ${MARKER}`, description: 'x', published: true });
  await Enrollment.create({ name: `Booking ${MARKER}`, email: 'booking@example.com', whatsapp: '+447700900000', bookingRef: 'AR-AR04-TEST' });
  await TrialRequest.create({ name: `Trial ${MARKER}`, email: 'trial@example.com', message: MARKER });
  await Subscriber.create({ email: `${MARKER}@example.com` });
  await ContactMessage.create({ name: `Contact ${MARKER}`, email: 'contact@example.com', subject: MARKER, message: MARKER });
  await Coupon.create({ code: 'AR04MARKER', description: MARKER, discountType: 'percent', discountValue: 10 });
  await Invoice.create({ user: student._id, customerEmail: 'invoice@example.com', customerName: MARKER, plan: MARKER, amount: 10, originalAmount: 10 });
  await Certificate.create({ user: student._id, studentName: `Student ${MARKER}`, title: `Ijazah ${MARKER}`, type: 'ijazah', course: course._id });
  await CourseProgress.create({ user: student._id, course: course._id, completed: [] });
  await HifzProgress.create({ user: student._id, chapterId: 1, chapterName: `Al-Fatiha ${MARKER}`, totalVerses: 7, memorizedVerses: [1, 2] });
  return { student, course };
}

const closedPaths = (studentId) => [
  '/api/enrollments',
  '/api/trials',
  '/api/newsletter',
  '/api/contact',
  '/api/coupons',
  '/api/certificates',
  `/api/certificates?userId=${studentId}`,
  '/api/invoices/admin',
  `/api/progress/user/${studentId}`,
  `/api/hifz/user/${studentId}`,
];

const newAdminPaths = (studentId) => [
  '/api/v1/admin/trials',
  '/api/v1/admin/newsletter',
  `/api/v1/admin/certificates?userId=${studentId}`,
  `/api/v1/admin/users/${studentId}/progress`,
  `/api/v1/admin/users/${studentId}/hifz`,
];

// ── The old paths are gone ─────────────────────────────────────────────────

test('every old admin read answers 404 to an anonymous caller', async () => {
  const { student } = await seedEverything();
  const { agent } = await agentWithCsrf(app);
  for (const path of closedPaths(student._id)) {
    const res = await agent.get(path);
    assert.equal(res.status, 404, `${path} expected 404, got ${res.status}`);
    assert.ok(!JSON.stringify(res.body).includes(MARKER), `${path} must not return data`);
  }
});

test('every old admin read answers 404 to a role "admin" account and returns none of the data', async () => {
  const { student } = await seedEverything();
  const { agent } = await accountAgent('admin');
  for (const path of closedPaths(student._id)) {
    const res = await agent.get(path);
    assert.equal(res.status, 404, `${path} expected 404, got ${res.status}`);
    assert.ok(!JSON.stringify(res.body).includes(MARKER), `${path} must not return data`);
  }
});

test('every old admin read answers 404 to a student, a teacher and a parent', async () => {
  const { student } = await seedEverything();
  for (const role of ['student', 'teacher', 'parent']) {
    const { agent } = await accountAgent(role);
    for (const path of closedPaths(student._id)) {
      const res = await agent.get(path);
      assert.equal(res.status, 404, `${role} ${path} expected 404, got ${res.status}`);
    }
  }
});

// ── A student's own routes are untouched ───────────────────────────────────

test('a student still reads their own booking, certificates, memorisation, course progress and invoices', async () => {
  const course = await Course.create({ title: 'Tajweed', description: 'x', published: true });
  const { agent } = await accountAgent('student');
  for (const path of ['/api/enrollments/mine', '/api/certificates/mine', '/api/hifz', `/api/progress/${course._id}`, '/api/invoices']) {
    const res = await agent.get(path);
    assert.equal(res.status, 200, `${path} expected 200, got ${res.status}`);
  }
});

test('the public trial, newsletter, contact and booking forms still accept submissions', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const trial = await agent.post('/api/trials').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', course: 'Quran' });
  assert.equal(trial.status, 201);
  const sub = await agent.post('/api/newsletter').set(csrf).send({ email: 'reader@example.com' });
  assert.ok([200, 201].includes(sub.status), `newsletter expected 200/201, got ${sub.status}`);
  const contact = await agent.post('/api/contact').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', subject: 'Hello', message: 'A question about classes' });
  assert.equal(contact.status, 201);
  const booking = await agent.post('/api/enrollments').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', whatsapp: '+447700900000' });
  assert.equal(booking.status, 201);
});

// ── The new admin routes ───────────────────────────────────────────────────

test('the new admin routes refuse a role "admin" account (no admin console session)', async () => {
  const { student } = await seedEverything();
  const { agent } = await accountAgent('admin');
  for (const path of newAdminPaths(student._id)) {
    const res = await agent.get(path);
    assert.equal(res.status, 401, `${path} expected 401, got ${res.status}`);
    assert.ok(!JSON.stringify(res.body).includes(MARKER), `${path} must not return data`);
  }
});

test('the new admin routes refuse an admin whose MFA step is not verified', async () => {
  const { student } = await seedEverything();
  const { agent, cookie } = await adminConsoleAgent('admin', { mfaEnabled: true, mfaVerified: false });
  for (const path of newAdminPaths(student._id)) {
    const res = await agent.get(path).set('Cookie', cookie);
    assert.equal(res.status, 403, `${path} expected 403, got ${res.status}`);
    assert.equal(res.body.code, 'MFA_REQUIRED');
    assert.ok(!JSON.stringify(res.body).includes(MARKER), `${path} must not return data`);
  }
});

test('the new admin routes refuse a half-finished login (password done, TOTP not yet)', async () => {
  const { student } = await seedEverything();
  const { agent, cookie } = await adminConsoleAgent('admin', { stage: 'mfa' });
  for (const path of newAdminPaths(student._id)) {
    const res = await agent.get(path).set('Cookie', cookie);
    assert.equal(res.status, 403, `${path} expected 403, got ${res.status}`);
    assert.equal(res.body.code, 'MFA_REQUIRED');
  }
});

test('an MFA-verified admin reads trials, subscribers, certificates, progress and memorisation', async () => {
  const { student } = await seedEverything();
  const { agent, cookie } = await adminConsoleAgent('admin');
  const get = (path) => agent.get(path).set('Cookie', cookie);

  const trials = await get('/api/v1/admin/trials');
  assert.equal(trials.status, 200);
  assert.equal(trials.body.length, 1);
  assert.equal(trials.body[0].name, `Trial ${MARKER}`);

  const subscribers = await get('/api/v1/admin/newsletter');
  assert.equal(subscribers.status, 200);
  assert.equal(subscribers.body.length, 1);
  assert.equal(subscribers.body[0].email, `${MARKER}@example.com`);

  const certificates = await get(`/api/v1/admin/certificates?userId=${student._id}`);
  assert.equal(certificates.status, 200);
  assert.equal(certificates.body.length, 1);
  assert.equal(certificates.body[0].title, `Ijazah ${MARKER}`);
  assert.equal(certificates.body[0].course.title, `Course ${MARKER}`);

  const progress = await get(`/api/v1/admin/users/${student._id}/progress`);
  assert.equal(progress.status, 200);
  assert.equal(progress.body.length, 1);
  assert.equal(progress.body[0].title, `Course ${MARKER}`);

  const hifz = await get(`/api/v1/admin/users/${student._id}/hifz`);
  assert.equal(hifz.status, 200);
  assert.equal(hifz.body.length, 1);
  assert.deepEqual(hifz.body[0].memorizedVerses, [1, 2]);
});

test('the new admin routes follow the admin role permissions', async () => {
  const { student } = await seedEverything();

  // viewer: users:read + enrollments:read -> every read
  const viewer = await adminConsoleAgent('viewer');
  for (const path of newAdminPaths(student._id)) {
    const res = await viewer.agent.get(path).set('Cookie', viewer.cookie);
    assert.equal(res.status, 200, `viewer ${path} expected 200, got ${res.status}`);
  }

  // editor: enrollments:read only -> trial leads (like bookings), nothing about users
  const editor = await adminConsoleAgent('editor');
  const trials = await editor.agent.get('/api/v1/admin/trials').set('Cookie', editor.cookie);
  assert.equal(trials.status, 200);
  for (const path of newAdminPaths(student._id).filter((p) => !p.endsWith('/trials'))) {
    const res = await editor.agent.get(path).set('Cookie', editor.cookie);
    assert.equal(res.status, 403, `editor ${path} expected 403, got ${res.status}`);
    assert.ok(!JSON.stringify(res.body).includes(MARKER), `${path} must not return data`);
  }
});
