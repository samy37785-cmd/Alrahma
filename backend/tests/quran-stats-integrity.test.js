import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import QuranMemorizationStats from '../models/QuranMemorizationStats.js';
import QuranReadingProgress from '../models/QuranReadingProgress.js';
import { signToken } from '../utils/authCookie.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Auth hardening security batch (item 6d): logPractice/logReading previously
// only guarded against NaN (`Number(x) || 0`), not negative or absurdly
// large values, and were plain read-modify-write .save() calls — race-prone
// under concurrency (a lost update: two concurrent log calls could both read
// the same starting value and one's increment would silently overwrite the
// other's). Both are now clamped (utils/clampNumeric.js) and use an atomic
// $inc (findOneAndUpdate), verified here against a REAL concurrent-write
// race on the actual mongodb-memory-server driver, not a mocked one.

const PASSWORD = 'Stud3nt-Str0ng-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function studentAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const user = await User.create({
    name: 'Student', email: `student-${Date.now()}${Math.random()}@example.com`,
    password: PASSWORD, role: 'student',
  });
  const token = signToken(user._id, user.role, user.tokenVersion ?? 0);
  const cookieHeader = `token=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader, user };
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

test('logPractice clamps a negative practiceSeconds/recordingsCount to 0', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();

  const res = await agent.post('/api/quran-memo/log')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ practiceSeconds: -500, recordingsCount: -10 });

  assert.equal(res.status, 200);
  assert.equal(res.body.stats.totalPracticeTime, 0);
  assert.equal(res.body.stats.totalRecordings, 0);
});

test('logPractice clamps an absurdly large practiceSeconds/recordingsCount to the bound', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();

  const res = await agent.post('/api/quran-memo/log')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ practiceSeconds: Number.MAX_SAFE_INTEGER, recordingsCount: Number.MAX_SAFE_INTEGER });

  assert.equal(res.status, 200);
  assert.equal(res.body.stats.totalPracticeTime, 86400);
  assert.equal(res.body.stats.totalRecordings, 1000);
});

test('logReading clamps a negative versesRead/minutesRead to 0', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();

  const res = await agent.post('/api/quran-progress/log')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ versesRead: -50, minutesRead: -30 });

  assert.equal(res.status, 200);
  assert.equal(res.body.history.length, 1);
  assert.equal(res.body.history[0].versesRead, 0);
  assert.equal(res.body.history[0].minutesRead, 0);
});

test('logReading clamps an absurdly large versesRead/minutesRead to the bound', async () => {
  const { agent, csrf, cookieHeader } = await studentAgent();

  const res = await agent.post('/api/quran-progress/log')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ versesRead: Number.MAX_SAFE_INTEGER, minutesRead: Number.MAX_SAFE_INTEGER });

  assert.equal(res.status, 200);
  const entry = res.body.history[0];
  assert.equal(entry.versesRead, 6236);
  assert.equal(entry.minutesRead, 1440);
});

// ---------------------------------------------------------------------------
// Concurrency — no lost updates
// ---------------------------------------------------------------------------

test('CONCURRENCY: N concurrent logPractice calls each incrementing by a fixed amount sum exactly (no lost updates)', async () => {
  const { agent, csrf, cookieHeader, user } = await studentAgent();
  const N = 20;

  await Promise.all(
    Array.from({ length: N }, () =>
      agent.post('/api/quran-memo/log')
        .set({ ...csrf, Cookie: cookieHeader })
        .send({ practiceSeconds: 10, recordingsCount: 1 })
    )
  );

  const doc = await QuranMemorizationStats.findOne({ user: user._id });
  assert.equal(doc.stats.totalPracticeTime, N * 10);
  assert.equal(doc.stats.totalRecordings, N * 1);
});

test('CONCURRENCY: N concurrent logReading calls starting from an EMPTY day record (no prior entry for today at all) produce exactly ONE history entry for today with the correct summed totals — closes the first-log-of-the-day duplicate-entry race', async () => {
  const { agent, csrf, cookieHeader, user } = await studentAgent();
  const N = 20;

  // Establish the singleton doc with NO history entry for today yet (the
  // exact starting condition the old two-step $inc-then-$push design could
  // race on: N concurrent calls all seeing "no entry for today").
  await agent.get('/api/quran-progress').set({ ...csrf, Cookie: cookieHeader });
  const seeded = await QuranReadingProgress.findOne({ user: user._id });
  assert.equal(seeded.history.length, 0);

  await Promise.all(
    Array.from({ length: N }, () =>
      agent.post('/api/quran-progress/log')
        .set({ ...csrf, Cookie: cookieHeader })
        .send({ versesRead: 5, minutesRead: 2 })
    )
  );

  const doc = await QuranReadingProgress.findOne({ user: user._id });
  assert.equal(doc.history.length, 1, 'exactly one history entry for today, never a duplicate from a concurrent first-log-of-the-day race');
  assert.equal(doc.history[0].versesRead, N * 5);
  assert.equal(doc.history[0].minutesRead, N * 2);
});

test('CONCURRENCY: N concurrent logReading calls for a user with NO QuranReadingProgress document at all (not even the singleton) produce exactly ONE document and ONE history entry — closes the first-ever-creation race', async () => {
  const { agent, csrf, cookieHeader, user } = await studentAgent();
  const N = 20;

  const preExisting = await QuranReadingProgress.findOne({ user: user._id });
  assert.equal(preExisting, null, 'user must start with zero QuranReadingProgress documents');

  const responses = await Promise.all(
    Array.from({ length: N }, () =>
      agent.post('/api/quran-progress/log')
        .set({ ...csrf, Cookie: cookieHeader })
        .send({ versesRead: 5, minutesRead: 2 })
    )
  );

  for (const res of responses) {
    assert.equal(res.status, 200);
  }

  const docs = await QuranReadingProgress.find({ user: user._id });
  assert.equal(docs.length, 1, 'exactly one QuranReadingProgress document, never a duplicate from a concurrent first-creation race');
  assert.equal(docs[0].history.length, 1, 'exactly one history entry for today');
  assert.equal(docs[0].history[0].versesRead, N * 5);
  assert.equal(docs[0].history[0].minutesRead, N * 2);
});
