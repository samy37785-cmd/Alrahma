import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Scope correction (see docs/current-project-status.md), item 4's "log it
// clearly with a retry/outbox mechanism if the current architecture allows"
// requirement: the existing GET /api/cron/* CRON_SECRET-gated job pattern
// (routes/cronRoutes.js, already exercised by tests/cron.test.js) is exactly
// that architecture, so GET /api/cron/retry-failed-emails reuses it rather
// than inventing a new job runner. This file proves the retry job itself:
// a successful resend removes the queued row; a repeat failure increments
// attempts/lastError and leaves the row queued; a row already at
// MAX_ATTEMPTS is excluded from the next run's candidates.
//
// Corrective revision: this used to mock config/mailer.js's sendMail
// export directly (a throwing fake) — sendMail() never actually throws
// (it catches every SMTP error internally), so that mock exercised a code
// path the real function can never take, and the first version of
// controllers/cronController.js's retryFailedEmails (a try/catch around
// the call) silently treated every real SMTP failure as success. This
// version mocks `nodemailer` itself instead — the SAME swappable-impl
// pattern (one mock.module() call at module load, reassigned per test via
// a closure variable) is kept, since re-arming mock.module() per-test was
// separately found not to reliably re-intercept across repeated calls
// within one file/process.

const CRON_SECRET_VALUE = 'test-cron-secret-retry';

let currentImpl = async () => ({ messageId: 'fake' });
let app;
let EmailOutbox;

before(async () => {
  process.env.CRON_SECRET = CRON_SECRET_VALUE;
  process.env.SMTP_USER = 'ops@example.com';
  process.env.SMTP_PASS = 'app-password';
  await setupTestDb();

  mock.module('nodemailer', {
    exports: { default: { createTransport: () => ({ sendMail: (...args) => currentImpl(...args) }) } },
  });

  ({ default: app } = await import('../app.js'));
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

test('retry-failed-emails: a successful resend deletes the queued row and counts it as sent', async () => {
  currentImpl = async () => ({ messageId: 'fake' });
  const row = await EmailOutbox.create({
    to: 'ops@example.com', subject: 'Test', html: '<p>hi</p>',
    context: { type: 'booking_admin_notification' }, attempts: 1, lastError: 'previous failure',
  });

  const res = await request(app).get('/api/cron/retry-failed-emails').set('x-cron-secret', CRON_SECRET_VALUE);
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, 1);
  assert.equal(res.body.stillFailing, 0);

  const stillThere = await EmailOutbox.findById(row._id);
  assert.equal(stillThere, null, 'a successfully-resent row must be removed from the outbox');
});

test('retry-failed-emails: a real transport failure on retry increments attempts/lastError and leaves the row queued (does NOT delete it)', async () => {
  currentImpl = async () => { throw new Error('still unreachable (simulated real SMTP failure)'); };
  const row = await EmailOutbox.create({
    to: 'ops@example.com', subject: 'Test', html: '<p>hi</p>',
    context: { type: 'booking_admin_notification' }, attempts: 2, lastError: 'previous failure',
  });

  const res = await request(app).get('/api/cron/retry-failed-emails').set('x-cron-secret', CRON_SECRET_VALUE);
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, 0);
  assert.equal(res.body.stillFailing, 1);

  const updated = await EmailOutbox.findById(row._id);
  assert.ok(updated, 'a still-failing row must remain queued, not be deleted');
  assert.equal(updated.attempts, 3);
  assert.match(updated.lastError, /still unreachable/);
  assert.ok(updated.lastAttemptAt, 'lastAttemptAt should be set after a retry attempt');
});

test('retry-failed-emails: a row already at MAX_ATTEMPTS (5) is excluded from the next run\'s candidates', async () => {
  currentImpl = async () => ({ messageId: 'fake' });
  await EmailOutbox.create({
    to: 'ops@example.com', subject: 'Dead letter', html: '<p>hi</p>',
    context: { type: 'booking_admin_notification' }, attempts: 5, lastError: 'gave up already',
  });

  const res = await request(app).get('/api/cron/retry-failed-emails').set('x-cron-secret', CRON_SECRET_VALUE);
  assert.equal(res.status, 200);
  assert.equal(res.body.candidates, 0, 'a row at the attempts cap must not be picked up again');
  assert.equal(res.body.sent, 0);
});

test('retry-failed-emails: requires the cron secret, same as the other cron routes', async () => {
  const res = await request(app).get('/api/cron/retry-failed-emails');
  assert.equal(res.status, 401);
});
