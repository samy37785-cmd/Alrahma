import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// AR-04, live classes on the Mongo backend.
//
// Before: GET/POST/PATCH/DELETE /api/classes let any regular account with
// role 'admin' (a password alone, no MFA, no IP allowlist) see every class
// with every student's and teacher's name and email, and add, edit or delete
// any class.
//
// Now a role 'admin' account has no class privilege at all: it is treated
// like any other account. Nothing else changes: no admin class management
// is added (/api/v1/admin/live-classes still answers 404 on Mongo), no
// account changes role or teacher, and the student, parent and teacher keep
// exactly the access they had.
//
// No real email: the mailer is replaced and every message is recorded.

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
const { signAccessToken } = await import('../utils/adminAuthTokens.js');

const PASSWORD = 'Str0ngP@ssw0rd!';
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY);
const FAKE_ID = '000000000000000000000000';

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

const titles = (res) => res.body.map((c) => c.title).sort();

// Every class and account exactly as seeded: nothing moved, nothing renamed.
async function assertUnchanged(s) {
  const classes = await LiveClass.find().sort('title').lean();
  assert.equal(classes.length, 2);
  assert.equal(String(classes[0].teacher), String(s.t1._id));
  assert.equal(String(classes[0].student), String(s.s1._id));
  assert.equal(classes[0].title, 'C1 TeacherOne/StudentOne');
  assert.equal(String(classes[1].teacher), String(s.t2._id));
  assert.equal(classes[1].title, 'C2 TeacherTwo/StudentTwo');
  const s1 = await User.findById(s.s1._id).lean();
  assert.equal(String(s1.teacher), String(s.t1._id), "the student's teacher is unchanged");
  const roleAdmin = await User.findById(s.roleAdmin._id).lean();
  assert.equal(roleAdmin.role, 'admin', 'no account changes role');
}

test('a role "admin" account no longer sees every class: it gets only its own (none), with no one else\'s name or email', async () => {
  const s = await seed();
  const { agent } = await loginAs(s.roleAdmin);
  for (const path of ['/api/classes', '/api/classes?upcoming=1']) {
    const res = await agent.get(path);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
    for (const person of [s.t1, s.t2, s.s1, s.s2]) {
      assert.ok(!JSON.stringify(res.body).includes(person.email), `${path} must not include ${person.name}'s email`);
    }
  }
});

test('a role "admin" account can no longer add, edit or delete any class (403), and nothing changes', async () => {
  const s = await seed();
  const { agent, csrf } = await loginAs(s.roleAdmin);
  const create = await agent.post('/api/classes').set(csrf).send({ student: s.s1._id, title: 'By role admin', startsAt: inDays(3) });
  assert.equal(create.status, 403);
  const patch = await agent.patch(`/api/classes/${s.c1._id}`).set(csrf).send({ title: 'Renamed by role admin' });
  assert.equal(patch.status, 403);
  const del = await agent.delete(`/api/classes/${s.c2._id}`).set(csrf);
  assert.equal(del.status, 403);
  await assertUnchanged(s);
  assert.equal(sent.length, 0, 'no email');
});

test('the student, the parent and each teacher still see exactly their own classes', async () => {
  const s = await seed();
  const cases = [
    [s.s1, ['C1 TeacherOne/StudentOne']],
    [s.parent, ['C1 TeacherOne/StudentOne']],
    [s.t1, ['C1 TeacherOne/StudentOne']],
    [s.t2, ['C2 TeacherTwo/StudentTwo']],
  ];
  for (const [user, want] of cases) {
    const { agent } = await loginAs(user);
    const res = await agent.get('/api/classes');
    assert.equal(res.status, 200, user.name);
    assert.deepEqual(titles(res), want, user.name);
    assert.equal(res.body[0].teacher.name, want[0].startsWith('C1') ? 'TeacherOne' : 'TeacherTwo');
  }
});

test('the student and the parent still cannot add, edit or delete a class (403)', async () => {
  const s = await seed();
  for (const user of [s.s1, s.parent]) {
    const { agent, csrf } = await loginAs(user);
    assert.equal((await agent.post('/api/classes').set(csrf).send({ student: s.s1._id, title: 'x', startsAt: inDays(3) })).status, 403, user.name);
    assert.equal((await agent.patch(`/api/classes/${s.c1._id}`).set(csrf).send({ title: 'x' })).status, 403, user.name);
    assert.equal((await agent.delete(`/api/classes/${s.c1._id}`).set(csrf)).status, 403, user.name);
  }
  await assertUnchanged(s);
});

test('a teacher still schedules, edits and deletes their own classes only, as before', async () => {
  const s = await seed();
  const { agent, csrf } = await loginAs(s.t1);

  // Another teacher's student, another teacher's class, an unknown class: 404.
  const otherStudent = await agent.post('/api/classes').set(csrf).send({ student: s.s2._id, title: 'Not mine', startsAt: inDays(3) });
  assert.equal(otherStudent.status, 404);
  assert.equal((await agent.patch(`/api/classes/${s.c2._id}`).set(csrf).send({ title: 'x' })).status, 404);
  assert.equal((await agent.delete(`/api/classes/${s.c2._id}`).set(csrf)).status, 404);
  assert.equal((await agent.patch(`/api/classes/${FAKE_ID}`).set(csrf).send({ title: 'x' })).status, 404);
  await assertUnchanged(s);
  assert.equal(sent.length, 0);

  // Own student: scheduled under this teacher, and the student is told.
  const create = await agent.post('/api/classes').set(csrf).send({ student: s.s1._id, title: 'New Tajweed', startsAt: inDays(4) });
  assert.equal(create.status, 201);
  assert.equal(create.body.teacher.name, 'TeacherOne');
  assert.equal(create.body.student.name, 'StudentOne');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, s.s1.email);

  // Own class: edit, then delete.
  const patch = await agent.patch(`/api/classes/${s.c1._id}`).set(csrf).send({ title: 'C1 renamed' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.title, 'C1 renamed');
  const del = await agent.delete(`/api/classes/${create.body._id}`).set(csrf);
  assert.equal(del.status, 200);

  // The other teacher's class and the student's assignment were never touched.
  const c2 = await LiveClass.findById(s.c2._id).lean();
  assert.equal(c2.title, 'C2 TeacherTwo/StudentTwo');
  assert.equal(String((await User.findById(s.s1._id).lean()).teacher), String(s.t1._id));
});

test('no admin class management is added: /api/v1/admin/live-classes still answers 404 on Mongo, even to a super-admin', async () => {
  const s = await seed();
  const admin = await AdminUser.create({
    name: 'Super', email: `super-${Date.now()}@example.com`, password: 'Sup3r-Str0ng-Pass!', role: 'super-admin', mfaEnabled: true,
  });
  const cookie = `admin_at=${signAccessToken(admin._id, admin.role, true)}`;
  const list = await request(app).get('/api/v1/admin/live-classes').set('Cookie', cookie);
  assert.equal(list.status, 404);
  assert.ok(!JSON.stringify(list.body).includes('C1 TeacherOne'));
  await assertUnchanged(s);
});
