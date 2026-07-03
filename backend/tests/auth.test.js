import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Integration tests for the regular-user auth flow (register/login/logout/me/
// update) against a real Express app + in-memory MongoDB — previously
// entirely untested (see the discovery-audit report: "Login/register/reset/
// refresh... have no test coverage").
//
// authLimiter caps /api/auth/* at 20 requests per 15 min per IP, shared
// across every test in this file/process — kept deliberately economical
// rather than mocking the limiter away, since testing against the real
// limiter is the point.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const PASSWORD = 'Str0ngP@ssw0rd!';

function extractAuthCookie(res) {
  const setCookie = res.headers['set-cookie'] || [];
  return setCookie.map(String).find((c) => c.startsWith('token='));
}

test('register: creates an account, sets an httpOnly cookie, never returns the token or password in the body', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent
    .post('/api/auth/register')
    .set(csrf)
    .send({ name: 'Amina', email: 'amina@example.com', password: PASSWORD });

  assert.equal(res.status, 201);
  assert.equal(res.body.email, 'amina@example.com');
  assert.equal(res.body.role, 'student');
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.token, undefined);

  const cookie = extractAuthCookie(res);
  assert.ok(cookie, 'expected an httpOnly token cookie to be set');
  assert.match(cookie, /HttpOnly/i);
});

test('register: public sign-up cannot self-assign the admin role', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent
    .post('/api/auth/register')
    .set(csrf)
    .send({ name: 'Wannabe Admin', email: 'wannabe@example.com', password: PASSWORD, role: 'admin' });

  assert.equal(res.status, 201);
  assert.equal(res.body.role, 'student'); // coerced, not honored
});

test('register: duplicate email is rejected with 409', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const body = { name: 'Amina', email: 'dup@example.com', password: PASSWORD };

  const first = await agent.post('/api/auth/register').set(csrf).send(body);
  assert.equal(first.status, 201);

  const second = await agent.post('/api/auth/register').set(csrf).send(body);
  assert.equal(second.status, 409);
});

test('login: wrong password is rejected and sets no cookie', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Bilal', email: 'bilal@example.com', password: PASSWORD });

  const res = await agent
    .post('/api/auth/login')
    .set(csrf)
    .send({ email: 'bilal@example.com', password: 'wrong-password' });

  assert.equal(res.status, 401);
  assert.equal(extractAuthCookie(res), undefined);
});

test('login: correct credentials succeed and GET /me reflects the session', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Bilal', email: 'bilal2@example.com', password: PASSWORD });
  // register already logs in via its own cookie; use a fresh agent to prove
  // login (not just register) issues a working session independently.
  const { agent: freshAgent, csrf: freshCsrf } = await agentWithCsrf(app);

  const login = await freshAgent
    .post('/api/auth/login')
    .set(freshCsrf)
    .send({ email: 'bilal2@example.com', password: PASSWORD });
  assert.equal(login.status, 200);

  const me = await freshAgent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'bilal2@example.com');
});

test('GET /me without a session cookie is rejected', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('logout clears the session — a subsequent /me is rejected', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Zaid', email: 'zaid@example.com', password: PASSWORD });

  const logout = await agent.post('/api/auth/logout').set(csrf).send();
  assert.equal(logout.status, 200);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 401);
});

test('updateMe: changing password requires the correct current password', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Huda', email: 'huda@example.com', password: PASSWORD });

  const bad = await agent
    .put('/api/auth/me')
    .set(csrf)
    .send({ currentPassword: 'not-the-real-one', newPassword: 'AnotherStr0ng!' });
  assert.equal(bad.status, 401);

  const good = await agent
    .put('/api/auth/me')
    .set(csrf)
    .send({ currentPassword: PASSWORD, newPassword: 'AnotherStr0ng!' });
  assert.equal(good.status, 200);
});
