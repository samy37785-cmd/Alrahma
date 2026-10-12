import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Regression: the admin-only adminNote must never appear in a student- or
// public-facing response, on either data backend, while the admin routes
// keep returning it. Nothing else in the client contract changes: the exact-
// contract tests compare each response with the stored record minus
// adminNote (the student's own payment fields and Mongo's __v included). Every record is seeded with a distinctive marker in
// adminNote; each check asserts the marker string appears nowhere in the
// client response (or in any log line), not just that one key is missing.
//
// The Mongo path runs against the local in-memory replica set. The Supabase
// controllers run against an in-memory fake of data/supabase/client.js that
// returns rows WITH admin_note, proving the allowlist (not the query) is
// what keeps the field out. No SMTP, network or Production connection.

const MARKER = 'ADMIN-ONLY-NOTE-7f3c9e1b';

const supabaseQueries = [];
let supabaseRows = { enrollment: null, reviews: [] };
const notUsed = (name) => () => { throw new Error(`${name} is not used by these tests`); };
const fakeClient = {
  query: async (sql, params) => {
    supabaseQueries.push({ sql, params });
    if (/FROM enrollments/.test(sql)) return { rows: supabaseRows.enrollment ? [supabaseRows.enrollment] : [] };
    if (/count\(\*\)::int AS n FROM reviews_public/.test(sql)) return { rows: [{ n: supabaseRows.reviews.length }] };
    if (/avg\(rating\)/.test(sql)) return { rows: [{ avg: 5, count: supabaseRows.reviews.length }] };
    if (/FROM reviews_public/.test(sql)) return { rows: supabaseRows.reviews };
    throw new Error('unexpected query in test');
  },
};
mock.module('../data/supabase/client.js', {
  namedExports: {
    buildPgPoolConfig: notUsed('buildPgPoolConfig'),
    getPool: notUsed('getPool'),
    withServiceRole: notUsed('withServiceRole'),
    closePool: async () => {},
    withUserContext: async (_userId, fn) => fn(fakeClient),
    withAnonContext: async (fn) => fn(fakeClient),
  },
});
mock.module('../config/mailer.js', {
  namedExports: { sendMail: async () => {}, ADMIN_EMAIL: () => '' },
});

const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: AdminUser } = await import('../models/AdminUser.js');
const { default: Enrollment } = await import('../models/Enrollment.js');
const { default: Review } = await import('../models/Review.js');
const { default: logger } = await import('../config/logger.js');
const { signToken } = await import('../utils/authCookie.js');
const { signAccessToken } = await import('../utils/adminAuthTokens.js');
const { default: supabaseEnrollmentRoutes } = await import('../data/supabase/routes/enrollmentRoutes.js');
const { default: supabaseReviewRoutes } = await import('../data/supabase/routes/reviewRoutes.js');
const {
  ENROLLMENT_CLIENT_FIELDS, REVIEW_CLIENT_FIELDS, toClientEnrollment, toClientReview,
} = await import('../utils/clientViews.js');

// Supabase routers on a minimal app. `protect` still resolves the caller
// from Mongo here (DATA_BACKEND is not supabase in tests), which is fine:
// only the controller's data access is under test.
const supabaseApp = express();
supabaseApp.use(express.json());
supabaseApp.use('/api/enrollments', supabaseEnrollmentRoutes);
supabaseApp.use('/api/reviews', supabaseReviewRoutes);
supabaseApp.use((err, _req, res, _next) => res.status(500).json({ message: 'test app error' }));

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => {
  await clearTestDb();
  supabaseQueries.length = 0;
  supabaseRows = { enrollment: null, reviews: [] };
});

const ADMIN_ONLY_ENROLLMENT_FIELDS = ['adminNote'];
// Part of the student's existing /mine contract; must stay in the response.
const STUDENT_PAYMENT_FIELDS = ['agreedAmount', 'currency', 'paymentMethodExternal', 'paidAt', 'renewalAt'];
// Every key the Supabase mapRow() produced for /mine before this change, minus adminNote.
const SUPABASE_MINE_KEYS = [
  '_id', 'name', 'email', 'whatsapp', 'country', 'city', 'timezone', 'times', 'subjects', 'lang', 'level',
  'ageGroup', 'genderPref', 'teacherId', 'teacherName', 'plan', 'status', 'notes', 'bookingRef',
  ...STUDENT_PAYMENT_FIELDS, 'createdAt', 'updatedAt',
];
const asJson = (v) => JSON.parse(JSON.stringify(v));
// eslint-disable-next-line no-unused-vars
const withoutAdminNote = ({ adminNote, ...rest }) => rest;

let seq = 0;
async function makeStudent(role = 'student') {
  seq += 1;
  const user = await User.create({
    name: `Student ${seq}`, email: `student-${seq}-${Date.now()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  return { user, auth: { Authorization: `Bearer ${signToken(user._id.toString(), user.role, user.tokenVersion ?? 0)}` } };
}

async function adminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: 'Admin', email: `admin-${Date.now()}-${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role: 'admin',
  });
  const token = signAccessToken(admin._id, admin.role, true);
  return { agent, csrf, cookieHeader: `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}` };
}

const FULL_BOOKING = {
  name: 'Amina Student', whatsapp: '+447700900000', country: 'United Kingdom', city: 'London',
  timezone: 'Europe/London', times: ['morning'], subjects: ['quran'], lang: 'en', level: 'beginner',
  ageGroup: 'adult', genderPref: 'no_preference', teacherId: 3, teacherName: 'Ustadh Ali', plan: 'Huffaz',
  status: 'awaiting_payment', notes: 'Weekday evenings', bookingRef: 'AR-20261011-TEST',
  agreedAmount: 40, currency: 'GBP', paymentMethodExternal: 'bank transfer',
  paidAt: new Date('2026-10-01T00:00:00Z'), renewalAt: new Date('2026-11-01T00:00:00Z'),
  adminNote: MARKER,
};

function supabaseEnrollmentRow(email) {
  return {
    id: '11111111-1111-4111-8111-111111111111', name: FULL_BOOKING.name, email,
    whatsapp: FULL_BOOKING.whatsapp, country: FULL_BOOKING.country, city: FULL_BOOKING.city,
    timezone: FULL_BOOKING.timezone, times: FULL_BOOKING.times, subjects: FULL_BOOKING.subjects,
    lang: FULL_BOOKING.lang, level: FULL_BOOKING.level, age_group: FULL_BOOKING.ageGroup,
    gender_pref: FULL_BOOKING.genderPref, preferred_teacher_key: FULL_BOOKING.teacherId,
    preferred_teacher_name: FULL_BOOKING.teacherName, requested_plan_slug: FULL_BOOKING.plan,
    status: FULL_BOOKING.status, notes: FULL_BOOKING.notes, booking_ref: FULL_BOOKING.bookingRef,
    // Present on the fake row on purpose: the allowlist must drop them even
    // if a future query selected them again.
    agreed_amount: 40, currency: 'GBP', payment_method_external: 'bank transfer',
    paid_at: '2026-10-01T00:00:00Z', renewal_at: '2026-11-01T00:00:00Z', admin_note: MARKER,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
  };
}

function captureLogs(t) {
  const lines = [];
  for (const level of ['error', 'warn', 'info', 'http', 'debug']) {
    t.mock.method(logger, level, (...args) => { lines.push(args); return logger; });
  }
  return lines;
}

function assertNoAdminData(body, label) {
  const json = JSON.stringify(body);
  assert.ok(!json.includes(MARKER), `${label}: adminNote value leaked`);
  assert.ok(!/adminNote|admin_note/.test(json), `${label}: adminNote key leaked`);
}

// ── Allowlist helpers ──────────────────────────────────────────────────────

test('allowlists exclude adminNote and keep every other schema field', () => {
  for (const f of ADMIN_ONLY_ENROLLMENT_FIELDS) assert.ok(!ENROLLMENT_CLIENT_FIELDS.includes(f), f);
  assert.ok(!REVIEW_CLIENT_FIELDS.includes('adminNote'));
  const enrollmentSchema = Object.keys(Enrollment.schema.paths).filter((k) => k !== 'adminNote');
  assert.deepEqual([...ENROLLMENT_CLIENT_FIELDS].sort(), enrollmentSchema.sort());
  const reviewSchema = Object.keys(Review.schema.paths).filter((k) => k !== 'adminNote');
  assert.deepEqual([...REVIEW_CLIENT_FIELDS].sort(), reviewSchema.sort());
});

test('toClientEnrollment copies only allowlisted fields; unknown future fields stay hidden', () => {
  const out = toClientEnrollment({ ...FULL_BOOKING, _id: 'x', __v: 0, someNewInternalField: 'secret' });
  for (const key of Object.keys(out)) assert.ok(ENROLLMENT_CLIENT_FIELDS.includes(key), key);
  for (const f of [...ADMIN_ONLY_ENROLLMENT_FIELDS, 'someNewInternalField']) assert.equal(out[f], undefined, f);
  for (const f of STUDENT_PAYMENT_FIELDS) assert.deepEqual(out[f], FULL_BOOKING[f], f);
  assert.equal(out.__v, 0);
  assert.equal(out.bookingRef, FULL_BOOKING.bookingRef);
  assert.equal(toClientEnrollment(null), null);
});

test('toClientReview trims a populated student to { _id, name }', () => {
  const out = toClientReview({
    _id: 'r1', rating: 5, body: 'b', adminNote: MARKER, __v: 0,
    student: { _id: 's1', name: 'Amina', email: 'leak@example.com', role: 'student' },
  });
  assert.deepEqual(out.student, { _id: 's1', name: 'Amina' });
  assertNoAdminData(out, 'toClientReview');
  assert.equal(out.__v, 0);
});

// ── GET /api/enrollments/mine ──────────────────────────────────────────────

test('mongo /mine: exact previous contract minus adminNote (payment fields and __v kept)', async () => {
  const { user, auth } = await makeStudent();
  await Enrollment.create({ ...FULL_BOOKING, email: user.email });

  const res = await request(app).get('/api/enrollments/mine').set(auth);
  assert.equal(res.status, 200);
  assertNoAdminData(res.body, 'mongo /mine');
  for (const f of ADMIN_ONLY_ENROLLMENT_FIELDS) assert.equal(res.body[f], undefined, f);
  // Exact contract: what /mine returned before (the whole stored document) minus adminNote.
  const stored = await Enrollment.findOne({ email: user.email }).lean();
  assert.deepEqual(res.body, asJson(withoutAdminNote(stored)));
  for (const f of STUDENT_PAYMENT_FIELDS) assert.ok(res.body[f] !== undefined, `${f} must stay in /mine`);
  assert.equal(res.body.__v, 0);
  assert.equal(res.body.bookingRef, FULL_BOOKING.bookingRef);
  assert.equal(res.body.teacherName, FULL_BOOKING.teacherName);
  assert.deepEqual(res.body.subjects, FULL_BOOKING.subjects);
  assert.equal(res.body.status, FULL_BOOKING.status);
  assert.equal(res.body.notes, FULL_BOOKING.notes);
  assert.ok(res.body._id && res.body.createdAt);
});

test('mongo /mine: no booking still returns null', async () => {
  const { auth } = await makeStudent();
  const res = await request(app).get('/api/enrollments/mine').set(auth);
  assert.equal(res.status, 200);
  assert.equal(res.body, null);
});

test('supabase /mine: previous keys minus adminNote; admin_note no longer selected, payment columns still are', async () => {
  const { user, auth } = await makeStudent();
  supabaseRows.enrollment = supabaseEnrollmentRow(user.email);

  const res = await request(supabaseApp).get('/api/enrollments/mine').set(auth);
  assert.equal(res.status, 200);
  assertNoAdminData(res.body, 'supabase /mine');
  for (const f of ADMIN_ONLY_ENROLLMENT_FIELDS) assert.equal(res.body[f], undefined, f);
  assert.deepEqual(Object.keys(res.body).sort(), [...SUPABASE_MINE_KEYS].sort());
  assert.equal(res.body.bookingRef, FULL_BOOKING.bookingRef);
  assert.equal(res.body.agreedAmount, 40);
  assert.equal(res.body.currency, 'GBP');
  assert.equal(res.body.paymentMethodExternal, 'bank transfer');
  assert.equal(res.body.paidAt, '2026-10-01T00:00:00Z');
  assert.equal(res.body.renewalAt, '2026-11-01T00:00:00Z');

  const sql = supabaseQueries.find((q) => /FROM enrollments/.test(q.sql)).sql;
  assert.ok(!sql.includes('admin_note'), '/mine must not select admin_note');
  for (const col of ['agreed_amount', 'currency', 'payment_method_external', 'paid_at', 'renewal_at']) {
    assert.ok(sql.includes(col), `/mine must still select ${col}`);
  }
});

test('parity: /mine returns the same key set on both backends (Mongo adds its own __v, as before)', async () => {
  const { user, auth } = await makeStudent();
  await Enrollment.create({ ...FULL_BOOKING, email: user.email });
  supabaseRows.enrollment = supabaseEnrollmentRow(user.email);

  const mongo = await request(app).get('/api/enrollments/mine').set(auth);
  const supa = await request(supabaseApp).get('/api/enrollments/mine').set(auth);
  assert.deepEqual(Object.keys(supa.body).sort(), Object.keys(mongo.body).filter((k) => k !== '__v').sort());
  for (const k of ['email', 'bookingRef', 'teacherName', 'plan', 'status', 'notes', 'ageGroup', 'genderPref', 'agreedAmount', 'currency', 'paymentMethodExternal']) {
    assert.deepEqual(supa.body[k], mongo.body[k], k);
  }
});

// ── Admin routes keep the field ────────────────────────────────────────────

test('admin paths still return adminNote (v1 admin and legacy admin list)', async () => {
  const booking = await Enrollment.create({ ...FULL_BOOKING, email: 'booking@example.com' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const v1 = await agent.get(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(v1.status, 200);
  assert.ok(JSON.stringify(v1.body).includes(MARKER), 'v1 admin must still see adminNote');

  const { auth } = await makeStudent('admin');
  const legacy = await request(app).get('/api/enrollments').set(auth);
  assert.equal(legacy.status, 200);
  assert.ok(JSON.stringify(legacy.body).includes(MARKER), 'legacy admin list must still see adminNote');
});

test('a student cannot reach the admin enrollment list', async () => {
  await Enrollment.create({ ...FULL_BOOKING, email: 'other@example.com' });
  const { auth } = await makeStudent();
  const res = await request(app).get('/api/enrollments').set(auth);
  assert.equal(res.status, 403);
  assertNoAdminData(res.body, 'forbidden admin list');
});

// ── Public reviews ─────────────────────────────────────────────────────────

async function seedApprovedReviews() {
  const { user: author } = await makeStudent();
  const { user: teacher } = await makeStudent('teacher');
  const courseId = new User()._id; // any ObjectId; the course itself is not loaded
  const forTeacher = await Review.create({
    student: author._id, teacher: teacher._id, rating: 5, title: 'Great', body: 'Very clear lessons',
    status: 'approved', adminNote: MARKER,
  });
  const forCourse = await Review.create({
    student: author._id, course: courseId, rating: 4, title: 'Good', body: 'Well structured',
    status: 'approved', adminNote: MARKER,
  });
  return { author, teacher, courseId, forTeacher, forCourse };
}

test('mongo public reviews (teacher and course): exact previous contract minus adminNote', async () => {
  const { author, teacher, courseId } = await seedApprovedReviews();

  for (const url of [`/api/reviews/teacher/${teacher._id}`, `/api/reviews/course/${courseId}`]) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.body.reviews.length, 1, url);
    assertNoAdminData(res.body, url);
    const [r] = res.body.reviews;
    for (const key of Object.keys(r)) assert.ok(REVIEW_CLIENT_FIELDS.includes(key), `unexpected key ${key}`);
    // Exact contract: the same populated lean query the route ran before, minus adminNote.
    const filter = url.includes('/teacher/') ? { teacher: teacher._id } : { course: courseId };
    const before = await Review.find({ ...filter, status: 'approved' }).populate('student', 'name').lean();
    assert.deepEqual(res.body.reviews, asJson(before.map(withoutAdminNote)));
    assert.equal(r.__v, 0);
    assert.deepEqual(r.student, { _id: author._id.toString(), name: author.name });
    assert.ok(r._id && r.rating && r.body && r.createdAt);
    assert.equal(res.body.total, 1);
  }
});

test('supabase public reviews: allowlist drops admin_note even if the view returned it', async () => {
  supabaseRows.reviews = [{
    id: 'r-1', student_id: 's-1', student_name: 'Amina', teacher_id: 't-1', course_id: null,
    rating: 5, title: 'Great', body: 'Very clear lessons', status: 'approved', helpful: 0,
    created_at: '2026-10-01T00:00:00Z', admin_note: MARKER,
  }];
  for (const url of ['/api/reviews/teacher/t-1', '/api/reviews/course/c-1']) {
    const res = await request(supabaseApp).get(url);
    assert.equal(res.status, 200, url);
    assertNoAdminData(res.body, url);
    assert.deepEqual(res.body.reviews[0].student, { _id: 's-1', name: 'Amina' });
  }
});

test('parity: public review keys on Supabase are a subset of the Mongo keys (Mongo adds updatedAt and __v)', async () => {
  const { teacher } = await seedApprovedReviews();
  supabaseRows.reviews = [{
    id: 'r-1', student_id: 's-1', student_name: 'Amina', teacher_id: 't-1', course_id: null,
    rating: 5, title: 'Great', body: 'Very clear lessons', status: 'approved', helpful: 0,
    created_at: '2026-10-01T00:00:00Z', admin_note: MARKER,
  }];
  const mongo = (await request(app).get(`/api/reviews/teacher/${teacher._id}`)).body.reviews[0];
  const supa = (await request(supabaseApp).get('/api/reviews/teacher/t-1')).body.reviews[0];
  const mongoKeys = new Set(Object.keys(mongo));
  // Pre-existing shape difference, unrelated to this fix: Supabase sends an
  // unset reference as null (course: null on a teacher review), Mongo omits it.
  for (const key of Object.keys(supa)) {
    assert.ok(mongoKeys.has(key) || supa[key] === null, `supabase-only key ${key}`);
  }
  assert.deepEqual([...mongoKeys].filter((k) => !(k in supa)).sort(), ['__v', 'updatedAt']);
});

test('mongo POST /api/reviews: exact previous contract (the created document), no adminNote', async () => {
  const { user: teacher } = await makeStudent('teacher');
  const { auth } = await makeStudent();
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/reviews').set({ ...csrf, ...auth })
    .send({ teacherId: teacher._id.toString(), rating: 5, body: 'Very clear lessons' });
  assert.equal(res.status, 201);
  assertNoAdminData(res.body, 'POST /api/reviews');
  const created = await Review.findById(res.body.review._id).lean();
  assert.deepEqual(res.body.review, asJson(withoutAdminNote(created)));
  assert.equal(res.body.review.__v, 0);
  assert.equal(res.body.review.rating, 5);
  assert.equal(res.body.review.status, 'pending');
});

test('admin moderation response still includes adminNote', async () => {
  const { forTeacher } = await seedApprovedReviews();
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/reviews/${forTeacher._id}/moderate`)
    .set({ ...csrf, Cookie: cookieHeader }).send({ adminNote: `${MARKER}-updated` });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.adminNote, `${MARKER}-updated`);
});

// ── Errors and logs ────────────────────────────────────────────────────────

test('error responses and every log line stay free of adminNote', async (t) => {
  const { user, auth } = await makeStudent();
  await Enrollment.create({ ...FULL_BOOKING, email: user.email });
  const { teacher } = await seedApprovedReviews();
  const lines = captureLogs(t);

  const bodies = [];
  bodies.push((await request(app).get('/api/enrollments/mine').set(auth)).body);
  bodies.push((await request(app).get(`/api/reviews/teacher/${teacher._id}`)).body);
  const badId = await request(app).get('/api/reviews/teacher/not-an-object-id');
  assert.ok(badId.status >= 400, 'malformed id must fail');
  bodies.push(badId.body);
  const noAuth = await request(app).get('/api/enrollments/mine');
  assert.equal(noAuth.status, 401);
  bodies.push(noAuth.body);

  supabaseRows.enrollment = supabaseEnrollmentRow(user.email);
  bodies.push((await request(supabaseApp).get('/api/enrollments/mine').set(auth)).body);

  for (const body of bodies) assertNoAdminData(body, 'response');
  assert.ok(!JSON.stringify(lines).includes(MARKER), 'adminNote value leaked into logs');
});
