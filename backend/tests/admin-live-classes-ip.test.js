import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// The admin classes API (/api/v1/admin/live-classes) refuses an address
// outside ADMIN_IP_WHITELIST, even with a valid MFA-verified admin session.
// middleware/ipWhitelist.js reads the list once at import, so it is set here
// before app.js loads (node --test gives each file its own process). app.js
// trusts one proxy hop, so X-Forwarded-For sets req.ip as Vercel does.

const ALLOWED_IP = '198.51.100.7';
const OTHER_IP = '203.0.113.9';

const sent = [];
mock.module('../config/mailer.js', {
  namedExports: {
    sendMail: async (message) => { sent.push(message); },
    ADMIN_EMAIL: () => '',
    mailProvider: () => 'none',
  },
});

let app;
let User;
let AdminUser;
let LiveClass;
let signAccessToken;

before(async () => {
  process.env.ADMIN_IP_WHITELIST = ALLOWED_IP;
  ({ default: app } = await import('../app.js'));
  ({ default: User } = await import('../models/User.js'));
  ({ default: AdminUser } = await import('../models/AdminUser.js'));
  ({ default: LiveClass } = await import('../models/LiveClass.js'));
  ({ signAccessToken } = await import('../utils/adminAuthTokens.js'));
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); sent.length = 0; });

async function setup() {
  const teacher = await User.create({ name: 'Teacher', email: `t-${Date.now()}@example.com`, password: 'Str0ngP@ssw0rd!', role: 'teacher' });
  const student = await User.create({ name: 'Student', email: `s-${Date.now()}@example.com`, password: 'Str0ngP@ssw0rd!', role: 'student', teacher: teacher._id });
  const existing = await LiveClass.create({ teacher: teacher._id, student: student._id, title: 'Existing', startsAt: new Date(Date.now() + 86_400_000) });
  const admin = await AdminUser.create({
    name: 'Admin', email: `admin-${Date.now()}@example.com`, password: 'Sup3r-Str0ng-Pass!', role: 'admin', mfaEnabled: true,
  });
  const agent = request.agent(app);
  const health = await agent.get('/health');
  const csrfCookie = (health.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token=')).split(';')[0];
  const headers = {
    Cookie: `admin_at=${signAccessToken(admin._id, admin.role, true)}; ${csrfCookie}`,
    'x-csrf-token': csrfCookie.split('=')[1],
  };
  const body = { teacher: String(teacher._id), student: String(student._id), title: 'New', startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  return { agent, headers, existing, body };
}

test('an MFA-verified admin from an address outside the allowlist cannot read, schedule, edit or delete classes', async () => {
  const { agent, headers, existing, body } = await setup();
  const from = (req) => req.set(headers).set('X-Forwarded-For', OTHER_IP);
  assert.equal((await from(agent.get('/api/v1/admin/live-classes'))).status, 403);
  assert.equal((await from(agent.post('/api/v1/admin/live-classes')).send(body)).status, 403);
  assert.equal((await from(agent.patch(`/api/v1/admin/live-classes/${existing._id}`)).send({ notes: 'x' })).status, 403);
  assert.equal((await from(agent.delete(`/api/v1/admin/live-classes/${existing._id}`))).status, 403);
  assert.equal(await LiveClass.countDocuments(), 1);
  assert.equal((await LiveClass.findById(existing._id).lean()).notes, '');
  assert.equal(sent.length, 0);
});

test('the same admin from the allowed address is served', async () => {
  const { agent, headers, existing, body } = await setup();
  const from = (req) => req.set(headers).set('X-Forwarded-For', ALLOWED_IP);
  assert.equal((await from(agent.get('/api/v1/admin/live-classes'))).status, 200);
  assert.equal((await from(agent.post('/api/v1/admin/live-classes')).send(body)).status, 201);
  assert.equal((await from(agent.patch(`/api/v1/admin/live-classes/${existing._id}`)).send({ notes: 'x' })).status, 200);
  assert.equal((await from(agent.delete(`/api/v1/admin/live-classes/${existing._id}`))).status, 200);
});
