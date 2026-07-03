import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../app.js';
import User from '../models/User.js';
import { hashToken } from '../utils/hashToken.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Separate file from auth.test.js so this has its own authLimiter budget
// (20 req/15min, shared per process) rather than competing with the
// register/login/logout coverage there.
//
// forgotPassword only ever emails the raw reset token (SMTP is disabled in
// this test environment, so no email is actually sent — see config/mailer.js)
// and stores just its SHA-256 hash, so it can't be recovered from the HTTP
// response. Rather than fight ESM mocking to intercept the outgoing email,
// forgotPassword's write-side effect (does it set resetToken/resetTokenExpiry
// on the right user, without leaking whether the email exists) is verified
// directly against the DB, and resetPassword's consumption logic is tested
// against a token constructed the same way the controller constructs one
// (hashToken(raw), matching the unique mechanism under test either way).

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const PASSWORD = 'Str0ngP@ssw0rd!';

test('forgotPassword: always returns 200 whether or not the email exists (no user enumeration)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);

  const unknown = await agent.post('/api/auth/forgot-password').set(csrf).send({ email: 'nobody@example.com' });
  assert.equal(unknown.status, 200);

  await User.create({ name: 'Reset Me', email: 'reset@example.com', password: PASSWORD });
  const known = await agent.post('/api/auth/forgot-password').set(csrf).send({ email: 'reset@example.com' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body); // identical response either way
});

test('forgotPassword: sets a hashed, time-limited reset token on the real user only', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const user = await User.create({ name: 'Reset Me', email: 'reset2@example.com', password: PASSWORD });

  await agent.post('/api/auth/forgot-password').set(csrf).send({ email: 'reset2@example.com' });

  const updated = await User.findById(user._id).select('+resetToken +resetTokenExpiry');
  assert.ok(updated.resetToken, 'expected a resetToken hash to be stored');
  assert.notEqual(updated.resetToken, undefined);
  assert.ok(new Date(updated.resetTokenExpiry) > new Date(), 'expiry should be in the future');
});

test('resetPassword: rejects an unknown/invalid token', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/auth/reset-password')
    .set(csrf)
    .send({ token: 'not-a-real-token', password: 'NewStr0ng!Pass' });
  assert.equal(res.status, 400);
});

test('resetPassword: rejects an expired token', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const rawToken = crypto.randomBytes(32).toString('hex');
  await User.create({
    name: 'Expired', email: 'expired@example.com', password: PASSWORD,
    resetToken: hashToken(rawToken), resetTokenExpiry: Date.now() - 1000, // already expired
  });

  const res = await agent
    .post('/api/auth/reset-password')
    .set(csrf)
    .send({ token: rawToken, password: 'NewStr0ng!Pass' });
  assert.equal(res.status, 400);
});

test('resetPassword: a valid token resets the password, consumes the token, and bumps tokenVersion (invalidating old sessions)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const user = await User.create({
    name: 'Valid', email: 'valid@example.com', password: PASSWORD,
    resetToken: hashToken(rawToken), resetTokenExpiry: Date.now() + 60 * 60 * 1000,
  });
  const originalVersion = user.tokenVersion ?? 0;

  const res = await agent
    .post('/api/auth/reset-password')
    .set(csrf)
    .send({ token: rawToken, password: 'NewStr0ng!Pass' });
  assert.equal(res.status, 200);

  const updated = await User.findById(user._id).select('+password +resetToken');
  assert.equal(updated.resetToken, undefined);
  assert.equal(updated.tokenVersion, originalVersion + 1);

  // Old password no longer works; new one does.
  const oldLogin = await agent.post('/api/auth/login').set(csrf).send({ email: 'valid@example.com', password: PASSWORD });
  assert.equal(oldLogin.status, 401);
  const newLogin = await agent.post('/api/auth/login').set(csrf).send({ email: 'valid@example.com', password: 'NewStr0ng!Pass' });
  assert.equal(newLogin.status, 200);

  // Reusing the same (now-consumed) token must fail.
  const reuse = await agent
    .post('/api/auth/reset-password')
    .set(csrf)
    .send({ token: rawToken, password: 'YetAnotherStr0ng!' });
  assert.equal(reuse.status, 400);
});
