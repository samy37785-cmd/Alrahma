import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Live classes on the Mongo backend.
//
// Before: GET/POST/PATCH/DELETE /api/classes let any regular account with
// role 'admin' (a password alone, no MFA, no IP allowlist) see every class
// with every student's and teacher's name and email, and add, edit or delete
// any class. A class it added was recorded with the admin account as teacher.
//
// Now: /api/classes is for the teacher (their own classes and assigned
// students), the student and the parent only. The admin console manages
// classes through /api/v1/admin/live-classes (MFA + IP allowlist + RBAC),
// and every class it adds names an existing teacher account it chose.
//
// No real email: the mailer is replaced and every message is recorded. The IP
// allowlist half is in admin-live-classes-ip.test.js (read once at import).

const sent = [];
mock.module('../config/mailer.js', {
  namedExports: {
    sendMail: async (message) => { sent.push(message); },
    ADMIN_EMAIL: () => '',
    mailProvider: () => 'none',
  },
});

const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: AdminUser } = await import('../models/AdminUser.js');
const { default: LiveClass } = await import('../models/LiveClass.js');
const { default: SystemAuditLog } = await import('../models/SystemAuditLog.js');
const { signAccessToken } = await import('../utils/adminAuthTokens.js');

const PASSWORD = 'Str0ngP@ssw0rd!';
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY);

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); sent.length = 0; });

// Two teachers, each with an assigned student; a parent of student 1; a
// regular account with role 'admin'; one class per teacher.
async function seed() {
  const mk = (name, role, extra = {}) => User.create({
    name, email: `${name.toLowerCase()}-${Date.now()}${Math.random()}@example.com`, password: PASSWORD, role, ...extra,
  });
  const t1 = await mk('TeacherOne', 'teacher');
  const t2 = await mk('TeacherTwo', 'teacher');
  const s1 = await mk('StudentOne', 'student', { teacher: t1._id });
  const s2 = await mk('StudentTwo', 'student', { teacher: t2._id });
  const parent = await mk('ParentOne', 'parent', { children: [s1._id] });
  const roleAdmin = await mk('RoleAdmin', 'admin');
  const c1 = await LiveClass.create({ teacher: t1._id, student: s1._id, title: 'C1 TeacherOne/StudentOne', startsAt: inDays(1) });
  const c2 = await LiveClass.create({ teacher: t2._id, student: s2._id, title: 'C2 TeacherTwo/StudentTwo', startsAt: inDays(2) });
  return { t1, t2, s1, s2, parent, roleAdmin, c1, c2 };
}

async function loginAs(user) {
  const agent = request.agent(app);
  const health = await agent.get('/health');
  const cookie = (health.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  const csrf = { 'x-csrf-token': cookie.split(';')[0].split('=')[1] };
  const login = await agent.post('/api/auth/login').set(csrf).send({ email: user.email, password: PASSWORD });
  assert.equal(login.status, 200, `login as ${user.name}`);
  return { agent, csrf };
}

// An admin console session. mfaVerified false = password done, TOTP not.
async function adminConsole(role = 'admin', { mfaVerified = true, stage } = {}) {
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role, mfaEnabled: true,
  });
  const token = stage
    ? jwt.sign({ id: String(admin._id), stage }, process.env.ADMIN_JWT_ACCESS_SECRET, { expiresIn: '5m' })
    : signAccessToken(admin._id, admin.role, mfaVerified);
  const agent = request.agent(app);
  const health = await agent.get('/health');
  const csrfCookie = (health.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token=')).split(';')[0];
  const headers = { Cookie: `admin_at=${token}; ${csrfCookie}`, 'x-csrf-token': csrfCookie.split('=')[1] };
  return { admin, agent, headers };
}

const titles = (body) => (Array.isArray(body) ? body : body.data).map((c) => c.title).sort();
const newClassBody = (overrides = {}) => ({ title: 'Probe class', startsAt: inDays(5).toISOString(), ...overrides });

// ── /api/classes: teacher, student and parent keep their access ───────────

test('a student, a parent and a teacher each see only the classes they are allowed to', async () => {
  const { t1, s1, parent } = await seed();
  for (const user of [s1, parent, t1]) {
    const { agent } = await loginAs(user);
    const res = await agent.get('/api/classes');
    assert.equal(res.status, 200, user.name);
    assert.deepEqual(titles(res.body), ['C1 TeacherOne/StudentOne'], `${user.name} sees only class 1`);
  }
});

test('a regular account with role "admin" no longer sees every class', async () => {
  const { roleAdmin } = await seed();
  const { agent } = await loginAs(roleAdmin);
  const res = await agent.get('/api/classes');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [], 'treated like any account: only classes where it is the student');
  assert.ok(!JSON.stringify(res.body).includes('TeacherTwo'));
});

test('a teacher still schedules, edits and deletes their own classes, for their own students only', async () => {
  const { t1, s1, s2, c1, c2 } = await seed();
  const { agent, csrf } = await loginAs(t1);

  const created = await agent.post('/api/classes').set(csrf).send(newClassBody({ student: String(s1._id) }));
  assert.equal(created.status, 201);
  assert.equal(String(created.body.teacher._id), String(t1._id));
  assert.equal(sent.length, 1, 'the student is told');
  assert.equal(sent[0].to, s1.email);

  const notMine = await agent.post('/api/classes').set(csrf).send(newClassBody({ student: String(s2._id) }));
  assert.equal(notMine.status, 404, 'not a student assigned to this teacher');

  assert.equal((await agent.patch(`/api/classes/${c1._id}`).set(csrf).send({ notes: 'bring the mushaf' })).status, 200);
  assert.equal((await agent.patch(`/api/classes/${c2._id}`).set(csrf).send({ notes: 'x' })).status, 404);
  assert.equal((await agent.delete(`/api/classes/${c2._id}`).set(csrf)).status, 404);
  assert.equal((await agent.delete(`/api/classes/${created.body._id}`).set(csrf)).status, 200);

  const other = await LiveClass.findById(c2._id).lean();
  assert.equal(other.notes, '', "another teacher's class is untouched");
});

test('a student, a parent and a role "admin" account cannot schedule, edit or delete any class on /api/classes', async () => {
  const { s1, s2, parent, roleAdmin, c1, c2 } = await seed();
  for (const user of [s1, parent, roleAdmin]) {
    const { agent, csrf } = await loginAs(user);
    for (const student of [s1, s2]) {
      const res = await agent.post('/api/classes').set(csrf).send(newClassBody({ student: String(student._id) }));
      assert.equal(res.status, 403, `${user.name} POST`);
    }
    for (const c of [c1, c2]) {
      assert.equal((await agent.patch(`/api/classes/${c._id}`).set(csrf).send({ notes: 'x' })).status, 403, `${user.name} PATCH`);
      assert.equal((await agent.delete(`/api/classes/${c._id}`).set(csrf)).status, 403, `${user.name} DELETE`);
    }
  }
  assert.equal(await LiveClass.countDocuments(), 2, 'nothing created or deleted');
  assert.equal((await LiveClass.countDocuments({ notes: 'x' })), 0, 'nothing edited');
  assert.equal(sent.length, 0);
});

// ── /api/v1/admin/live-classes: who gets in ─────────────────────────────────

test('the admin classes API refuses no session, a role "admin" account, an unverified MFA step and a half-finished login', async () => {
  const { roleAdmin, s1, t1, c1 } = await seed();
  const attempts = [
    ['get', '/api/v1/admin/live-classes'],
    ['post', '/api/v1/admin/live-classes', newClassBody({ teacher: String(t1._id), student: String(s1._id) })],
    ['patch', `/api/v1/admin/live-classes/${c1._id}`, { notes: 'x' }],
    ['delete', `/api/v1/admin/live-classes/${c1._id}`],
  ];

  const anon = request.agent(app);
  const health = await anon.get('/health');
  const anonCsrf = { 'x-csrf-token': (health.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token=')).split(';')[0].split('=')[1] };
  for (const [method, path, body] of attempts) {
    assert.equal((await anon[method](path).set(anonCsrf).send(body)).status, 401, `anonymous ${method} ${path}`);
  }

  const { agent, csrf } = await loginAs(roleAdmin);
  for (const [method, path, body] of attempts) {
    assert.equal((await agent[method](path).set(csrf).send(body)).status, 401, `role admin ${method} ${path}`);
  }

  for (const options of [{ mfaVerified: false }, { stage: 'mfa' }]) {
    const { agent: a, headers } = await adminConsole('admin', options);
    for (const [method, path, body] of attempts) {
      const res = await a[method](path).set(headers).send(body);
      assert.equal(res.status, 403, `${JSON.stringify(options)} ${method} ${path}`);
      assert.equal(res.body.code, 'MFA_REQUIRED');
    }
  }

  assert.equal(await LiveClass.countDocuments(), 2);
  assert.equal(await LiveClass.countDocuments({ notes: 'x' }), 0);
  assert.equal(sent.length, 0);
});

test('admin roles: viewer reads only, editor has no access, admin and super-admin manage classes', async () => {
  const { t1, s1, c1, c2 } = await seed();

  const viewer = await adminConsole('viewer');
  assert.equal((await viewer.agent.get('/api/v1/admin/live-classes').set(viewer.headers)).status, 200);
  assert.equal((await viewer.agent.post('/api/v1/admin/live-classes').set(viewer.headers)
    .send(newClassBody({ teacher: String(t1._id), student: String(s1._id) }))).status, 403);
  assert.equal((await viewer.agent.patch(`/api/v1/admin/live-classes/${c1._id}`).set(viewer.headers).send({ notes: 'x' })).status, 403);
  assert.equal((await viewer.agent.delete(`/api/v1/admin/live-classes/${c1._id}`).set(viewer.headers)).status, 403);

  const editor = await adminConsole('editor');
  assert.equal((await editor.agent.get('/api/v1/admin/live-classes').set(editor.headers)).status, 403);
  assert.equal((await editor.agent.delete(`/api/v1/admin/live-classes/${c1._id}`).set(editor.headers)).status, 403);

  for (const role of ['admin', 'super-admin']) {
    const a = await adminConsole(role);
    assert.equal((await a.agent.get('/api/v1/admin/live-classes').set(a.headers)).status, 200, role);
    const created = await a.agent.post('/api/v1/admin/live-classes').set(a.headers)
      .send(newClassBody({ teacher: String(t1._id), student: String(s1._id), title: `by ${role}` }));
    assert.equal(created.status, 201, role);
    assert.equal((await a.agent.patch(`/api/v1/admin/live-classes/${c2._id}`).set(a.headers).send({ notes: role })).status, 200, role);
    assert.equal((await a.agent.delete(`/api/v1/admin/live-classes/${created.body._id}`).set(a.headers)).status, 200, role);
  }
});

// ── Listing ─────────────────────────────────────────────────────────────────

test('an admin sees every class with student and teacher names, and ?upcoming=1 hides past and cancelled ones', async () => {
  const { t1, s1 } = await seed();
  await LiveClass.create({ teacher: t1._id, student: s1._id, title: 'Past', startsAt: inDays(-1) });
  await LiveClass.create({ teacher: t1._id, student: s1._id, title: 'Cancelled', startsAt: inDays(3), status: 'cancelled' });
  const { agent, headers } = await adminConsole();

  const all = await agent.get('/api/v1/admin/live-classes').set(headers);
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 4);
  assert.deepEqual(titles(all.body), ['C1 TeacherOne/StudentOne', 'C2 TeacherTwo/StudentTwo', 'Cancelled', 'Past']);
  const c2 = all.body.data.find((c) => c.title.startsWith('C2'));
  assert.equal(c2.teacher.name, 'TeacherTwo');
  assert.equal(c2.student.name, 'StudentTwo');

  const upcoming = await agent.get('/api/v1/admin/live-classes?upcoming=1').set(headers);
  assert.deepEqual(titles(upcoming.body), ['C1 TeacherOne/StudentOne', 'C2 TeacherTwo/StudentTwo']);
});

// ── Scheduling from the admin console: the teacher is required and real ─────

test('scheduling without a teacher, or with anything but an existing teacher account, is refused and creates nothing', async () => {
  const { s1, s2, roleAdmin, parent } = await seed();
  const { agent, headers, admin } = await adminConsole();
  const post = (body) => agent.post('/api/v1/admin/live-classes').set(headers).send(newClassBody({ student: String(s1._id), ...body }));

  const missing = await post({});
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /teacher/i);

  for (const [label, teacher] of [
    ['not an id', 'not-an-id'],
    ['an unknown id', '0123456789abcdef01234567'],
    ['the admin console account', String(admin._id)],
    ['a student', String(s2._id)],
    ['a parent', String(parent._id)],
    ['a role "admin" account', String(roleAdmin._id)],
  ]) {
    const res = await post({ teacher });
    assert.equal(res.status, 400, label);
    assert.match(res.body.message, /not a valid teacher/, label);
  }

  assert.equal(await LiveClass.countDocuments(), 2, 'no class was created');
  assert.equal(sent.length, 0, 'no email was sent');
});

test('the participant must be a student account', async () => {
  const { t1, t2, parent } = await seed();
  const { agent, headers } = await adminConsole();
  for (const participant of [t2, parent]) {
    const res = await agent.post('/api/v1/admin/live-classes').set(headers)
      .send(newClassBody({ teacher: String(t1._id), student: String(participant._id) }));
    assert.equal(res.status, 400, participant.name);
    assert.match(res.body.message, /not a valid student/);
  }
  assert.equal(await LiveClass.countDocuments(), 2);
});

test('a class scheduled by an admin is recorded under the chosen teacher, leaves the student\'s assigned teacher alone, and is audited', async () => {
  const { t1, t2, s1, c1, c2 } = await seed();
  const before = await LiveClass.find().sort('title').lean();
  const { agent, headers, admin } = await adminConsole();

  // StudentOne is assigned to TeacherOne; the admin books TeacherTwo (a cover lesson).
  const res = await agent.post('/api/v1/admin/live-classes').set(headers)
    .send(newClassBody({ teacher: String(t2._id), student: String(s1._id), title: 'Cover lesson', meetingUrl: 'https://meet.example/abc' }));
  assert.equal(res.status, 201);
  assert.equal(String(res.body.teacher._id), String(t2._id));
  assert.notEqual(String(res.body.teacher._id), String(admin._id));
  assert.equal(res.body.student.name, 'StudentOne');

  const stored = await LiveClass.findById(res.body._id).lean();
  assert.equal(String(stored.teacher), String(t2._id));
  const student = await User.findById(s1._id).lean();
  assert.equal(String(student.teacher), String(t1._id), 'the student is still assigned to TeacherOne');

  const untouched = await LiveClass.find({ _id: { $in: [c1._id, c2._id] } }).sort('title').lean();
  assert.deepEqual(untouched, before, 'existing classes are unchanged');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, s1.email);
  assert.match(sent[0].html, /TeacherTwo/, 'the email names the class teacher, not the admin');

  const audit = await SystemAuditLog.findOne({ action: 'liveClass.create', resourceId: String(res.body._id) });
  assert.ok(audit, 'audit entry written');
  assert.equal(String(audit.adminId), String(admin._id));

  // The chosen teacher now sees the class on their own /api/classes, and can manage it.
  const { agent: teacherAgent } = await loginAs(t2);
  const teacherView = await teacherAgent.get('/api/classes');
  assert.ok(titles(teacherView.body).includes('Cover lesson'));
});

// ── Editing and deleting from the admin console ─────────────────────────────

test('an admin edits any class (not who teaches it or who it is for) and deletes any class, both audited', async () => {
  const { t1, s1, c1, c2 } = await seed();
  const { agent, headers } = await adminConsole();

  const patched = await agent.patch(`/api/v1/admin/live-classes/${c2._id}`).set(headers)
    .send({ status: 'cancelled', notes: 'teacher ill', teacher: String(t1._id), student: String(s1._id) });
  assert.equal(patched.status, 200);
  const stored = await LiveClass.findById(c2._id).lean();
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.notes, 'teacher ill');
  assert.equal(stored.teacher.toString(), c2.teacher.toString(), 'teacher not changed by PATCH');
  assert.equal(stored.student.toString(), c2.student.toString(), 'student not changed by PATCH');
  assert.ok(await SystemAuditLog.findOne({ action: 'liveClass.update', resourceId: String(c2._id) }));

  assert.equal((await agent.patch(`/api/v1/admin/live-classes/${c2._id}`).set(headers).send({ startsAt: 'not a date' })).status, 400);
  assert.equal((await agent.patch('/api/v1/admin/live-classes/0123456789abcdef01234567').set(headers).send({ notes: 'x' })).status, 404);
  assert.equal((await agent.delete('/api/v1/admin/live-classes/not-an-id').set(headers)).status, 404);

  const deleted = await agent.delete(`/api/v1/admin/live-classes/${c2._id}`).set(headers);
  assert.equal(deleted.status, 200);
  assert.equal(await LiveClass.findById(c2._id), null);
  assert.ok(await LiveClass.findById(c1._id), 'only the chosen class is deleted');
  assert.ok(await SystemAuditLog.findOne({ action: 'liveClass.delete', resourceId: String(c2._id) }));
});
