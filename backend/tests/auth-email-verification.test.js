import { test, mock, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import Invoice from '../models/Invoice.js';
import { signToken } from '../utils/authCookie.js';
import { hashToken } from '../utils/hashToken.js';
import { verifyLink, EMAIL_VERIFY_TTL_MS } from '../utils/emailVerification.js';
import { siteOrigin } from '../config/site.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Audit AR-02: guest bookings and invoices are matched by email only, and
// anyone could sign up with someone else's email without proving it. New
// accounts (and changed emails) now start unconfirmed and get a link; that
// email-matched data shows only after confirming. Accounts from before this
// change (no field) count as confirmed. Google sign-in confirms the address,
// and takes an unconfirmed squatter account back from whoever created it.
// /api/auth allows 20 requests per IP per file (config/rateLimit.js): most
// users and tokens here are created directly.

const PASSWORD = 'Str0ngP@ssw0rd!';
const EMAIL = 'guest@example.com';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const tokenFor = (user) => signToken(user._id, user.role, user.tokenVersion ?? 0);
const authed = (method, path, token) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

async function post(path, body, token) {
  const { agent, csrf } = await agentWithCsrf(app);
  const req = agent.post(path).set(csrf);
  return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
}

async function guestData() {
  await Enrollment.create({ name: 'Guest', email: EMAIL, phone: '+390000000' });
  await Invoice.create({ customerEmail: EMAIL, plan: 'monthly', amount: 50, originalAmount: 50 });
}

// A user in the state sign-up leaves it in, with a known raw token.
async function unconfirmedUser(overrides = {}) {
  const raw = crypto.randomBytes(32).toString('hex');
  const user = await User.create({
    name: 'Guest', email: EMAIL, password: PASSWORD,
    emailVerified: false, emailVerifyToken: hashToken(raw), emailVerifyExpiry: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    ...overrides,
  });
  return { user, raw, token: tokenFor(user) };
}

test('sign-up starts unconfirmed with a stored token hash, and /me says so', async () => {
  const res = await post('/api/auth/register', { name: 'Guest', email: EMAIL, password: PASSWORD });
  assert.equal(res.status, 201);
  const user = await User.findOne({ email: EMAIL }).select('+emailVerifyToken +emailVerifyExpiry');
  assert.equal(user.emailVerified, false);
  assert.match(user.emailVerifyToken, /^[0-9a-f]{64}$/);
  assert.ok(user.emailVerifyExpiry > new Date());
  const me = await authed('get', '/api/auth/me', tokenFor(user));
  assert.equal(me.body.emailVerified, false);
  assert.equal('emailVerifyToken' in me.body, false);
});

test('an unconfirmed account does not see a guest booking or invoice under its email; after confirming, it does', async () => {
  await guestData();
  const { raw, token } = await unconfirmedUser();
  assert.equal((await authed('get', '/api/enrollments/mine', token)).body, null);
  assert.deepEqual((await authed('get', '/api/invoices', token)).body, []);

  const confirm = await post('/api/auth/verify-email', { token: raw });
  assert.equal(confirm.status, 200);
  assert.equal((await authed('get', '/api/auth/me', token)).body.emailVerified, true);
  assert.equal((await authed('get', '/api/enrollments/mine', token)).body.email, EMAIL);
  assert.equal((await authed('get', '/api/invoices', token)).body.length, 1);

  // single use
  assert.equal((await post('/api/auth/verify-email', { token: raw })).status, 400);
});

test('an invoice linked to the account itself shows even before confirming', async () => {
  const { user, token } = await unconfirmedUser();
  await Invoice.create({ user: user._id, customerEmail: 'other@example.com', plan: 'monthly', amount: 50, originalAmount: 50 });
  assert.equal((await authed('get', '/api/invoices', token)).body.length, 1);
});

test('an account from before email confirmation (no field) counts as confirmed', async () => {
  await guestData();
  const user = await User.create({ name: 'Old', email: EMAIL, password: PASSWORD });
  assert.equal(user.toObject().emailVerified, undefined);
  const token = tokenFor(user);
  assert.equal((await authed('get', '/api/auth/me', token)).body.emailVerified, true);
  assert.equal((await authed('get', '/api/enrollments/mine', token)).body.email, EMAIL);
});

test('a wrong, missing or expired token is refused with 400 and confirms nothing', async () => {
  const { raw } = await unconfirmedUser({ emailVerifyExpiry: new Date(Date.now() - 1000) });
  for (const body of [{ token: raw }, { token: 'f'.repeat(64) }, {}, { token: { $ne: null } }]) {
    assert.equal((await post('/api/auth/verify-email', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await User.findOne({ email: EMAIL })).emailVerified, false);
});

test('resend replaces the earlier link; for a confirmed account it changes nothing', async () => {
  const { raw: first, token } = await unconfirmedUser();
  const res = await post('/api/auth/verify-email/resend', {}, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Confirmation email sent.');
  assert.equal((await post('/api/auth/verify-email', { token: first })).status, 400);

  const confirmed = await User.create({ name: 'C', email: 'c@example.com', password: PASSWORD, emailVerified: true });
  const again = await post('/api/auth/verify-email/resend', {}, tokenFor(confirmed));
  assert.equal(again.body.message, 'Email already confirmed.');
});

test('changing the email makes it unconfirmed again, with a new link', async () => {
  const user = await User.create({ name: 'Guest', email: 'before@example.com', password: PASSWORD, emailVerified: true });
  const { agent, csrf } = await agentWithCsrf(app);
  const change = await agent.put('/api/auth/me').set(csrf).set('Authorization', `Bearer ${tokenFor(user)}`)
    .send({ name: 'Guest', email: EMAIL, currentPassword: PASSWORD });
  assert.equal(change.status, 200);
  const after = await User.findById(user._id).select('+emailVerifyToken');
  assert.equal(after.email, EMAIL);
  assert.equal(after.emailVerified, false);
  assert.match(after.emailVerifyToken, /^[0-9a-f]{64}$/);
});

test('the emailed link carries the token in the fragment', () => {
  assert.equal(verifyLink('abc'), `${siteOrigin()}/verify-email#token=abc`);
});

test('Google sign-in confirms an unconfirmed account and takes it back from whoever signed up first', async () => {
  const savedClient = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ aud: 'test-client.apps.googleusercontent.com', email: EMAIL, email_verified: 'true', sub: 'google-sub-1', name: 'Owner' }),
  }));
  try {
    const { token: squatterToken } = await unconfirmedUser(); // registered first, knows PASSWORD
    const res = await post('/api/auth/google', { credential: 'fake-id-token' });
    assert.equal(res.status, 200);

    const user = await User.findOne({ email: EMAIL }).select('+password');
    assert.equal(user.emailVerified, true);
    assert.equal(user.googleId, 'google-sub-1');
    assert.equal(await user.matchPassword(PASSWORD), false, 'the squatter password no longer works');
    assert.equal((await authed('get', '/api/auth/me', squatterToken)).status, 401, 'the squatter session ended');
  } finally {
    fetchMock.mock.restore();
    if (savedClient === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = savedClient;
  }
});

test('a brand-new Google account starts confirmed', async () => {
  const savedClient = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ aud: 'test-client.apps.googleusercontent.com', email: 'new@example.com', email_verified: true, sub: 'google-sub-2', name: 'New' }),
  }));
  try {
    assert.equal((await post('/api/auth/google', { credential: 'fake-id-token' })).status, 200);
    assert.equal((await User.findOne({ email: 'new@example.com' })).emailVerified, true);
  } finally {
    fetchMock.mock.restore();
    if (savedClient === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = savedClient;
  }
});
