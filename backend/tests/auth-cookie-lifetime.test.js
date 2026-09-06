import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T13: the auth cookie's maxAge used to be a hardcoded 7-day
// literal (`COOKIE_MAX_AGE`) that would silently diverge from JWT_EXPIRES_IN
// if that env var were ever set to anything else. It's now derived from the
// signed token's own exp/iat claims, so it always matches whatever
// jsonwebtoken actually used to interpret JWT_EXPIRES_IN — these tests prove
// that synchronization holds for the default and for a non-default value.

const PASSWORD = 'Str0ngP@ssw0rd!';
const ORIGINAL_JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => {
  process.env.JWT_EXPIRES_IN = ORIGINAL_JWT_EXPIRES_IN;
  await teardownTestDb();
});
beforeEach(async () => { await clearTestDb(); });

function maxAgeSecondsOf(res) {
  const setCookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('token='));
  assert.ok(setCookie, 'expected a token cookie to be set');
  const match = setCookie.match(/Max-Age=(\d+)/i);
  assert.ok(match, `expected a Max-Age attribute on the cookie: ${setCookie}`);
  return Number(match[1]);
}

test('default JWT_EXPIRES_IN (7d): cookie Max-Age matches 7 days exactly', async () => {
  delete process.env.JWT_EXPIRES_IN;
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'A', email: 'a-cookie@example.com', password: PASSWORD });

  assert.equal(maxAgeSecondsOf(res), 7 * 24 * 60 * 60);
});

test('JWT_EXPIRES_IN=15m: cookie Max-Age matches 15 minutes, not the old hardcoded 7-day value', async () => {
  process.env.JWT_EXPIRES_IN = '15m';
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'B', email: 'b-cookie@example.com', password: PASSWORD });

  assert.equal(maxAgeSecondsOf(res), 15 * 60);
});

test('JWT_EXPIRES_IN=2h: cookie Max-Age matches 2 hours', async () => {
  process.env.JWT_EXPIRES_IN = '2h';
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'C', email: 'c-cookie@example.com', password: PASSWORD });

  assert.equal(maxAgeSecondsOf(res), 2 * 60 * 60);
});

test('login sets a cookie with the same Max-Age behavior as register', async () => {
  process.env.JWT_EXPIRES_IN = '30m';
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'D', email: 'd-cookie@example.com', password: PASSWORD });

  const loginRes = await agent.post('/api/auth/login').set(csrf).send({ email: 'd-cookie@example.com', password: PASSWORD });
  assert.equal(loginRes.status, 200);
  assert.equal(maxAgeSecondsOf(loginRes), 30 * 60);
});

test('logout still clears the cookie (Max-Age=0 / Expires in the past), unaffected by the maxAge derivation change', async () => {
  process.env.JWT_EXPIRES_IN = '7d';
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'E', email: 'e-cookie@example.com', password: PASSWORD });

  const logoutRes = await agent.post('/api/auth/logout').set(csrf).send();
  assert.equal(logoutRes.status, 200);

  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('token='));
  assert.ok(setCookie);
  assert.match(setCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);

  // Confirm the session is actually invalidated end-to-end.
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 401);
});
