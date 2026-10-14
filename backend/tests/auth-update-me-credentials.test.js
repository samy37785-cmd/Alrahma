import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { signToken } from '../utils/authCookie.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Audit AR-03: PUT /api/auth/me changed the email (the login, and where reset
// links go) without the current password and left every other session alive.
// Now an email change needs the current password, like a password change, and
// either change ends every other session while this device gets a fresh cookie.
// Users and tokens are created directly: /register and /login allow few
// requests per IP (config/rateLimit.js).

const PASSWORD = 'Str0ngP@ssw0rd!';
const EMAIL = 'owner@example.com';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function userWithToken(email = EMAIL) {
  const user = await User.create({ name: 'Owner', email, password: PASSWORD });
  return signToken(user._id, user.role, user.tokenVersion ?? 0);
}

async function updateMe(token, body) {
  const { agent, csrf } = await agentWithCsrf(app);
  return agent.put('/api/auth/me').set(csrf).set('Authorization', `Bearer ${token}`).send(body);
}

const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
const emailNow = async () => (await User.findOne({ name: 'Owner' })).email;

function newTokenOf(res) {
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('token='));
  return cookie ? cookie.split(';')[0].slice('token='.length) : null;
}

test('an email change without the current password is refused (400) and changes nothing', async () => {
  const token = await userWithToken();
  const res = await updateMe(token, { name: 'Owner', email: 'attacker@example.com' });
  assert.equal(res.status, 400);
  assert.equal(await emailNow(), EMAIL);
});

test('a wrong password is refused (401) before the "email taken" check, so it reveals nothing', async () => {
  const token = await userWithToken();
  await User.create({ name: 'Other', email: 'taken@example.com', password: PASSWORD });
  for (const email of ['new@example.com', 'taken@example.com']) {
    const res = await updateMe(token, { name: 'Owner', email, currentPassword: 'wrong-password-1' });
    assert.equal(res.status, 401, email);
  }
  assert.equal(await emailNow(), EMAIL);
});

test('with the right password the email changes, other sessions end and this device gets a working cookie', async () => {
  const tokenHere = await userWithToken();
  const tokenElsewhere = tokenHere; // same version: another device's copy
  const res = await updateMe(tokenHere, { name: 'Owner', email: 'New@Example.com', currentPassword: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'new@example.com');
  assert.equal(await emailNow(), 'new@example.com');

  const fresh = newTokenOf(res);
  assert.ok(fresh, 'expected a fresh auth cookie');
  assert.equal((await me(fresh)).status, 200);
  assert.equal((await me(tokenElsewhere)).status, 401);
});

test('the right password with a taken email still answers 409 and changes nothing', async () => {
  const token = await userWithToken();
  await User.create({ name: 'Other', email: 'taken@example.com', password: PASSWORD });
  const res = await updateMe(token, { name: 'Owner', email: 'taken@example.com', currentPassword: PASSWORD });
  assert.equal(res.status, 409);
  assert.equal(await emailNow(), EMAIL);
  assert.equal((await me(token)).status, 200);
});

test('saving the name with the same email (what the profile form sends) needs no password and keeps sessions', async () => {
  const token = await userWithToken();
  const res = await updateMe(token, { name: 'Renamed', email: ' OWNER@example.com ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Renamed');
  assert.equal(newTokenOf(res), null);
  assert.equal((await me(token)).status, 200);
  assert.equal((await User.findOne({ email: EMAIL })).tokenVersion, 0);
});

test('a password change keeps this device signed in with a fresh cookie and ends the old token', async () => {
  const token = await userWithToken();
  const res = await updateMe(token, { currentPassword: PASSWORD, newPassword: 'AnotherStr0ng!' });
  assert.equal(res.status, 200);
  const fresh = newTokenOf(res);
  assert.ok(fresh);
  assert.equal((await me(fresh)).status, 200);
  assert.equal((await me(token)).status, 401);
});
