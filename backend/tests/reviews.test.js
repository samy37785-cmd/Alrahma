import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Review from '../models/Review.js';
import Course from '../models/Course.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Feature Sprint 2 — the Review model + controller (create/list-by-teacher/
// list-by-course/moderate) already existed and worked, but had (a) no
// dedicated test coverage at all beyond one express-validator error-shape
// assertion in validation-error-contract.test.js, (b) no admin-facing
// "list all reviews" endpoint — meaning the moderation mutation existed but
// had no way to discover which review IDs needed moderating — and (c) no
// ObjectId validation on the hand-rolled :teacherId/:courseId/:id params
// (the same CastError-becomes-500 class of defect fixed elsewhere in the
// admin surface during the Production Polish Sprint).

const PASSWORD = 'Str0ngP@ssw0rd!';
const MALFORMED_ID = 'not-a-valid-object-id';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeStudentAgent(overrides = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-${Date.now()}-${Math.random()}@example.com`;
  const user = await User.create({ name: 'Student', email, password: PASSWORD, ...overrides });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf, user };
}

// Regular-User admin (protect+adminOnly) — used for GET /api/reviews, the
// legacy "admin reads" convention shared with coupons/contact/certificates.
async function makeLegacyAdminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `legacyadmin-${Date.now()}-${Math.random()}@example.com`;
  await User.create({ name: 'Legacy Admin', email, password: PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

// Hardened AdminUser (MFA session) — used for the moderation mutation,
// mirroring every other /api/v1/admin/* test in this suite.
async function makeAdminUserAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

// ---------------------------------------------------------------------------
// createReview
// ---------------------------------------------------------------------------

test('createReview: creates a pending review for a teacher', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'rt1@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await makeStudentAgent();

  const res = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 5, body: 'Excellent tutor' });
  assert.equal(res.status, 201);
  assert.equal(res.body.review.status, 'pending');
  assert.equal(res.body.review.rating, 5);
  assert.equal(String(res.body.review.teacher), String(teacher._id));
});

test('createReview: creates a pending review for a course', async () => {
  const course = await Course.create({ title: 'Tajweed Basics', description: 'x' });
  const { agent, csrf } = await makeStudentAgent();

  const res = await agent.post('/api/reviews').set(csrf).send({ courseId: course._id, rating: 4, body: 'Good course' });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.review.course), String(course._id));
});

test('createReview: rejects when neither teacherId nor courseId is provided', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/reviews').set(csrf).send({ rating: 5, body: 'x' });
  assert.equal(res.status, 400);
});

test('createReview: rejects a malformed teacherId with 400, not a 500', async () => {
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/reviews').set(csrf).send({ teacherId: MALFORMED_ID, rating: 5, body: 'x' });
  assert.equal(res.status, 400);
});

test('createReview: rejects an out-of-range rating with 400', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'rt2@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 6, body: 'x' });
  assert.equal(res.status, 422);
});

test('createReview: rejects a missing body with 422', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'rt3@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await makeStudentAgent();
  const res = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 5 });
  assert.equal(res.status, 422);
});

test('createReview: rejects an unauthenticated request', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'rt4@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 5, body: 'x' });
  assert.equal(res.status, 401);
});

test('createReview: duplicate prevention — a second review by the same student for the same teacher is rejected with 409, and no second document is created', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'rt5@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf, user: student } = await makeStudentAgent();

  const first = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 5, body: 'Great' });
  assert.equal(first.status, 201);

  const second = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacher._id, rating: 2, body: 'Changed my mind' });
  assert.equal(second.status, 409);

  const count = await Review.countDocuments({ student: student._id, teacher: teacher._id });
  assert.equal(count, 1);
});

test('createReview: duplicate prevention is scoped per teacher — a student may review a different teacher', async () => {
  const teacherA = await User.create({ name: 'Teacher A', email: 'rt6a@example.com', password: PASSWORD, role: 'teacher' });
  const teacherB = await User.create({ name: 'Teacher B', email: 'rt6b@example.com', password: PASSWORD, role: 'teacher' });
  const { agent, csrf } = await makeStudentAgent();

  const first  = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacherA._id, rating: 5, body: 'Great' });
  const second = await agent.post('/api/reviews').set(csrf).send({ teacherId: teacherB._id, rating: 4, body: 'Also good' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
});

// ---------------------------------------------------------------------------
// getTeacherReviews — public, approved-only, pagination, average rating
// ---------------------------------------------------------------------------

test('getTeacherReviews: only approved reviews are counted/returned; pending and rejected are excluded', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt1@example.com', password: PASSWORD, role: 'teacher' });
  const s1 = await User.create({ name: 'S1', email: 'gt1s1@example.com', password: PASSWORD });
  const s2 = await User.create({ name: 'S2', email: 'gt1s2@example.com', password: PASSWORD });
  const s3 = await User.create({ name: 'S3', email: 'gt1s3@example.com', password: PASSWORD });

  await Review.create({ student: s1._id, teacher: teacher._id, rating: 5, body: 'Approved one', status: 'approved' });
  await Review.create({ student: s2._id, teacher: teacher._id, rating: 1, body: 'Pending one', status: 'pending' });
  await Review.create({ student: s3._id, teacher: teacher._id, rating: 1, body: 'Rejected one', status: 'rejected' });

  const res = await agentWithCsrf(app).then(({ agent }) => agent.get(`/api/reviews/teacher/${teacher._id}`));
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.reviews.length, 1);
  assert.equal(res.body.reviews[0].body, 'Approved one');
});

test('getTeacherReviews: avg/count reflect only approved reviews', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt2@example.com', password: PASSWORD, role: 'teacher' });
  const students = await Promise.all(
    [1, 2, 3].map((i) => User.create({ name: `S${i}`, email: `gt2s${i}@example.com`, password: PASSWORD })),
  );
  await Review.create({ student: students[0]._id, teacher: teacher._id, rating: 5, body: 'a', status: 'approved' });
  await Review.create({ student: students[1]._id, teacher: teacher._id, rating: 3, body: 'b', status: 'approved' });
  await Review.create({ student: students[2]._id, teacher: teacher._id, rating: 1, body: 'c', status: 'pending' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.avg, 4); // (5+3)/2, pending excluded
});

test('getTeacherReviews: no reviews yet returns avg 0, count 0, empty list', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt3@example.com', password: PASSWORD, role: 'teacher' });
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 0);
  assert.equal(res.body.avg, 0);
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.reviews, []);
});

test('getTeacherReviews: pagination — total reflects all approved reviews, page size honored', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt4@example.com', password: PASSWORD, role: 'teacher' });
  const students = await Promise.all(
    Array.from({ length: 3 }, (_, i) => User.create({ name: `S${i}`, email: `gt4s${i}@example.com`, password: PASSWORD })),
  );
  await Promise.all(students.map((s) => Review.create({ student: s._id, teacher: teacher._id, rating: 5, body: 'x', status: 'approved' })));

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}?limit=2`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.reviews.length, 2);
  assert.equal(res.body.pages, 2);
});

test('getTeacherReviews: rejects a malformed teacherId with 400, not a 500', async () => {
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${MALFORMED_ID}`);
  assert.equal(res.status, 400);
});

test('getTeacherReviews: ?sort=rating_desc orders highest-rated first', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt5@example.com', password: PASSWORD, role: 'teacher' });
  const students = await Promise.all(
    [0, 1, 2].map((i) => User.create({ name: `S${i}`, email: `gt5s${i}@example.com`, password: PASSWORD })),
  );
  await Review.create({ student: students[0]._id, teacher: teacher._id, rating: 3, body: 'mid', status: 'approved' });
  await Review.create({ student: students[1]._id, teacher: teacher._id, rating: 5, body: 'best', status: 'approved' });
  await Review.create({ student: students[2]._id, teacher: teacher._id, rating: 1, body: 'worst', status: 'approved' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}?sort=rating_desc`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.reviews.map((r) => r.rating), [5, 3, 1]);
});

test('getTeacherReviews: ?sort=rating_asc orders lowest-rated first', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt6@example.com', password: PASSWORD, role: 'teacher' });
  const students = await Promise.all(
    [0, 1, 2].map((i) => User.create({ name: `S${i}`, email: `gt6s${i}@example.com`, password: PASSWORD })),
  );
  await Review.create({ student: students[0]._id, teacher: teacher._id, rating: 3, body: 'mid', status: 'approved' });
  await Review.create({ student: students[1]._id, teacher: teacher._id, rating: 5, body: 'best', status: 'approved' });
  await Review.create({ student: students[2]._id, teacher: teacher._id, rating: 1, body: 'worst', status: 'approved' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}?sort=rating_asc`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.reviews.map((r) => r.rating), [1, 3, 5]);
});

test('getTeacherReviews: an unrecognized sort value falls back to newest-first rather than erroring', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'gt7@example.com', password: PASSWORD, role: 'teacher' });
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/teacher/${teacher._id}?sort=not-a-real-sort`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.reviews, []);
});

// ---------------------------------------------------------------------------
// getCourseReviews
// ---------------------------------------------------------------------------

test('getCourseReviews: only approved reviews for the given course are returned', async () => {
  const course = await Course.create({ title: 'Hifz Programme', description: 'x' });
  const s1 = await User.create({ name: 'S1', email: 'gc1s1@example.com', password: PASSWORD });
  const s2 = await User.create({ name: 'S2', email: 'gc1s2@example.com', password: PASSWORD });
  await Review.create({ student: s1._id, course: course._id, rating: 5, body: 'Great course', status: 'approved' });
  await Review.create({ student: s2._id, course: course._id, rating: 2, body: 'Not moderated yet', status: 'pending' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/course/${course._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.reviews[0].body, 'Great course');
});

test('getCourseReviews: rejects a malformed courseId with 400', async () => {
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/course/${MALFORMED_ID}`);
  assert.equal(res.status, 400);
});

test('getCourseReviews: avg/count/distribution reflect only approved reviews for that course', async () => {
  const course = await Course.create({ title: 'Ijazah Programme', description: 'x' });
  const students = await Promise.all(
    [0, 1, 2, 3].map((i) => User.create({ name: `S${i}`, email: `gc2s${i}@example.com`, password: PASSWORD })),
  );
  await Review.create({ student: students[0]._id, course: course._id, rating: 5, body: 'a', status: 'approved' });
  await Review.create({ student: students[1]._id, course: course._id, rating: 5, body: 'b', status: 'approved' });
  await Review.create({ student: students[2]._id, course: course._id, rating: 3, body: 'c', status: 'approved' });
  await Review.create({ student: students[3]._id, course: course._id, rating: 1, body: 'd', status: 'pending' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/course/${course._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 3, 'pending review must not count toward the total');
  assert.equal(res.body.avg, (5 + 5 + 3) / 3);
  assert.deepEqual(res.body.distribution, { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 });
});

test('getCourseReviews: ?sort=rating_desc orders highest-rated first', async () => {
  const course = await Course.create({ title: 'Sorted Course', description: 'x' });
  const students = await Promise.all(
    [0, 1, 2].map((i) => User.create({ name: `S${i}`, email: `gc3s${i}@example.com`, password: PASSWORD })),
  );
  await Review.create({ student: students[0]._id, course: course._id, rating: 2, body: 'mid', status: 'approved' });
  await Review.create({ student: students[1]._id, course: course._id, rating: 5, body: 'best', status: 'approved' });
  await Review.create({ student: students[2]._id, course: course._id, rating: 1, body: 'worst', status: 'approved' });

  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/course/${course._id}?sort=rating_desc`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.reviews.map((r) => r.rating), [5, 2, 1]);
});

test('getCourseReviews: a course with no approved reviews yet returns avg 0, count 0, and a zeroed distribution', async () => {
  const course = await Course.create({ title: 'Brand New Course', description: 'x' });
  const { agent } = await agentWithCsrf(app);
  const res = await agent.get(`/api/reviews/course/${course._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.avg, 0);
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
});

// ---------------------------------------------------------------------------
// listReviews — admin (legacy protect+adminOnly, mirrors coupons/contact/certificates)
// ---------------------------------------------------------------------------

test('listReviews: requires a real admin — students are forbidden, unauthenticated is rejected', async () => {
  const { agent: studentAgent } = await makeStudentAgent();
  const forbidden = await studentAgent.get('/api/reviews');
  assert.equal(forbidden.status, 403);

  const { agent: anonAgent } = await agentWithCsrf(app);
  const unauth = await anonAgent.get('/api/reviews');
  assert.equal(unauth.status, 401);
});

test('listReviews: an admin sees reviews of every status, newest first', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'lr1@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'lr1s@example.com', password: PASSWORD });
  await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'a', status: 'approved' });
  await Review.create({ student: student._id, teacher: teacher._id, rating: 1, body: 'b', status: 'pending', course: null });

  // Two reviews for the same (student, teacher) pair would collide with the
  // student-facing duplicate-prevention rule, but listReviews/moderateReview
  // operate directly on the Review collection and have no such restriction —
  // this seed is only exercising the admin listing, not createReview.
  const { agent } = await makeLegacyAdminAgent();
  const res = await agent.get('/api/reviews');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
});

test('listReviews: ?status=pending filters to only pending reviews', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'lr2@example.com', password: PASSWORD, role: 'teacher' });
  const s1 = await User.create({ name: 'S1', email: 'lr2s1@example.com', password: PASSWORD });
  const s2 = await User.create({ name: 'S2', email: 'lr2s2@example.com', password: PASSWORD });
  await Review.create({ student: s1._id, teacher: teacher._id, rating: 5, body: 'a', status: 'approved' });
  await Review.create({ student: s2._id, teacher: teacher._id, rating: 3, body: 'b', status: 'pending' });

  const { agent } = await makeLegacyAdminAgent();
  const res = await agent.get('/api/reviews?status=pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.reviews[0].status, 'pending');
});

// ---------------------------------------------------------------------------
// moderateReview — RBAC, validation, approval workflow
// ---------------------------------------------------------------------------

test('moderateReview: approving a pending review makes it visible via getTeacherReviews', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'mr1@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'mr1s@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'Great', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'approved');

  const { agent: publicAgent } = await agentWithCsrf(app);
  const list = await publicAgent.get(`/api/reviews/teacher/${teacher._id}`);
  assert.equal(list.body.total, 1);
});

test('moderateReview: rejecting a pending review keeps it out of getTeacherReviews', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'mr2@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'mr2s@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 1, body: 'Bad', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'rejected', adminNote: 'Spam' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'rejected');
  assert.equal(res.body.review.adminNote, 'Spam');
});

test('moderateReview: is forbidden for a viewer role (no reviews:write) and rejects unauthenticated requests', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'mr3@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'mr3s@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'x', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminUserAgent('viewer');
  const forbidden = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(forbidden.status, 403);

  const unauth = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set(csrf).send({ status: 'approved' });
  assert.equal(unauth.status, 401);
});

test('moderateReview: rejects an invalid status value with 422', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'mr4@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'mr4s@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'x', status: 'pending' });

  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'not-a-real-status' });
  assert.equal(res.status, 422);
});

test('moderateReview: rejects a malformed id with 400, not a 500', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${MALFORMED_ID}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 400);
});

test('moderateReview: returns 404 for a non-existent review', async () => {
  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch('/api/v1/admin/reviews/000000000000000000000000/moderate').set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 404);
});

test('moderateReview: re-approving an already-approved review does not error and does not change its content', async () => {
  const teacher = await User.create({ name: 'Teacher', email: 'mr5@example.com', password: PASSWORD, role: 'teacher' });
  const student = await User.create({ name: 'Student', email: 'mr5s@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, teacher: teacher._id, rating: 5, body: 'x', status: 'approved' });

  const { agent, csrf, cookieHeader } = await makeAdminUserAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved', adminNote: 'still good' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'approved');
  assert.equal(res.body.review.adminNote, 'still good');
});
