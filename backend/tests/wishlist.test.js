import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Wishlist from '../models/Wishlist.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Feature Sprint 3 — the Wishlist model/controller/hook (useWishlist.js) were
// already fully built and even had a (partial, read-only) frontend test file,
// but had zero real UI consumers anywhere in the app, and zero backend test
// coverage. Investigation also found a genuine defect: addToWishlist's plain
// $addToSet does NOT dedupe, because each embedded course subdocument also
// carries an addedAt default (Date.now) that Mongoose re-casts fresh on every
// request — MongoDB's $addToSet compares the whole embedded document, so two
// adds of the same course a moment apart were never equal and both got
// pushed, silently defeating the "set" semantics. Fixed with an explicit
// ensure-then-conditional-push pattern instead.

const PASSWORD = 'Str0ngP@ssw0rd!';
const MALFORMED_ID = 'not-a-valid-object-id';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeStudentAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-${Date.now()}-${Math.random()}@example.com`;
  const user = await User.create({ name: 'Student', email, password: PASSWORD });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf, user };
}

// ---------------------------------------------------------------------------
// getWishlist
// ---------------------------------------------------------------------------

test('getWishlist: a brand-new user (no Wishlist document yet) gets an empty array, not an error', async () => {
  const { agent } = await makeStudentAgent();
  const res = await agent.get('/api/wishlist');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.courses, []);
});

test('getWishlist: rejects an unauthenticated request', async () => {
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get('/api/wishlist');
  assert.equal(res.status, 401);
});

test('getWishlist: returns populated course details, and only the caller\'s own wishlist', async () => {
  const course = await Course.create({ title: 'Tajweed Basics', description: 'x', level: 'Beginner' });
  const { agent, user } = await makeStudentAgent();
  const { user: otherUser } = await makeStudentAgent();
  await Wishlist.create({ user: user._id, courses: [{ course: course._id }] });
  await Wishlist.create({ user: otherUser._id, courses: [] });

  const res = await agent.get('/api/wishlist');
  assert.equal(res.status, 200);
  assert.equal(res.body.courses.length, 1);
  assert.equal(res.body.courses[0].course.title, 'Tajweed Basics');
});

// ---------------------------------------------------------------------------
// addToWishlist
// ---------------------------------------------------------------------------

test('addToWishlist: adds a real course to a new wishlist (upsert)', async () => {
  const course = await Course.create({ title: 'Hifz Programme', description: 'x' });
  const { agent, csrf, user } = await makeStudentAgent();

  const res = await agent.post('/api/wishlist').set(csrf).send({ courseId: course._id });
  assert.equal(res.status, 200);
  assert.equal(res.body.courses.length, 1);
  assert.equal(String(res.body.courses[0].course._id), String(course._id));

  const stored = await Wishlist.findOne({ user: user._id });
  assert.equal(stored.courses.length, 1);
});

test('addToWishlist: rejects when courseId is missing', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/wishlist').set(csrf).send({});
  assert.equal(res.status, 400);
});

test('addToWishlist: rejects a malformed courseId with 400, not a 500', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/wishlist').set(csrf).send({ courseId: MALFORMED_ID });
  assert.equal(res.status, 400);
});

test('addToWishlist: returns 404 for a well-formed id that isn\'t a real course', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/wishlist').set(csrf).send({ courseId: '000000000000000000000000' });
  assert.equal(res.status, 404);
});

test('addToWishlist: rejects an unauthenticated request', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/wishlist').set(csrf).send({ courseId: course._id });
  assert.equal(res.status, 401);
});

test('addToWishlist: duplicate prevention — adding the same course twice never produces two entries', async () => {
  const course = await Course.create({ title: 'Ijazah Programme', description: 'x' });
  const { agent, csrf, user } = await makeStudentAgent();

  const first  = await agent.post('/api/wishlist').set(csrf).send({ courseId: course._id });
  const second = await agent.post('/api/wishlist').set(csrf).send({ courseId: course._id });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.courses.length, 1, 'a repeat add must not create a duplicate entry');

  const stored = await Wishlist.findOne({ user: user._id });
  assert.equal(stored.courses.length, 1);
});

test('addToWishlist: two different courses both persist independently', async () => {
  const courseA = await Course.create({ title: 'Course A', description: 'x' });
  const courseB = await Course.create({ title: 'Course B', description: 'x' });
  const { agent, csrf } = await makeStudentAgent();

  await agent.post('/api/wishlist').set(csrf).send({ courseId: courseA._id });
  const res = await agent.post('/api/wishlist').set(csrf).send({ courseId: courseB._id });

  assert.equal(res.status, 200);
  assert.equal(res.body.courses.length, 2);
});

// ---------------------------------------------------------------------------
// removeFromWishlist
// ---------------------------------------------------------------------------

test('removeFromWishlist: removes a course that is present', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf, user } = await makeStudentAgent();
  await Wishlist.create({ user: user._id, courses: [{ course: course._id }] });

  const res = await agent.delete(`/api/wishlist/${course._id}`).set(csrf);
  assert.equal(res.status, 200);
  assert.equal(res.body.courses.length, 0);
});

test('removeFromWishlist: removing a course not in the wishlist is a harmless no-op', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf, user } = await makeStudentAgent();
  await Wishlist.create({ user: user._id, courses: [] });

  const res = await agent.delete(`/api/wishlist/${course._id}`).set(csrf);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.courses, []);
});

test('removeFromWishlist: no Wishlist document at all is a harmless no-op, not an error', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf } = await makeStudentAgent();

  const res = await agent.delete(`/api/wishlist/${course._id}`).set(csrf);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.courses, []);
});

test('removeFromWishlist: rejects a malformed courseId with 400, not a 500', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.delete(`/api/wishlist/${MALFORMED_ID}`).set(csrf);
  assert.equal(res.status, 400);
});

test('removeFromWishlist: rejects an unauthenticated request', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.delete(`/api/wishlist/${course._id}`).set(csrf);
  assert.equal(res.status, 401);
});

test('removeFromWishlist: only removes the caller\'s own wishlist entry, never another user\'s', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf } = await makeStudentAgent();
  const { user: otherUser } = await makeStudentAgent();
  await Wishlist.create({ user: otherUser._id, courses: [{ course: course._id }] });

  const res = await agent.delete(`/api/wishlist/${course._id}`).set(csrf);
  assert.equal(res.status, 200);

  const otherStored = await Wishlist.findOne({ user: otherUser._id });
  assert.equal(otherStored.courses.length, 1, 'another user\'s wishlist entry must be untouched');
});

// ---------------------------------------------------------------------------
// clearWishlist
// ---------------------------------------------------------------------------

test('clearWishlist: empties the caller\'s wishlist', async () => {
  const course = await Course.create({ title: 'x', description: 'x' });
  const { agent, csrf, user } = await makeStudentAgent();
  await Wishlist.create({ user: user._id, courses: [{ course: course._id }] });

  const res = await agent.delete('/api/wishlist/clear').set(csrf);
  assert.equal(res.status, 200);

  const stored = await Wishlist.findOne({ user: user._id });
  assert.equal(stored.courses.length, 0);
});

test('clearWishlist: rejects an unauthenticated request', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.delete('/api/wishlist/clear').set(csrf);
  assert.equal(res.status, 401);
});
