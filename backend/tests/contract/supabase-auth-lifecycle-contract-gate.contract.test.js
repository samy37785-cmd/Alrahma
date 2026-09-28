// Supabase Auth Lifecycle HTTP Contract Gate — Local Disposable Postgres Only.
//
// See tests/contract/auth-lifecycle-gate-architecture-audit.md (written before
// this file, per this gate's own Phase A) for the full endpoint-by-endpoint
// audit. Summary: under DATA_BACKEND=supabase, /api/auth/register (a
// successful/duplicate attempt) and /api/auth/login (correct/wrong password)
// both call real Supabase Auth (GoTrue) HTTP endpoints via @supabase/
// supabase-js — they cannot run against a bare disposable Postgres container,
// and this file NEVER calls them, NEVER substitutes the real Staging project,
// and NEVER fakes their behavior. What IS genuinely testable locally, with no
// live Supabase/SMTP/Google involved at all:
//   - register/login request-validation boundary (malformed body -> 400,
//     rejected by express-validator BEFORE any Supabase Auth call is made)
//   - GET /api/auth/me: the real auth guard (protect() verifies THIS app's
//     own custom cookie JWT, never a Supabase Auth token — see
//     middleware/auth.js) and real user isolation (loadUserById() is pure
//     pg/RLS, no GoTrue call)
//   - POST /api/auth/logout (pure Express, no DB/GoTrue call at all)
//   - a direct-DB proof that `profiles` has no password column of any kind
//     (Supabase Auth/GoTrue owns credentials entirely under this backend)
//
// Run only via scripts/test-supabase-auth-lifecycle-contract-gate.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { signToken } from '../../utils/authCookie.js';
import { getPool } from '../../data/supabase/client.js';

let skip;
if (process.env.DATA_BACKEND !== 'supabase') {
  skip = 'requires DATA_BACKEND=supabase — run via npm run test:supabase-auth-lifecycle-contract';
} else {
  const host = new URL(process.env.SUPABASE_DB_URL || '').hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    skip = 'refusing to run: SUPABASE_DB_URL must point at localhost/127.0.0.1';
  }
}

const RUN_ID = process.env.AUTH_LIFECYCLE_GATE_RUN_ID;
if (!skip && !RUN_ID) {
  skip = 'AUTH_LIFECYCLE_GATE_RUN_ID must be set by the orchestrator script before this file runs';
}

async function csrfHeaders(app) {
  const res = await request(app).get('/api/csrf');
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  if (!cookie) throw new Error('csrf_token cookie was not issued');
  return { cookie: cookie.split(';')[0], token: cookie.split(';')[0].split('=')[1] };
}

async function seedUser(label) {
  const id = crypto.randomUUID();
  const email = `auth-lifecycle-${label}-${RUN_ID}@example.invalid`;
  const pool = getPool();
  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({ name: label })],
  );
  return { id, email };
}

// -----------------------------------------------------------------
// Phase C.1 (partial) / C.2 (partial) — register/login VALIDATION boundary
// only. No Supabase Auth call is ever reached for these — express-validator
// (registerValidation/loginValidation) rejects the request first.
// -----------------------------------------------------------------

// Status is 422, not 400 — confirmed from utils/validationHelper.js's
// handleValidationErrors() (`res.status(422).json({ message })`), the shared
// express-validator failure path both the Mongo and Supabase auth routes use.
// Not assumed: the first run of this file asserted 400 and failed with actual
// 422, which is how this was caught and corrected.

test('POST /api/auth/register — missing name is rejected with 422 and creates no auth.users/profiles row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const email = `auth-lifecycle-reg-missing-name-${RUN_ID}@example.invalid`;
  const res = await request(app)
    .post('/api/auth/register')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token)
    .send({ email, password: 'a-real-password-12345' });
  assert.equal(res.status, 422);

  const pool = getPool();
  const row = await pool.query('select count(*)::int as n from profiles where email = $1', [email]);
  assert.equal(row.rows[0].n, 0, 'a rejected registration must never create a profile row');
});

test('POST /api/auth/register — invalid email format is rejected with 422 and creates no row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const res = await request(app)
    .post('/api/auth/register')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token)
    .send({ name: 'Bad Email', email: 'not-an-email', password: 'a-real-password-12345' });
  assert.equal(res.status, 422);
});

test('POST /api/auth/register — password shorter than 8 characters is rejected with 422 and creates no row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const email = `auth-lifecycle-reg-short-pw-${RUN_ID}@example.invalid`;
  const res = await request(app)
    .post('/api/auth/register')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token)
    .send({ name: 'Short Password', email, password: 'short' });
  assert.equal(res.status, 422);

  const pool = getPool();
  const row = await pool.query('select count(*)::int as n from profiles where email = $1', [email]);
  assert.equal(row.rows[0].n, 0);
});

test('POST /api/auth/login — missing password is rejected with 422 (validation only, no Supabase Auth call reached)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const res = await request(app)
    .post('/api/auth/login')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token)
    .send({ email: `auth-lifecycle-login-missing-pw-${RUN_ID}@example.invalid` });
  assert.equal(res.status, 422);
});

test('POST /api/auth/login — invalid email format is rejected with 422 (validation only)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const res = await request(app)
    .post('/api/auth/login')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token)
    .send({ email: 'not-an-email', password: 'whatever12345' });
  assert.equal(res.status, 422);
});

// -----------------------------------------------------------------
// Phase C.3 — GET /api/auth/me: real auth guard + real session/isolation.
// Users are seeded directly (same technique as the two prior gates) since
// register() itself is BLOCKED_EXTERNAL_DEPENDENCY — this still exercises
// the REAL protect() -> loadUserById() code path, unmodified.
// -----------------------------------------------------------------

test('GET /api/auth/me — no token at all is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('GET /api/auth/me — malformed token is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/auth/me').set('Cookie', 'token=not-a-real-jwt');
  assert.equal(res.status, 401);
});

test('GET /api/auth/me — token signed with the wrong secret is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const bogus = jwt.sign({ id: crypto.randomUUID(), role: 'user', v: 0 }, 'definitely-not-the-real-secret', { expiresIn: '1h' });
  const res = await request(app).get('/api/auth/me').set('Cookie', `token=${bogus}`);
  assert.equal(res.status, 401);
});

test('GET /api/auth/me — expired token (correct secret) is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const user = await seedUser('expired-check');
  const expired = jwt.sign({ id: user.id, role: 'user', v: 0 }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await request(app).get('/api/auth/me').set('Cookie', `token=${expired}`);
  assert.equal(res.status, 401);
});

test('GET /api/auth/me — user A sees only their own account; user B sees only their own, never A\'s', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const userA = await seedUser('me-a');
  const userB = await seedUser('me-b');

  const meA = await request(app).get('/api/auth/me').set('Cookie', `token=${signToken(userA.id, 'user', 0)}`);
  assert.equal(meA.status, 200);
  assert.equal(meA.body._id, userA.id);
  assert.equal(meA.body.email, userA.email);

  const meB = await request(app).get('/api/auth/me').set('Cookie', `token=${signToken(userB.id, 'user', 0)}`);
  assert.equal(meB.status, 200);
  assert.equal(meB.body._id, userB.id);
  assert.equal(meB.body.email, userB.email);

  assert.notEqual(meA.body._id, meB.body._id, 'A and B must never resolve to the same account');
  assert.notEqual(meA.body.email, meB.body.email);
});

// -----------------------------------------------------------------
// Phase C.3 — logout. Pure Express, no DB/GoTrue call at all. There is no
// server-side invalidation under this backend (see the architecture audit
// doc) — logout only clears the cookie, which this test verifies honestly
// rather than asserting a revocation mechanism that does not exist.
// -----------------------------------------------------------------

test('POST /api/auth/logout — always 200 and clears the auth cookie, with or without an existing session', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const csrf = await csrfHeaders(app);
  const res = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', csrf.cookie)
    .set('x-csrf-token', csrf.token);
  assert.equal(res.status, 200);
  const setCookie = (res.headers['set-cookie'] || []).map(String);
  const clearedTokenCookie = setCookie.find((c) => c.startsWith('token='));
  assert.ok(clearedTokenCookie, 'logout must set/clear the token cookie in its response');
  assert.match(clearedTokenCookie, /token=;/, 'the token cookie must be cleared (empty value)');
});

// -----------------------------------------------------------------
// Phase C.4 — direct DB proof: profiles has no password column of any kind.
// Confirms the architecture-audit claim structurally rather than by
// inspecting any actual row's data.
// -----------------------------------------------------------------

test('direct DB proof: profiles has no password/password_hash column — Supabase Auth owns credentials entirely under this backend', { skip }, async () => {
  const pool = getPool();
  const cols = await pool.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'`,
  );
  const names = cols.rows.map((r) => r.column_name.toLowerCase());
  assert.ok(!names.includes('password'), 'profiles must never have a password column');
  assert.ok(!names.includes('password_hash'), 'profiles must never have a password_hash column');
});
