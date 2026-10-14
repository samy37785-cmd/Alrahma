import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { signToken } from '../utils/authCookie.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Audit AR-08: logout used to clear the cookie only, so a copy of the JWT kept
// working until it expired (7 days by default). Logout now bumps the user's
// tokenVersion, which protect() already compares (as after a password change):
// the token ends at once, on every device.

const PASSWORD = 'Str0ngP@ssw0rd!';
const EMAIL = 'logout-user@example.com';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

function tokenOf(res) {
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('token='));
  assert.ok(cookie, 'expected a token cookie');
  return cookie.split(';')[0].slice('token='.length);
}

// /register and /login allow few requests per IP (config/rateLimit.js), so only
// the first test signs in over HTTP; the others mint the same token directly.
async function userWithToken() {
  const user = await User.create({ name: 'L', email: EMAIL, password: PASSWORD });
  return signToken(user._id, user.role, user.tokenVersion ?? 0);
}

const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

async function logoutWith(token) {
  const { agent, csrf } = await agentWithCsrf(app);
  const req = agent.post('/api/auth/logout').set(csrf);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

test('after logout, a copy of the token and the token of another device are both refused; a new login works', async () => {
  const device1 = await agentWithCsrf(app);
  const tokenA = tokenOf(await device1.agent.post('/api/auth/register').set(device1.csrf).send({ name: 'L', email: EMAIL, password: PASSWORD }));
  const device2 = await agentWithCsrf(app);
  const tokenB = tokenOf(await device2.agent.post('/api/auth/login').set(device2.csrf).send({ email: EMAIL, password: PASSWORD }));
  assert.equal((await me(tokenA)).status, 200);
  assert.equal((await me(tokenB)).status, 200);

  const out = await device1.agent.post('/api/auth/logout').set(device1.csrf);
  assert.equal(out.status, 200);
  assert.match((out.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('token=')) || '', /Expires=Thu, 01 Jan 1970/);

  assert.equal((await me(tokenA)).status, 401);
  assert.equal((await me(tokenB)).status, 401);

  const device3 = await agentWithCsrf(app);
  const tokenC = tokenOf(await device3.agent.post('/api/auth/login').set(device3.csrf).send({ email: EMAIL, password: PASSWORD }));
  assert.equal((await me(tokenC)).status, 200);
});

test('a token that already ended cannot sign the user out again', async () => {
  const oldToken = await userWithToken();
  assert.equal((await logoutWith(oldToken)).status, 200); // ends oldToken (version 0 -> 1)

  const user = await User.findOne({ email: EMAIL });
  const current = signToken(user._id, user.role, user.tokenVersion);
  assert.equal((await logoutWith(oldToken)).status, 200);
  assert.equal((await User.findOne({ email: EMAIL })).tokenVersion, 1);
  assert.equal((await me(current)).status, 200);
});

test('logout without a token, or with a forged one, still answers 200 and changes nothing', async () => {
  const token = await userWithToken();
  assert.equal((await logoutWith(null)).status, 200);
  assert.equal((await logoutWith('not.a.jwt')).status, 200);
  assert.equal((await me(token)).status, 200);
  assert.equal((await User.findOne({ email: EMAIL })).tokenVersion, 0);
});

test('a user created before tokenVersion existed (no field) is signed out too', async () => {
  const token = await userWithToken();
  await User.collection.updateOne({ email: EMAIL }, { $unset: { tokenVersion: '' } });
  assert.equal((await me(token)).status, 200);
  assert.equal((await logoutWith(token)).status, 200);
  assert.equal((await me(token)).status, 401);
});
