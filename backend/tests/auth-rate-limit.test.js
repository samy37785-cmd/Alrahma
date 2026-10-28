import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { RATE_LIMITS } from '../config/rateLimit.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Verifies authLimiter (config/rateLimit.js: RATE_LIMITS.auth req/15min/IP on
// /api/auth/*) actually enforces its limit — deliberately spends this whole
// file's request budget on one scenario, hence its own file/process.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('the budgets are sized for every visitor behind Vercel sharing one address', () => {
  // Through the domain all visitors share Vercel's outbound address, so a
  // per-visitor-sized budget (5 trials) refused the 6th visitor in a window.
  assert.deepEqual({ ...RATE_LIMITS }, { api: 300, auth: 100, enrollment: 30, trial: 30 });
});

test('authLimiter returns 429 on the request after the budget in the window', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const statuses = [];
  for (let i = 0; i <= RATE_LIMITS.auth; i++) {
    // Deliberately wrong credentials -- what's being measured is the request
    // COUNT the limiter allows through, not login success.
    const res = await agent
      .post('/api/auth/login')
      .set(csrf)
      .send({ email: 'nobody@example.com', password: 'wrong' });
    statuses.push(res.status);
  }

  // Every request inside the budget gets through to the login handler, and
  // the first one past it (index RATE_LIMITS.auth) is the one limited, given
  // a clean budget for this agent's IP.
  assert.ok(!statuses.slice(0, RATE_LIMITS.auth).includes(429), statuses.join(','));
  assert.equal(statuses[RATE_LIMITS.auth], 429);
});
