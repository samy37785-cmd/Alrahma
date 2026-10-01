import { test } from 'node:test';
import assert from 'node:assert/strict';

// Proves DATA_BACKEND=supabase's createEnrollment (backend/data/supabase/
// enrollmentController.js) now sends the same two booking emails as the
// Mongo controller (controllers/enrollmentController.js), with the same
// fire-and-forget/await-but-never-fail semantics — and that the Mongo path
// itself is unchanged. No real Mongo/Postgres/SMTP connection is ever made:
// the Supabase client context helper (./client.js) and the mailer
// (config/mailer.js) are both replaced with in-memory fakes via Node's
// built-in module mocking (--experimental-test-module-mocks, enabled on
// this project's `npm test` script).

function fakeReqRes(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

const BOOKING_PAYLOAD = {
  name: 'Amina Student',
  email: 'amina-booking@example.com',
  whatsapp: '+44 7700 900000',
  country: 'United Kingdom',
  city: 'London',
  timezone: 'Europe/London',
  times: ['morning'],
  subjects: ['quran'],
  lang: 'en',
  level: 'beginner',
  genderPref: 'no_preference',
  teacherName: 'Ustadh Ali',
  plan: 'Huffaz',
};

async function loadSupabaseControllerWithMocks(t, { rpcImpl, sendMailImpl, adminEmail = 'admin@example.com' }) {
  t.mock.module('../data/supabase/client.js', {
    namedExports: {
      withAnonContext: async (fn) => fn({ query: rpcImpl }),
      withUserContext: async () => { throw new Error('not used by createEnrollment'); },
    },
  });
  t.mock.module('../config/mailer.js', {
    namedExports: {
      sendMail: sendMailImpl,
      ADMIN_EMAIL: () => adminEmail,
    },
  });
  // Cache-bust: a fresh dynamic import per test picks up this test's own
  // t.mock.module registration rather than a previous test's (each test's
  // mocks are torn down automatically when the test ends, but the ESM
  // module cache itself is otherwise process-wide).
  const mod = await import(`../data/supabase/enrollmentController.js?t=${Date.now()}-${Math.random()}`);
  return mod.createEnrollment;
}

test('supabase createEnrollment: sends both booking emails only after the RPC succeeds', async (t) => {
  const sendMailCalls = [];
  const createEnrollment = await loadSupabaseControllerWithMocks(t, {
    rpcImpl: async () => ({ rows: [{ ref: 'AR-20260101-TEST' }] }),
    sendMailImpl: async (args) => { sendMailCalls.push(args); },
  });

  const { req, res } = fakeReqRes(BOOKING_PAYLOAD);
  await createEnrollment(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.bookingRef, 'AR-20260101-TEST');

  assert.equal(sendMailCalls.length, 2, 'expected exactly one admin email and one student email, no duplicates');
  const [adminCall, studentCall] = sendMailCalls;
  assert.equal(adminCall.to, 'admin@example.com');
  assert.match(adminCall.subject, /New Booking Request/);
  assert.ok(adminCall.html.includes('AR-20260101-TEST'));
  assert.equal(studentCall.to, BOOKING_PAYLOAD.email);
  assert.match(studentCall.subject, /booking request/i);
  assert.ok(studentCall.html.includes('AR-20260101-TEST'));
});

test('supabase createEnrollment: a failed student-confirmation email does not fail the booking request', async (t) => {
  const sendMailCalls = [];
  const createEnrollment = await loadSupabaseControllerWithMocks(t, {
    rpcImpl: async () => ({ rows: [{ ref: 'AR-20260102-FAIL' }] }),
    sendMailImpl: async (args) => {
      sendMailCalls.push(args);
      if (args.to === BOOKING_PAYLOAD.email) throw new Error('SMTP down');
    },
  });

  const { req, res } = fakeReqRes(BOOKING_PAYLOAD);
  // No `next(err)` call expected — a rejected sendMail must not propagate.
  await createEnrollment(req, res, (err) => { throw err ?? new Error('next() should not be called'); });

  assert.equal(res.statusCode, 201, 'the booking must still succeed even though the student email rejected');
  assert.equal(res.body.bookingRef, 'AR-20260102-FAIL');
  assert.equal(sendMailCalls.length, 2, 'both emails were still attempted');
});

test('supabase createEnrollment: no email is sent when booking creation (the RPC) fails', async (t) => {
  const sendMailCalls = [];
  const createEnrollment = await loadSupabaseControllerWithMocks(t, {
    rpcImpl: async () => { throw new Error('duplicate key value violates unique constraint'); },
    sendMailImpl: async (args) => { sendMailCalls.push(args); },
  });

  const { req, res } = fakeReqRes(BOOKING_PAYLOAD);
  let caught = null;
  await createEnrollment(req, res, (err) => { caught = err; });

  assert.ok(caught, 'the RPC failure must be forwarded to the error handler');
  assert.equal(res.body, undefined, 'no success response was ever sent');
  assert.equal(sendMailCalls.length, 0, 'no email of either kind should be attempted when the booking itself failed');
});

test('supabase createEnrollment: no admin email is attempted when ADMIN_EMAIL() is unset (same as Mongo)', async (t) => {
  const sendMailCalls = [];
  const createEnrollment = await loadSupabaseControllerWithMocks(t, {
    rpcImpl: async () => ({ rows: [{ ref: 'AR-20260103-NOADMIN' }] }),
    sendMailImpl: async (args) => { sendMailCalls.push(args); },
    adminEmail: '',
  });

  const { req, res } = fakeReqRes(BOOKING_PAYLOAD);
  await createEnrollment(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(sendMailCalls.length, 1, 'only the student confirmation should be attempted');
  assert.equal(sendMailCalls[0].to, BOOKING_PAYLOAD.email);
});

// ── Regression guard: the Mongo path's own email behavior is unchanged ─────

test('mongo createEnrollment: still sends both booking emails exactly as before (unchanged by this PR)', async (t) => {
  const { default: Enrollment } = await import('../models/Enrollment.js');
  const sendMailCalls = [];

  t.mock.module('../config/mailer.js', {
    namedExports: {
      sendMail: async (args) => { sendMailCalls.push(args); },
      ADMIN_EMAIL: () => 'admin@example.com',
    },
  });

  const fakeEnrollment = { _id: 'mongo-id-1', bookingRef: 'AR-20260104-MONGO' };
  t.mock.method(Enrollment, 'create', async () => fakeEnrollment);

  const { createEnrollment } = await import(`../controllers/enrollmentController.js?t=${Date.now()}-${Math.random()}`);
  const { req, res } = fakeReqRes(BOOKING_PAYLOAD);
  await createEnrollment(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.bookingRef, 'AR-20260104-MONGO');
  assert.equal(sendMailCalls.length, 2);
  assert.equal(sendMailCalls[0].to, 'admin@example.com');
  assert.equal(sendMailCalls[1].to, BOOKING_PAYLOAD.email);
});
