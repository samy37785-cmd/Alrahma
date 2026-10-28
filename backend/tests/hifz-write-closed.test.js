import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import HifzProgress from '../models/HifzProgress.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// PUT /api/hifz/:chapterId (mark a verse range memorized) is closed. No page
// called it, and it built the whole requested range in memory, so one request
// from any signed-in account (from=1, to=1e9) could stall the server. This
// file proves, on the Mongo backend, that the write is gone for everyone and
// writes nothing, and that a student still reads their own progress.
// The dormant DATA_BACKEND=supabase backend is not changed.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function studentAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `hifz-${Date.now()}${Math.random()}@example.com`;
  const user = await User.create({ name: 'Hifz student', email, password: PASSWORD, role: 'student' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, 'login as student');
  return { agent, csrf, user };
}

test('a signed-in student gets 404 from the write, even for a huge range, and nothing is stored', async () => {
  const { agent, csrf } = await studentAgent();
  for (const body of [
    { from: 1, to: 7, chapterName: 'Al-Fatihah', totalVerses: 7 },
    { from: 1, to: 1_000_000_000 },
  ]) {
    const res = await agent.put('/api/hifz/1').set(csrf).send(body);
    assert.equal(res.status, 404, `range ${body.from}-${body.to}: expected 404, got ${res.status}`);
  }
  assert.equal(await HifzProgress.countDocuments(), 0);
});

test('an anonymous caller cannot write either', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.put('/api/hifz/1').set(csrf).send({ from: 1, to: 7 });
  assert.equal(res.status, 404);
  assert.equal(await HifzProgress.countDocuments(), 0);
});

test('a student still reads their own memorisation progress', async () => {
  const { agent, user } = await studentAgent();
  await HifzProgress.create({ user: user._id, chapterId: 1, chapterName: 'Al-Fatihah', totalVerses: 7, memorizedVerses: [1, 2, 3, 4, 5, 6, 7] });

  const res = await agent.get('/api/hifz');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalMemorized, 7);
  assert.equal(res.body.surahsCompleted, 1);
});
