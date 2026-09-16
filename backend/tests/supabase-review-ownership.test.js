import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { mock } from 'node:test';

// Auth hardening security batch (item 6c), Supabase-mode counterpart of
// tests/review-ownership.test.js: createReview previously only checked for
// a duplicate review — any authenticated user could review ANY course/
// teacher id with no relationship to it at all. Now a course review
// requires a course_progress row for that course, and a teacher review
// requires req.user.teacher (profiles.teacher_id) to match the target.
//
// Same approach as tests/supabase-live-classes-admin.test.js: intercept
// withUserContext() via node:test's module-mock support and inspect/drive
// the real query text the controller builds, against a fake in-memory `pg`
// client — no real Postgres/Supabase connection is made. req.user is built
// directly (bypassing protect()/loadUserById()) since only createReview's
// own logic is under test here, matching that file's direct-controller-call
// convention.
const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
const controllerUrl = pathToFileURL(path.resolve('data/supabase/reviewController.js')).href;

let calls;
let hasCourseProgress;
let hasDuplicate;
let insertedRow;

function makeFakeClient() {
  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^\s*SELECT 1 FROM course_progress/.test(sql)) {
        return { rows: hasCourseProgress ? [{ '?column?': 1 }] : [] };
      }
      if (/^\s*SELECT id FROM reviews/.test(sql)) {
        return { rows: hasDuplicate ? [{ id: 'existing-review-id' }] : [] };
      }
      if (/^\s*INSERT INTO reviews/.test(sql)) {
        insertedRow = {
          id: 'new-review-id',
          student_id: params[0],
          teacher_id: params[1],
          course_id: params[2],
          rating: params[3],
          title: params[4],
          body: params[5],
          status: 'pending',
          helpful: 0,
          created_at: new Date().toISOString(),
        };
        return { rows: [insertedRow] };
      }
      throw new Error(`unexpected query in test fake client: ${sql}`);
    },
  };
}

let createReview;

before(async () => {
  const realClientModule = await import(clientUrl);
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: async (userId, fn) => fn(makeFakeClient()),
    },
  });
  ({ createReview } = await import(controllerUrl));
});

after(() => {
  mock.reset();
});

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

test.beforeEach(() => {
  calls = [];
  hasCourseProgress = false;
  hasDuplicate = false;
  insertedRow = null;
});

test('a user with no course_progress row for a course is rejected with 403, and no INSERT is attempted', async () => {
  hasCourseProgress = false;
  const req = { user: { _id: 'user-a', name: 'User A', teacher: null }, body: { rating: 5, body: 'Great course', courseId: 'course-1' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /engaged/i);
  assert.ok(!calls.some((c) => /^\s*INSERT INTO reviews/.test(c.sql)), 'no INSERT should have been attempted');
});

test('a user with a course_progress row for the course can review it', async () => {
  hasCourseProgress = true;
  const req = { user: { _id: 'user-a', name: 'User A', teacher: null }, body: { rating: 5, body: 'Great course', courseId: 'course-1' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.review.course, 'course-1');
});

test('a user reviewing a teacher who is not their own req.user.teacher is rejected with 403, before withUserContext ever runs', async () => {
  const req = { user: { _id: 'user-a', name: 'User A', teacher: 'teacher-x' }, body: { rating: 5, body: 'Great teacher', teacherId: 'teacher-y' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /assigned teacher/i);
  assert.equal(calls.length, 0, 'withUserContext should never run when the top-level teacher check fails');
});

test('a user can review their own assigned teacher (req.user.teacher match)', async () => {
  const req = { user: { _id: 'user-a', name: 'User A', teacher: 'teacher-x' }, body: { rating: 5, body: 'Great teacher', teacherId: 'teacher-x' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.review.teacher, 'teacher-x');
});

test('the duplicate-review check still applies after the relationship check passes', async () => {
  hasCourseProgress = true;
  hasDuplicate = true;
  const req = { user: { _id: 'user-a', name: 'User A', teacher: null }, body: { rating: 5, body: 'Second attempt', courseId: 'course-1' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 409);
});

// ---------------------------------------------------------------------------
// XOR: exactly one of teacherId/courseId, never both, never neither
// ---------------------------------------------------------------------------

test('a user with real course_progress for a course CANNOT pass that valid courseId together with a teacherId for a teacher not assigned to them — rejected 400, no query attempted at all', async () => {
  hasCourseProgress = true; // would pass ownership if the courseId branch alone were checked
  const req = {
    user: { _id: 'user-a', name: 'User A', teacher: 'teacher-x' }, // real assigned teacher, but not the one sent below
    body: { rating: 5, body: 'Smuggle attempt', courseId: 'course-1', teacherId: 'teacher-y' },
  };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /not both/i);
  assert.equal(calls.length, 0, 'no DB query should be attempted when both ids are sent');
});

test('sending both teacherId and courseId is rejected with 400 even when both relationships are real/owned', async () => {
  hasCourseProgress = true;
  const req = {
    user: { _id: 'user-a', name: 'User A', teacher: 'teacher-x' },
    body: { rating: 5, body: 'Both at once', courseId: 'course-1', teacherId: 'teacher-x' },
  };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('sending neither teacherId nor courseId is rejected with 400', async () => {
  const req = { user: { _id: 'user-a', name: 'User A', teacher: null }, body: { rating: 5, body: 'No target at all' } };
  const res = fakeRes();

  await createReview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});
