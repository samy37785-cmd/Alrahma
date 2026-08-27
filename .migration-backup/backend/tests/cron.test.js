import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { buildChildReportData } from '../controllers/cronController.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import logger from '../config/logger.js';

// Integration coverage for /api/cron/* (routes/cronRoutes.js, controllers/
// cronController.js) -- previously untested, and the specific endpoint
// (sendWeeklyParentReports) rewritten in this same remediation pass to fix
// its N+1 query pattern (issue #9). buildChildReportData is unit-tested
// directly (see below) because the HTTP response only returns counts --
// sendMail is disabled in this test environment (no SMTP configured), so
// the actual per-child report content it would have emailed can't be
// observed through the HTTP layer alone.

const CRON_SECRET = 'test-cron-secret';

before(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

test('cron auth: rejects requests with no secret or the wrong secret', async () => {
  const noAuth = await request(app).get('/api/cron/renewal-reminders');
  assert.equal(noAuth.status, 401);

  const wrong = await request(app)
    .get('/api/cron/renewal-reminders')
    .set('Authorization', 'Bearer not-the-real-secret');
  assert.equal(wrong.status, 401);
});

test('cron auth: fails closed (503) if CRON_SECRET is not configured', async () => {
  const original = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = await request(app).get('/api/cron/renewal-reminders');
    assert.equal(res.status, 503);
  } finally {
    process.env.CRON_SECRET = original;
  }
});

test('cron auth: accepts either Authorization: Bearer or x-cron-secret', async () => {
  const viaBearer = await request(app).get('/api/cron/renewal-reminders').set('Authorization', `Bearer ${CRON_SECRET}`);
  assert.equal(viaBearer.status, 200);

  const viaHeader = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', CRON_SECRET);
  assert.equal(viaHeader.status, 200);
});

test('renewal-reminders: emails a user whose subscription expires within the window, then is idempotent on a second run', async () => {
  const validUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days out
  await User.create({
    name: 'Renewing', email: 'renewing@example.com', password: 'Str0ngP@ssw0rd!',
    subscription: { plan: 'Starter', status: 'active', validUntil },
  });

  const first = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', CRON_SECRET);
  assert.equal(first.status, 200);
  assert.equal(first.body.sent, 1);
  assert.equal(first.body.skipped, 0);

  const user = await User.findOne({ email: 'renewing@example.com' });
  assert.equal(new Date(user.subscription.renewalReminderSentFor).getTime(), validUntil.getTime());

  // Same period, second run -- must skip, not re-send.
  const second = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', CRON_SECRET);
  assert.equal(second.body.sent, 0);
  assert.equal(second.body.skipped, 1);
});

test('renewal-reminders: does not email a user outside the reminder window', async () => {
  await User.create({
    name: 'Not Yet', email: 'notyet@example.com', password: 'Str0ngP@ssw0rd!',
    subscription: { plan: 'Starter', status: 'active', validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  const res = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', CRON_SECRET);
  assert.equal(res.body.candidates, 0);
});

test('weekly-parent-reports: only counts parents who actually have a linked, existing child', async () => {
  const child = await User.create({ name: 'Kid', email: 'kid@example.com', password: 'Str0ngP@ssw0rd!', xp: 10, level: 2, streak: 3 });
  await User.create({
    name: 'Parent With Child', email: 'parent1@example.com', password: 'Str0ngP@ssw0rd!', role: 'parent',
    children: [child._id],
  });
  await User.create({
    name: 'Parent With Deleted Child', email: 'parent2@example.com', password: 'Str0ngP@ssw0rd!', role: 'parent',
    children: ['000000000000000000000000'], // no such user exists
  });

  const res = await request(app).get('/api/cron/weekly-parent-reports').set('x-cron-secret', CRON_SECRET);
  assert.equal(res.status, 200);
  assert.equal(res.body.parents, 2); // both parents matched the query...
  assert.equal(res.body.sent, 1);    // ...but only one actually had a valid child to report on
});

test('buildChildReportData: joins pre-fetched lookup maps correctly (the N+1 fix from issue #9)', () => {
  const childId = 'child-1';
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const childById = new Map([[childId, { name: 'Amina', xp: 50, level: 3, streak: 7 }]]);
  const progressByChild = new Map([[childId, [
    { completed: ['lesson:a', 'lesson:b'], lastActivity: new Date() },        // touched this week -> counts
    { completed: ['lesson:c'],             lastActivity: new Date(0) },       // touched long ago -> doesn't count
  ]]]);
  const soonest = new Date(Date.now() + 1000);
  const nextClassByChild = new Map([[childId, { startsAt: soonest }]]);

  const result = buildChildReportData(childId, { childById, progressByChild, nextClassByChild, oneWeekAgo });

  assert.deepEqual(result, {
    childName: 'Amina',
    streak: 7,
    lessonsThisWeek: 2, // both entries in the "touched this week" progress row
    xp: 50,
    level: 3,
    nextClass: soonest,
  });
});

test('buildChildReportData: returns null for a child id not present in the lookup (deleted/missing user)', () => {
  const result = buildChildReportData('nonexistent', {
    childById: new Map(), progressByChild: new Map(), nextClassByChild: new Map(), oneWeekAgo: new Date(),
  });
  assert.equal(result, null);
});

// T23 (monitoring & observability audit): these jobs are only ever invoked by
// a scheduler external to this repo (see render.yaml) -- previously nothing
// logged that a run happened at all, only per-item send failures. Without a
// completion log line, there was no server-side way to confirm from the logs
// whether/when the daily job actually fired.
test('renewal-reminders: logs a completion summary with the computed counts', async () => {
  const infoSpy = mock.method(logger, 'info', () => {});
  try {
    const res = await request(app).get('/api/cron/renewal-reminders').set('x-cron-secret', CRON_SECRET);
    assert.equal(res.status, 200);

    const call = infoSpy.mock.calls.find((c) => c.arguments[0] === 'Cron: renewal-reminders completed');
    assert.ok(call, 'expected a "Cron: renewal-reminders completed" log line');
    assert.deepEqual(call.arguments[1], {
      withinDays: res.body.withinDays, candidates: res.body.candidates, sent: res.body.sent, skipped: res.body.skipped,
    });
  } finally {
    infoSpy.mock.restore();
  }
});

test('weekly-parent-reports: logs a completion summary with the computed counts', async () => {
  const infoSpy = mock.method(logger, 'info', () => {});
  try {
    const res = await request(app).get('/api/cron/weekly-parent-reports').set('x-cron-secret', CRON_SECRET);
    assert.equal(res.status, 200);

    const call = infoSpy.mock.calls.find((c) => c.arguments[0] === 'Cron: weekly-parent-reports completed');
    assert.ok(call, 'expected a "Cron: weekly-parent-reports completed" log line');
    assert.deepEqual(call.arguments[1], { parents: res.body.parents, sent: res.body.sent });
  } finally {
    infoSpy.mock.restore();
  }
});
