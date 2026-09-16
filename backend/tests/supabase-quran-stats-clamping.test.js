import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import { mock } from 'node:test';

// Auth hardening security batch (item 6d), Supabase-mode counterpart of
// tests/quran-stats-integrity.test.js's clamping coverage: logPractice/
// logReading previously passed req.body values straight into the query
// params with only a `Number(x) || 0` NaN guard. Same approach as
// tests/supabase-review-ownership.test.js — intercept withUserContext() via
// node:test's module-mock support and inspect the real query params the
// controller builds, against a fake in-memory `pg` client. No real
// Postgres/Supabase connection is made.
//
// logReading's own atomicity fix (FOR UPDATE) and logPractice's pre-existing
// atomic ON CONFLICT ... DO UPDATE SET col = col + EXCLUDED.col are real SQL
// behavior a fake client can't meaningfully exercise — that needs a real
// Postgres, which is what the Docker-based lib/db suite is for; this file
// only proves the clamping, which needs no DB at all.
const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
const memoControllerUrl = pathToFileURL(path.resolve('data/supabase/quranMemoController.js')).href;
const progressControllerUrl = pathToFileURL(path.resolve('data/supabase/quranProgressController.js')).href;

let calls;

function makeFakeClient() {
  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^\s*SELECT streak, history FROM quran_reading_progress/.test(sql)) {
        return { rows: [] };
      }
      if (/^\s*INSERT INTO quran_memorization_stats/.test(sql)) {
        return { rows: [{ user_id: params[0], total_recordings: params[1], total_practice_time: params[2], goal: 5, streak: 1 }] };
      }
      if (/^\s*INSERT INTO quran_reading_progress/.test(sql)) {
        return { rows: [{ user_id: params[0], streak: params[1], history: JSON.parse(params[2]), goal: 10 }] };
      }
      return { rows: [] };
    },
  };
}

let logPractice;
let logReading;

before(async () => {
  const realClientModule = await import(clientUrl);
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: async (userId, fn) => fn(makeFakeClient()),
    },
  });
  ({ logPractice } = await import(memoControllerUrl));
  ({ logReading } = await import(progressControllerUrl));
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

test.beforeEach(() => { calls = []; });

test('logPractice clamps a negative practiceSeconds/recordingsCount to 0 before hitting the DB', async () => {
  const req = { user: { _id: 'user-a' }, body: { practiceSeconds: -500, recordingsCount: -10 } };
  const res = fakeRes();

  await logPractice(req, res, (err) => { throw err; });

  const insertCall = calls.find((c) => /^\s*INSERT INTO quran_memorization_stats/.test(c.sql));
  assert.equal(insertCall.params[1], 0); // recordingsCount
  assert.equal(insertCall.params[2], 0); // practiceSeconds
});

test('logPractice clamps an absurdly large practiceSeconds/recordingsCount to the bound before hitting the DB', async () => {
  const req = { user: { _id: 'user-a' }, body: { practiceSeconds: Number.MAX_SAFE_INTEGER, recordingsCount: Number.MAX_SAFE_INTEGER } };
  const res = fakeRes();

  await logPractice(req, res, (err) => { throw err; });

  const insertCall = calls.find((c) => /^\s*INSERT INTO quran_memorization_stats/.test(c.sql));
  assert.equal(insertCall.params[1], 1000); // recordingsCount cap
  assert.equal(insertCall.params[2], 86400); // practiceSeconds cap
});

test('logReading clamps a negative versesRead/minutesRead to 0 before hitting the DB', async () => {
  const req = { user: { _id: 'user-a' }, body: { versesRead: -50, minutesRead: -30 } };
  const res = fakeRes();

  await logReading(req, res, (err) => { throw err; });

  const insertCall = calls.find((c) => /^\s*INSERT INTO quran_reading_progress/.test(c.sql));
  const history = JSON.parse(insertCall.params[2]);
  assert.equal(history[0].versesRead, 0);
  assert.equal(history[0].minutesRead, 0);
});

test('logReading clamps an absurdly large versesRead/minutesRead to the bound before hitting the DB', async () => {
  const req = { user: { _id: 'user-a' }, body: { versesRead: Number.MAX_SAFE_INTEGER, minutesRead: Number.MAX_SAFE_INTEGER } };
  const res = fakeRes();

  await logReading(req, res, (err) => { throw err; });

  const insertCall = calls.find((c) => /^\s*INSERT INTO quran_reading_progress/.test(c.sql));
  const history = JSON.parse(insertCall.params[2]);
  assert.equal(history[0].versesRead, 6236);
  assert.equal(history[0].minutesRead, 1440);
});
