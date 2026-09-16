import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import CourseProgress from '../models/CourseProgress.js';
import Review from '../models/Review.js';
import { signToken } from '../utils/authCookie.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Auth hardening security batch (item 6c): createReview previously only
// checked for a duplicate review — any authenticated student could review
// ANY course/teacher id with no relationship to it at all. Now a course
// review requires a CourseProgress row for that course, and a teacher
// review requires req.user.teacher to match the target teacher id.

const PASSWORD = 'Stud3nt-Str0ng-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function studentAgent(overrides = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const user = await User.create({
    name: 'Student', email: `student-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'student', ...overrides,
  });
  const token = signToken(user._id, user.role, user.tokenVersion ?? 0);
  const cookieHeader = `token=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader, user };
}

test('a student with no CourseProgress row for a course is rejected with 403', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Great course', courseId: String(course._id) });

  assert.equal(res.status, 403);
  assert.match(res.body.message, /engaged/i);
  assert.equal(await Review.countDocuments({}), 0);
});

test('a student with a CourseProgress row for the course can review it', async () => {
  const { agent, csrf, cookieHeader, user } = await studentAgent();
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });
  await CourseProgress.create({ user: user._id, course: course._id });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Great course', courseId: String(course._id) });

  assert.equal(res.status, 201);
  assert.equal(res.body.review.course, String(course._id));
});

test('a student reviewing a teacher who is not their own req.user.teacher is rejected with 403', async () => {
  const teacher = await User.create({
    name: 'Teacher', email: `teacher-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'teacher',
  });
  const { agent, csrf, cookieHeader } = await studentAgent(); // no teacher assigned

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Great teacher', teacherId: String(teacher._id) });

  assert.equal(res.status, 403);
  assert.match(res.body.message, /assigned teacher/i);
  assert.equal(await Review.countDocuments({}), 0);
});

test('a student can review their own assigned teacher (req.user.teacher match)', async () => {
  const teacher = await User.create({
    name: 'Teacher', email: `teacher-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'teacher',
  });
  const { agent, csrf, cookieHeader } = await studentAgent({ teacher: teacher._id });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Great teacher', teacherId: String(teacher._id) });

  assert.equal(res.status, 201);
  assert.equal(res.body.review.teacher, String(teacher._id));
});

test('the duplicate-review check still applies after the relationship check passes', async () => {
  const { agent, csrf, cookieHeader, user } = await studentAgent();
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });
  await CourseProgress.create({ user: user._id, course: course._id });
  await Review.create({ student: user._id, course: course._id, rating: 4, body: 'First review' });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Second attempt', courseId: String(course._id) });

  assert.equal(res.status, 409);
});

// ---------------------------------------------------------------------------
// XOR: exactly one of teacherId/courseId, never both, never neither
// ---------------------------------------------------------------------------

test('a student with real CourseProgress for a course CANNOT pass that valid courseId together with a teacherId for a teacher not assigned to them — rejected 400, no Review created', async () => {
  const teacher = await User.create({
    name: 'Unrelated Teacher', email: `teacher-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'teacher',
  });
  const { agent, csrf, cookieHeader, user } = await studentAgent(); // no teacher assigned
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });
  await CourseProgress.create({ user: user._id, course: course._id });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Smuggle attempt', courseId: String(course._id), teacherId: String(teacher._id) });

  assert.equal(res.status, 400);
  assert.match(res.body.message, /not both/i);
  assert.equal(await Review.countDocuments({}), 0);
});

test('sending both teacherId and courseId is rejected with 400 even when both relationships are real/owned', async () => {
  const teacher = await User.create({
    name: 'My Teacher', email: `teacher-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'teacher',
  });
  const { agent, csrf, cookieHeader, user } = await studentAgent({ teacher: teacher._id });
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });
  await CourseProgress.create({ user: user._id, course: course._id });

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'Both at once', courseId: String(course._id), teacherId: String(teacher._id) });

  assert.equal(res.status, 400);
  assert.equal(await Review.countDocuments({}), 0);
});

test('sending neither teacherId nor courseId is rejected with 400', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();

  const res = await agent.post('/api/reviews')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ rating: 5, body: 'No target at all' });

  assert.equal(res.status, 400);
  assert.equal(await Review.countDocuments({}), 0);
});

test('model-level defense-in-depth: Review.create() rejects a document with both teacher and course set, even bypassing the controller entirely', async () => {
  const { user } = await studentAgent();
  const teacher = await User.create({
    name: 'Teacher', email: `teacher-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'teacher',
  });
  const course = await Course.create({ title: 'Tajweed 101', description: 'x', published: true });

  await assert.rejects(
    () => Review.create({ student: user._id, teacher: teacher._id, course: course._id, rating: 5, body: 'x' }),
    (err) => err.name === 'ValidationError',
  );
  assert.equal(await Review.countDocuments({}), 0);
});

test('model-level defense-in-depth: Review.create() rejects a document with neither teacher nor course set', async () => {
  const { user } = await studentAgent();

  await assert.rejects(
    () => Review.create({ student: user._id, rating: 5, body: 'x' }),
    (err) => err.name === 'ValidationError',
  );
  assert.equal(await Review.countDocuments({}), 0);
});
