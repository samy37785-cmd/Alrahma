import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

// AR-04 on DATA_BACKEND=supabase. app.js mounts a separate set of route files
// in this mode (data/supabase/routes/), so the closed admin reads are checked
// here too, with the app booted in Supabase mode (same technique as
// payment-checkout-supabase-backend.test.js: env first, then a dynamic
// import of app.js).
//
// Everything in this file is answered before any database query, so no
// Postgres is needed: a removed route never runs `protect`, and the admin
// router checks the IP allowlist and the admin session cookie first. The
// MFA check, the permissions and a successful read need a real Postgres and
// live in tests/contract/supabase-auth-booking-contract-gate.contract.test.js.

const ALLOWED_IP = '198.51.100.7';
const OTHER_IP = '203.0.113.9';
const STUDENT_ID = crypto.randomUUID();

let app;
let signToken;

before(async () => {
  process.env.DATA_BACKEND = 'supabase';
  process.env.ADMIN_IP_WHITELIST = ALLOWED_IP;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-supabase-backend-mode';
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:1/unused-placeholder';
  // Fake, non-routable values: nothing here reaches data/supabase/client.js's
  // pool, which only connects on the first query.
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-supabase-jwt-secret';
  ({ default: app } = await import('../app.js'));
  ({ signToken } = await import('../utils/authCookie.js'));
}, { timeout: 30_000 });

const CLOSED_PATHS = [
  '/api/enrollments',
  '/api/trials',
  '/api/newsletter',
  '/api/contact',
  '/api/coupons',
  '/api/certificates',
  `/api/certificates?userId=${STUDENT_ID}`,
  '/api/invoices/admin',
  `/api/progress/user/${STUDENT_ID}`,
  `/api/hifz/user/${STUDENT_ID}`,
];

const NEW_ADMIN_PATHS = [
  '/api/v1/admin/trials',
  '/api/v1/admin/newsletter',
  `/api/v1/admin/certificates?userId=${STUDENT_ID}`,
  `/api/v1/admin/users/${STUDENT_ID}/progress`,
  `/api/v1/admin/users/${STUDENT_ID}/hifz`,
];

// A regular-account session whose profile role is 'admin' — what an owner's
// own password-only login is under this backend (0013 sets profiles.role to
// 'admin' for every admin assignment).
const adminRoleAccountCookie = () => `token=${signToken(crypto.randomUUID(), 'admin')}`;

test('DATA_BACKEND=supabase: every old admin read answers 404, with or without a role "admin" account', async () => {
  for (const path of CLOSED_PATHS) {
    const anon = await request(app).get(path);
    assert.equal(anon.status, 404, `${path} (anonymous) expected 404, got ${anon.status}`);
    const account = await request(app).get(path).set('Cookie', adminRoleAccountCookie());
    assert.equal(account.status, 404, `${path} (role admin account) expected 404, got ${account.status}`);
  }
});

test('DATA_BACKEND=supabase: the new admin routes refuse a role "admin" account (no admin console session)', async () => {
  for (const path of NEW_ADMIN_PATHS) {
    const res = await request(app).get(path).set('Cookie', adminRoleAccountCookie()).set('X-Forwarded-For', ALLOWED_IP);
    assert.equal(res.status, 401, `${path} expected 401, got ${res.status}`);
  }
});

test('DATA_BACKEND=supabase: the new admin routes refuse an address outside the allowlist before anything else', async () => {
  for (const path of NEW_ADMIN_PATHS) {
    const res = await request(app).get(path).set('X-Forwarded-For', OTHER_IP);
    assert.equal(res.status, 403, `${path} from ${OTHER_IP} expected 403, got ${res.status}`);
  }
});
