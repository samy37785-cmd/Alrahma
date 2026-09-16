import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Auth hardening security batch — closing the Supabase-mode gap: an earlier
// round removed legacy protect+adminOnly admin-read routes (reachable with
// nothing but a regular customer session whose role claim said 'admin', not
// a real hardened admin+MFA session) from the Mongo route files and moved
// them under /api/v1/admin/* (verifyAccessToken + MFA/AAL2 + RBAC). That
// batch only touched 2 of 9 Supabase route mirrors
// (data/supabase/routes/couponRoutes.js, invoiceRoutes.js) — this file
// proves the other 7 are now closed too.
//
// No real Postgres/Mongo connection is needed: every assertion below is
// either "this route no longer exists at all" (a plain 404, resolved by
// Express's router before any auth/DB code runs) or "this route now demands
// a real admin_at cookie" (verifyAccessToken's very first check, before any
// DB lookup — see middleware/adminAuth.js). DATA_BACKEND=supabase must be
// set BEFORE app.js is ever imported (isSupabaseBackend() is read at
// module-evaluation time by every `app.use(path, isSupabaseBackend() ? ... )`
// call in app.js), so app.js is imported dynamically inside before(), same
// pattern as payment-checkout-supabase-backend.test.js /
// admin-trials-subscribers-supabase-gap.test.js.
let app;

before(async () => {
  process.env.DATA_BACKEND = 'supabase';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-supabase-backend-mode';
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-supabase-jwt-secret';
  process.env.ADMIN_JWT_ACCESS_SECRET = process.env.ADMIN_JWT_ACCESS_SECRET || 'test-admin-access-secret';
  process.env.ADMIN_ENCRYPTION_KEY = process.env.ADMIN_ENCRYPTION_KEY || 'a'.repeat(64);

  ({ default: app } = await import('../app.js'));
}, { timeout: 30_000 });

// A cookie a real attacker could plausibly have forged/obtained under the OLD
// scheme — a legacy customer `token` cookie is NOT what these routes ever
// checked though (they checked req.user.role after protect() resolved a real
// session), so a bare fake cookie proves nothing extra here; what matters is
// that these paths 404 regardless of any cookie sent at all, since the route
// itself no longer exists.
const SPOOFED_LEGACY_COOKIE = 'token=not-a-real-session-just-illustrating-no-cookie-helps';

const REMOVED_OLD_ADMIN_ROUTES = [
  '/api/certificates',
  '/api/contact',
  '/api/enrollments',
  '/api/newsletter',
  '/api/trials',
];

test('the old legacy protect+adminOnly admin-read routes no longer exist under DATA_BACKEND=supabase (404 regardless of any cookie sent)', async () => {
  for (const path of REMOVED_OLD_ADMIN_ROUTES) {
    const res = await request(app).get(path).set('Cookie', SPOOFED_LEGACY_COOKIE);
    assert.equal(res.status, 404, `GET ${path} expected 404 (route removed), got ${res.status}`);
  }
});

test('the old legacy hifz/progress admin lookups no longer exist under DATA_BACKEND=supabase', async () => {
  for (const path of ['/api/hifz/user/000000000000000000000000', '/api/progress/user/000000000000000000000000']) {
    const res = await request(app).get(path).set('Cookie', SPOOFED_LEGACY_COOKIE);
    assert.equal(res.status, 404, `GET ${path} expected 404 (route removed), got ${res.status}`);
  }
});

const REAL_ADMIN_EQUIVALENTS = [
  '/api/v1/admin/certificates',
  '/api/v1/admin/contact',
  '/api/v1/admin/enrollments',
];

test('the real /api/v1/admin equivalents exist and reject the same spoofed cookie with 401 (not 404, not 200) — proves separation, not just "old hole closed"', async () => {
  for (const path of REAL_ADMIN_EQUIVALENTS) {
    const res = await request(app).get(path).set('Cookie', SPOOFED_LEGACY_COOKIE);
    assert.equal(res.status, 401, `GET ${path} expected 401 (real admin_at required), got ${res.status}`);
  }
});

test('DATA_BACKEND=supabase: /v1/admin/subscribers and /v1/admin/trials still explicitly 501 (no safe adapter exists — not silently reopened)', async () => {
  for (const path of ['/api/v1/admin/subscribers', '/api/v1/admin/trials']) {
    const res = await request(app).get(path).set('Cookie', SPOOFED_LEGACY_COOKIE);
    // ipWhitelist/verifyAccessToken/maintenanceGuard all run before these —
    // with no admin_at cookie the request never even reaches the 501
    // responder, so 401 (not 404, not 200/500) is the correct outer result;
    // the 501 responder itself is separately proven wired in
    // admin-trials-subscribers-supabase-gap.test.js's structural router
    // inspection.
    assert.equal(res.status, 401, `GET ${path} expected 401 (admin gate runs first), got ${res.status}`);
  }
});

test('new admin adapter: /v1/admin/users/:id/hifz and /:id/progress exist and require real admin auth (401, not 404)', async () => {
  for (const path of ['/api/v1/admin/users/000000000000000000000000/hifz', '/api/v1/admin/users/000000000000000000000000/progress']) {
    const res = await request(app).get(path).set('Cookie', SPOOFED_LEGACY_COOKIE);
    assert.equal(res.status, 401, `GET ${path} expected 401 (route exists, real admin_at required), got ${res.status}`);
  }
});
