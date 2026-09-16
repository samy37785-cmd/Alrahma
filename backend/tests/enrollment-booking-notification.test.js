import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Scope correction (see docs/current-project-status.md), item 4: booking
// admin-notification email now goes to every BOOKING_NOTIFICATION_RECIPIENTS
// entry (falling back to ADMIN_EMAIL()), and a failed send can never fail
// the booking request.
//
// Corrective revision: the first version of this file mocked config/
// mailer.js's OWN sendMail export to reject directly — that is not what the
// real function does (it catches every SMTP error internally and, before
// this same revision, returned `undefined` regardless of outcome), so those
// tests proved nothing about the real failure path. This version mocks
// `nodemailer` itself (one level below config/mailer.js), so sendMail()'s
// REAL try/catch and REAL `{ ok, error }` return value are what's under
// test — the outbox row is written BEFORE delivery is attempted and
// deleted only after a confirmed `{ ok: true }`, per
// controllers/enrollmentController.js's sendBookingNotification().
//
// Structural note: `mock.module('nodemailer', ...)` is installed ONCE here
// (module-level, before any test), with a swappable `currentImpl` closure
// variable each test reassigns, and setupTestDb()/teardownTestDb() (which
// spin up/tear down a real MongoMemoryReplSet) run ONCE too — an earlier
// version of this file called both fresh per test, which was found to hang
// the process after the tests themselves had already finished and printed
// their results (the same repeated-mock.module()-plus-repeated-Mongo-
// replica-set-lifecycle combination that tests/cron-retry-failed-emails
// .test.js's own header comment already documents avoiding, for a related
// reason). This structure — one setup, one mock, per-test state reset in
// beforeEach — is the version proven not to hang.

const CRON_UNRELATED_SMTP_USER = 'ops@example.com';

let currentImpl = async () => ({ messageId: 'fake' });
let app;
let Enrollment;
let EmailOutbox;

before(async () => {
  process.env.SMTP_USER = CRON_UNRELATED_SMTP_USER;
  process.env.SMTP_PASS = 'app-password';
  await setupTestDb();

  mock.module('nodemailer', {
    exports: { default: { createTransport: () => ({ sendMail: (...args) => currentImpl(...args) }) } },
  });

  ({ default: app } = await import('../app.js'));
  ({ default: Enrollment } = await import('../models/Enrollment.js'));
  ({ default: EmailOutbox } = await import('../models/EmailOutbox.js'));
}, { timeout: 60_000 });

after(async () => {
  mock.reset();
  await teardownTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  currentImpl = async () => ({ messageId: 'fake' });
});

test('BOOKING_NOTIFICATION_RECIPIENTS(): parses/validates/dedupes a comma-separated list, and falls back to ADMIN_EMAIL() when unset', async () => {
  const prevEnv = { ...process.env };
  try {
    process.env.BOOKING_NOTIFICATION_RECIPIENTS = ' a@example.com, b@example.com ,,c@example.com, A@EXAMPLE.com';
    delete process.env.ADMIN_EMAIL;
    const { BOOKING_NOTIFICATION_RECIPIENTS } = await import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
    assert.deepEqual(
      BOOKING_NOTIFICATION_RECIPIENTS(), ['a@example.com', 'b@example.com', 'c@example.com'],
      'a case-insensitive duplicate (A@EXAMPLE.com vs a@example.com) must be deduplicated',
    );

    process.env.BOOKING_NOTIFICATION_RECIPIENTS = 'not-an-email, b@example.com';
    const { BOOKING_NOTIFICATION_RECIPIENTS: fnInvalid } = await import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
    assert.deepEqual(fnInvalid(), ['b@example.com'], 'a syntactically invalid entry must be dropped, not sent to nodemailer');

    delete process.env.BOOKING_NOTIFICATION_RECIPIENTS;
    process.env.ADMIN_EMAIL = 'fallback@example.com';
    const { BOOKING_NOTIFICATION_RECIPIENTS: fn2 } = await import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
    assert.deepEqual(fn2(), ['fallback@example.com']);

    delete process.env.BOOKING_NOTIFICATION_RECIPIENTS;
    delete process.env.ADMIN_EMAIL;
    delete process.env.SMTP_USER;
    const { BOOKING_NOTIFICATION_RECIPIENTS: fn3 } = await import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
    assert.deepEqual(fn3(), []);
  } finally {
    process.env = prevEnv;
  }
});

test('POST /api/enrollments: a REAL SMTP transport failure still returns 201, and queues BOTH the admin and student emails to EmailOutbox with the real transport error', async () => {
  process.env.BOOKING_NOTIFICATION_RECIPIENTS = 'ops1@example.com,ops2@example.com';
  const sendCalls = [];
  currentImpl = async (opts) => {
    sendCalls.push(opts);
    throw new Error('Connection timeout to smtp.gmail.com (simulated real SMTP failure)');
  };

  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({
    name: 'Amina Student', email: 'amina-notif@example.com', whatsapp: '+44 7700 900000',
    subjects: ['quran'], plan: 'Huffaz',
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(sendCalls.length, 2, 'both the admin notification and the student confirmation should have been attempted');

  const saved = await Enrollment.findById(res.body.id).lean();
  assert.ok(saved, 'the booking must still be persisted even though both notification sends failed for real');
  assert.equal(saved.status, 'pending');

  const outboxRows = await EmailOutbox.find({}).lean();
  assert.equal(outboxRows.length, 2, `expected both emails queued after a real transport failure; got: ${JSON.stringify(outboxRows.map((r) => r.context))}`);

  const adminOutbox = outboxRows.find((r) => r.context?.type === 'booking_admin_notification');
  assert.ok(adminOutbox, 'the failed admin notification should be queued to EmailOutbox');
  assert.equal(adminOutbox.to, 'ops1@example.com,ops2@example.com');
  assert.equal(adminOutbox.attempts, 1, 'the initial failed send itself counts as one attempt');
  assert.match(adminOutbox.lastError, /Connection timeout/);

  const studentOutbox = outboxRows.find((r) => r.context?.type === 'booking_student_confirmation');
  assert.ok(studentOutbox, 'the failed student confirmation should also be queued to EmailOutbox');
  assert.equal(studentOutbox.to, 'amina-notif@example.com');
});

test('POST /api/enrollments: a successful real send never leaves a row in EmailOutbox', async () => {
  process.env.BOOKING_NOTIFICATION_RECIPIENTS = 'ops1@example.com,ops2@example.com';
  currentImpl = async () => ({ messageId: 'fake-message-id' });

  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({
    name: 'Bilal Student', email: 'bilal-notif@example.com', whatsapp: '+44 7700 900001',
    subjects: ['quran'], plan: 'Huffaz',
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const outboxRows = await EmailOutbox.find({}).lean();
  assert.equal(outboxRows.length, 0, 'a confirmed successful send must not leave anything queued in the outbox');
});
