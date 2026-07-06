import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Certificate from '../models/Certificate.js';
import Message from '../models/Message.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T5: ~50 read-only queries across the backend were converted
// to .lean() (courseController, certificateController, messageController,
// parentController, teacherController, liveClassController, and more) —
// none of these previously had direct test coverage, so the full backend
// suite passing unchanged wasn't itself proof for these specific endpoints.
// These tests hit the real HTTP routes end-to-end and verify response
// shape/values are exactly what a hydrated Mongoose document would have
// produced — focused on the highest-risk category: queries combining
// .populate() with .lean() (populate still works, since only the
// top-level Document wrapper is skipped, not the underlying field values).

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeAdminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `admin${Date.now()}${Math.random()}@example.com`;
  await User.create({ name: 'Admin', email, password: PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

// ---------------------------------------------------------------------------
// courseController.getCourses (simple lean list)
// ---------------------------------------------------------------------------

test('GET /api/courses: returns the real published course with correct field types (ObjectId/Date serialize identically under lean)', async () => {
  const course = await Course.create({ title: 'Tajweed Basics', description: 'Learn the rules', published: true });
  await Course.create({ title: 'Unpublished', description: 'x', published: false });

  const res = await request(app).get('/api/courses');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0]._id, String(course._id));
  assert.equal(res.body[0].title, 'Tajweed Basics');
  assert.equal(typeof res.body[0].createdAt, 'string'); // Date -> ISO string, same as hydrated
  assert.equal(res.body[0].resources, undefined); // excluded by .select()
});

// ---------------------------------------------------------------------------
// certificateController — populate + lean
// ---------------------------------------------------------------------------

test('certificates: issue -> list (admin) -> mine (student), populated course field intact under lean', async () => {
  const course = await Course.create({ title: 'Hifz Program', description: 'x', published: true });
  const { agent: adminAgent, csrf: adminCsrf } = await makeAdminAgent();
  const { agent: studentAgent, csrf: studentCsrf } = await agentWithCsrf(app);
  const studentEmail = `cert-student-${Date.now()}@example.com`;
  await studentAgent.post('/api/auth/register').set(studentCsrf).send({ name: 'Student', email: studentEmail, password: PASSWORD });
  const student = await User.findOne({ email: studentEmail });

  await Certificate.create({ user: student._id, studentName: student.name, title: 'Ijazah', type: 'ijazah', course: course._id });

  const listRes = await adminAgent.get('/api/certificates').set(adminCsrf);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].course.title, 'Hifz Program'); // populate survives .lean()

  const mineRes = await studentAgent.get('/api/certificates/mine');
  assert.equal(mineRes.status, 200);
  assert.equal(mineRes.body.length, 1);
  assert.equal(mineRes.body[0].course.title, 'Hifz Program');
  assert.equal(mineRes.body[0].studentName, student.name);
});

// ---------------------------------------------------------------------------
// messageController — $or query + lean
// ---------------------------------------------------------------------------

test('messages: a conversation between an assigned teacher/student returns messages both ways, correctly ordered', async () => {
  const { agent: teacherAgent, csrf: teacherCsrf } = await agentWithCsrf(app);
  const teacherEmail = `teacher-msg-${Date.now()}@example.com`;
  await User.create({ name: 'Teacher', email: teacherEmail, password: PASSWORD, role: 'teacher' });
  await teacherAgent.post('/api/auth/login').set(teacherCsrf).send({ email: teacherEmail, password: PASSWORD });
  const teacher = await User.findOne({ email: teacherEmail });

  const { agent: studentAgent, csrf: studentCsrf } = await agentWithCsrf(app);
  const studentEmail = `student-msg-${Date.now()}@example.com`;
  await studentAgent.post('/api/auth/register').set(studentCsrf).send({ name: 'Student', email: studentEmail, password: PASSWORD });
  const student = await User.findOne({ email: studentEmail });
  student.teacher = teacher._id;
  await student.save({ validateBeforeSave: false });

  await Message.create({ from: student._id, to: teacher._id, body: 'Hello teacher', createdAt: new Date('2026-01-01') });
  await Message.create({ from: teacher._id, to: student._id, body: 'Hello student', createdAt: new Date('2026-01-02') });

  const res = await studentAgent.get(`/api/messages/${teacher._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body.map((m) => m.body), ['Hello teacher', 'Hello student']);

  // getContacts: student -> their teacher, with unread count + last message
  const contactsRes = await studentAgent.get('/api/messages/contacts');
  assert.equal(contactsRes.status, 200);
  assert.equal(contactsRes.body.length, 1);
  assert.equal(contactsRes.body[0]._id, String(teacher._id));
  assert.equal(contactsRes.body[0].lastMessage.body, 'Hello student');
});

// ---------------------------------------------------------------------------
// parentController — populate + lean, nested summaries
// ---------------------------------------------------------------------------

test('parent: link a child, then list children with correct summary fields', async () => {
  const { agent: parentAgent, csrf: parentCsrf } = await agentWithCsrf(app);
  const parentEmail = `parent-${Date.now()}@example.com`;
  await User.create({ name: 'Parent', email: parentEmail, password: PASSWORD, role: 'parent' });
  await parentAgent.post('/api/auth/login').set(parentCsrf).send({ email: parentEmail, password: PASSWORD });

  const child = await User.create({ name: 'Child', email: `child-${Date.now()}@example.com`, password: PASSWORD, parentLinkCode: 'ABC12345' });

  const linkRes = await parentAgent.post('/api/parent/link').set(parentCsrf).send({ code: 'ABC12345' });
  assert.equal(linkRes.status, 201);
  assert.equal(linkRes.body._id, String(child._id));

  const childrenRes = await parentAgent.get('/api/parent/children');
  assert.equal(childrenRes.status, 200);
  assert.equal(childrenRes.body.length, 1);
  assert.equal(childrenRes.body[0]._id, String(child._id));
  assert.equal(childrenRes.body[0].name, 'Child');
  assert.equal(childrenRes.body[0].recordCount, 0);
  assert.equal(childrenRes.body[0].memorizedVerses, 0);

  const detailRes = await parentAgent.get(`/api/parent/children/${child._id}`);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.student.name, 'Child');
  assert.deepEqual(detailRes.body.records, []);
  assert.deepEqual(detailRes.body.hifz, []);
  assert.deepEqual(detailRes.body.courses, []);
});
