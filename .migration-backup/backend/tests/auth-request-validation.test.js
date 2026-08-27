import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';
import app from '../app.js';

// Coverage for T10: register/login previously had only a manual truthy check
// ("please provide name, email and password") with no email-format check and
// no explicit password-length check on register (schema-level minlength was
// the only backstop). login had no input validation at all, which meant a
// non-string password (missing, or sent as a number/object/array) reached
// bcrypt.compare() and threw — a verified bug, turning a bad request into a
// 500 instead of a clean 401/422. These tests exercise the real
// registerValidation/loginValidation exported from authController.js via the
// real routes, not a reimplementation.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

test('register: rejects a malformed email with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'Amina', email: 'not-an-email', password: PASSWORD });
  assert.equal(res.status, 422);
  assert.equal(typeof res.body.message, 'string');

  const stored = await User.findOne({ email: 'not-an-email' });
  assert.equal(stored, null, 'a malformed email must never be persisted');
});

test('register: rejects a missing name with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ email: 'noname@example.com', password: PASSWORD });
  assert.equal(res.status, 422);
});

test('register: rejects a password shorter than 8 characters with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'Amina', email: 'shortpw@example.com', password: 'short1' });
  assert.equal(res.status, 422);

  const stored = await User.findOne({ email: 'shortpw@example.com' });
  assert.equal(stored, null);
});

test('register: rejects a missing password with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'Amina', email: 'nopw@example.com' });
  assert.equal(res.status, 422);
});

test('register: a well-formed request still succeeds exactly as before', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/register').set(csrf).send({ name: 'Amina', email: 'valid-register@example.com', password: PASSWORD });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, 'valid-register@example.com');
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test('login: a non-string password (number) no longer crashes with 500 — rejected cleanly with 422', async () => {
  await User.create({ name: 'Login User', email: 'login-crash@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-crash@example.com', password: 12345678 });
  assert.equal(res.status, 422);
});

test('login: a non-string password (object) no longer crashes with 500 — rejected cleanly with 422', async () => {
  await User.create({ name: 'Login User 2', email: 'login-crash2@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-crash2@example.com', password: { a: 1 } });
  assert.equal(res.status, 422);
});

test('login: a missing password is rejected with 422, not a crash', async () => {
  await User.create({ name: 'Login User 3', email: 'login-crash3@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-crash3@example.com' });
  assert.equal(res.status, 422);
});

test('login: a malformed email is rejected with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'not-an-email', password: PASSWORD });
  assert.equal(res.status, 422);
});

test('login: an existing user with the correct (well-formed) password still logs in exactly as before', async () => {
  await User.create({ name: 'Login User 4', email: 'login-ok@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-ok@example.com', password: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'login-ok@example.com');
});

test('login: a well-formed but wrong password still yields a clean 401 (not 422, not 500)', async () => {
  await User.create({ name: 'Login User 5', email: 'login-wrong@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-wrong@example.com', password: 'WrongButLongEnough1' });
  assert.equal(res.status, 401);
});

test('login: a short (5-char) but well-formed wrong password still yields a clean 401 — login has no minimum-length rule', async () => {
  await User.create({ name: 'Login User 6', email: 'login-short@example.com', password: PASSWORD });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.post('/api/auth/login').set(csrf).send({ email: 'login-short@example.com', password: 'wrong' });
  assert.equal(res.status, 401);
});
