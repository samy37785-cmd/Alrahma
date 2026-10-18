import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// AR-04 closes the admin reads a regular account with role 'admin' could make
// with a password alone. This file proves the parts of the site that must not
// change with it, on the Mongo backend:
//   - a visitor signs up and signs in to a regular account, and can never
//     give themselves admin by sending a role;
//   - every existing account signs in as before, its record unchanged;
//   - the public booking, trial, newsletter and contact forms work without
//     an account, and what visitors send still reaches the admin console's
//     Bookings, Trials and Newsletter tabs through the MFA admin API;
//   - a signed-in account still uses the Quran tools.
//
// No real email: the mailer is replaced and every message is recorded.

const sent = [];
mock.module('../config/mailer.js', {
  namedExports: {
    sendMail: async (message) => { sent.push(message); },
    ADMIN_EMAIL: () => 'office@example.test',
    mailProvider: () => 'none',
  },
});

const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: AdminUser } = await import('../models/AdminUser.js');
const { default: Enrollment } = await import('../models/Enrollment.js');
const { default: TrialRequest } = await import('../models/TrialRequest.js');
const { default: Subscriber } = await import('../models/Subscriber.js');
const { default: ContactMessage } = await import('../models/ContactMessage.js');
const { signAccessToken } = await import('../utils/adminAuthTokens.js');

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); sent.length = 0; });

// A fresh browser: its own cookies and CSRF token, and its own address so the
// per-IP sign-in rate limit of one test never spills into another.
let lastOctet = 0;
async function visitor() {
  const agent = request.agent(app);
  agent.set('X-Forwarded-For', `198.51.100.${++lastOctet}`);
  const res = await agent.get('/health');
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  return { agent, csrf: { 'x-csrf-token': cookie.split(';')[0].split('=')[1] } };
}

function adminConsoleCookie(role = 'admin') {
  return AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role, mfaEnabled: true,
  }).then((admin) => `admin_at=${signAccessToken(admin._id, admin.role, true)}`);
}

// ── Sign-up and sign-in ────────────────────────────────────────────────────

test('a visitor signs up, is signed in, signs out and signs in again', async () => {
  const { agent, csrf } = await visitor();
  const email = 'new-visitor@example.com';

  const register = await agent.post('/api/auth/register').set(csrf).send({ name: 'New Visitor', email, password: PASSWORD });
  assert.equal(register.status, 201);
  assert.equal(register.body.email, email);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, email);
  assert.equal(me.body.password, undefined, 'never returns the password hash');

  // The confirmation link is recorded by the replaced mailer, not sent.
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);

  assert.equal((await agent.post('/api/auth/logout').set(csrf)).status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);

  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal((await agent.get('/api/auth/me')).body.email, email);

  // A wrong password is still refused.
  const { agent: other, csrf: otherCsrf } = await visitor();
  assert.equal((await other.post('/api/auth/login').set(otherCsrf).send({ email, password: 'Wrong-Pass-2026!' })).status, 401);
});

test('sign-up always creates a regular account: never an admin, teacher or parent, whatever role the request sends', async () => {
  // The site's form sends no role (undefined); the rest are hand-made requests.
  for (const [i, role] of [undefined, 'student', 'admin', 'teacher', 'parent', 'PARENT', ['parent']].entries()) {
    const { agent, csrf } = await visitor();
    const email = `signup-${i}@example.com`;
    const body = { name: 'Visitor', email, password: PASSWORD };
    if (role !== undefined) body.role = role;
    const res = await agent.post('/api/auth/register').set(csrf).send(body);
    assert.equal(res.status, 201, `role ${role}`);
    const stored = await User.findOne({ email }).lean();
    assert.equal(stored.role, 'student', `asked for ${role}, stored as a regular account`);
    // ...and that account reads no admin data and opens no parent area.
    assert.equal((await agent.get('/api/v1/admin/trials')).status, 401);
    assert.equal((await agent.get('/api/parent/children')).status, 403);
    assert.equal((await agent.get('/api/auth/me')).body.role, 'student');
  }
});

test('every existing account still signs in and reads its own profile, and its record is unchanged', async () => {
  const teacher = await User.create({ name: 'Old Teacher', email: 'old-teacher@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Old Student', email: 'old-student@example.com', password: PASSWORD, role: 'student', teacher: teacher._id });
  await User.create({ name: 'Old Parent', email: 'old-parent@example.com', password: PASSWORD, role: 'parent', children: [student._id] });
  await User.create({ name: 'Old Role Admin', email: 'old-admin@example.com', password: PASSWORD, role: 'admin' });
  const before = await User.find().sort('email').lean();

  for (const email of ['old-teacher@example.com', 'old-student@example.com', 'old-parent@example.com', 'old-admin@example.com']) {
    const { agent, csrf } = await visitor();
    const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
    assert.equal(login.status, 200, `${email} signs in`);
    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.email, email);
  }

  const after = await User.find().sort('email').lean();
  assert.equal(after.length, before.length);
  for (const [i, row] of after.entries()) {
    assert.equal(row.role, before[i].role, `${row.email} keeps its role`);
    assert.equal(String(row.teacher), String(before[i].teacher), `${row.email} keeps its teacher`);
    assert.deepEqual(row.children.map(String), before[i].children.map(String), `${row.email} keeps its children`);
  }
});

// ── The public forms ───────────────────────────────────────────────────────

test('the booking, trial, newsletter and contact forms accept a visitor with no account', async () => {
  const { agent, csrf } = await visitor();

  const booking = await agent.post('/api/enrollments').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', whatsapp: '+447700900000' });
  assert.equal(booking.status, 201);
  assert.match(booking.body.bookingRef, /^AR-/);

  const trial = await agent.post('/api/trials').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', course: 'Quran' });
  assert.equal(trial.status, 201);

  const sub = await agent.post('/api/newsletter').set(csrf).send({ email: 'reader@example.com' });
  assert.equal(sub.status, 201);

  const contact = await agent.post('/api/contact').set(csrf).send({ name: 'Visitor', email: 'visitor@example.com', subject: 'Hello', message: 'A question about the Quran course' });
  assert.equal(contact.status, 201);

  assert.equal(await Enrollment.countDocuments(), 1);
  assert.equal(await TrialRequest.countDocuments(), 1);
  assert.equal(await Subscriber.countDocuments({ email: 'reader@example.com' }), 1);
  assert.equal(await ContactMessage.countDocuments(), 1);
  // Every notification went to the replaced mailer only.
  assert.ok(sent.length >= 1);
});

test("what a visitor sends reaches the admin console's Bookings, Trials and Newsletter tabs through the MFA admin API", async () => {
  const { agent, csrf } = await visitor();
  await agent.post('/api/enrollments').set(csrf).send({ name: 'Booking Visitor', email: 'booker@example.com', whatsapp: '+447700900001' });
  await agent.post('/api/trials').set(csrf).send({ name: 'Trial Visitor', email: 'trial@example.com', course: 'Arabic' });
  await agent.post('/api/newsletter').set(csrf).send({ email: 'reader2@example.com' });

  const cookie = await adminConsoleCookie('admin');
  const bookings = await request(app).get('/api/v1/admin/enrollments').set('Cookie', cookie);
  assert.equal(bookings.status, 200);
  assert.ok(JSON.stringify(bookings.body).includes('Booking Visitor'));
  const trials = await request(app).get('/api/v1/admin/trials').set('Cookie', cookie);
  assert.equal(trials.status, 200);
  assert.deepEqual(trials.body.map((t) => t.name), ['Trial Visitor']);
  const subscribers = await request(app).get('/api/v1/admin/newsletter').set('Cookie', cookie);
  assert.equal(subscribers.status, 200);
  assert.deepEqual(subscribers.body.map((s) => s.email), ['reader2@example.com']);
});

// ── The Quran tools ────────────────────────────────────────────────────────

test('a signed-in account still saves and reads its Quran bookmarks, reading progress and memorisation stats', async () => {
  const { agent, csrf } = await visitor();
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Reader', email: 'quran-reader@example.com', password: PASSWORD });

  const add = await agent.post('/api/quran-bookmarks').set(csrf).send({ verseKey: '2:255', chapterId: 2, verseNum: 255, note: 'Ayat al-Kursi' });
  assert.ok([200, 201].includes(add.status), `bookmark expected 200/201, got ${add.status}`);
  const list = await agent.get('/api/quran-bookmarks');
  assert.equal(list.status, 200);
  assert.ok(JSON.stringify(list.body).includes('2:255'));

  assert.equal((await agent.get('/api/quran-progress')).status, 200);
  assert.equal((await agent.get('/api/quran-memo')).status, 200);
});
