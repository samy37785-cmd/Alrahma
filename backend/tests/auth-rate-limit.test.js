import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Verifies authLimiter (config/rateLimit.js: 20 req/15min/IP on /api/auth/*)
// actually enforces its limit — deliberately spends this whole file's
// request budget on one scenario, hence its own file/process.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('authLimiter returns 429 after the 20th request in the window', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const statuses = [];
  for (let i = 0; i < 21; i++) {
    // Deliberately wrong credentials -- what's being measured is the request
    // COUNT the limiter allows through, not login success.
    const res = await agent
      .post('/api/auth/login')
      .set(csrf)
      .send({ email: 'nobody@example.com', password: 'wrong' });
    statuses.push(res.status);
  }

  const limited = statuses.filter((s) => s === 429);
  assert.ok(limited.length >= 1, `expected at least one 429 among: ${statuses.join(',')}`);
  // The 21st request (index 20) must be the one that's limited, given a clean
  // 20-request budget for this agent's IP.
  assert.equal(statuses[20], 429);
});
