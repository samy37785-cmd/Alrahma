import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import AdminUser from '../models/AdminUser.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';
import logger from '../config/logger.js';

// Round 5 review follow-up: middleware/adminAuth.js's identifyAdminForLogout()
// used to call loadAdminForBackend() (which is AdminUser.findById() under
// Mongo, loadAdminById() under Supabase) with no try/catch of its own. Being
// wrapped in asyncHandler (utils/asyncHandler.js), an unguarded throw there
// was forwarded straight to Express's central error handler via next(err) —
// which responds BEFORE the request ever reaches the logout controller, so
// none of the cookie-clearing code in either controllers/
// adminAuthController.js's logout() or data/supabase/adminAuthController.js's
// logout() ever ran at all. identifyAdminForLogout() exists specifically so
// /logout stays reachable no matter what (see its own opening comment) — an
// admin trying to log out during exactly the kind of outage where "am I
// still logged in" matters most would instead get a bare 500 and keep every
// cookie in their browser. This file proves the fix for BOTH backends: the
// lookup failure must be swallowed as best-effort (logged, not silently
// dropped), and the request must still reach the controller and 200 with
// cookies cleared.
//
// The Mongo case runs a real, valid admin_at/admin_rt session against a real
// HTTP request through the real app (mongodb-memory-server, no external
// service) with AdminUser.findById() monkeypatched to throw — proving the
// full path end to end, not just the middleware function in isolation. The
// Supabase case unit-tests identifyAdminForLogout() directly (DATA_BACKEND=
// supabase, loadAdmin.js's loadAdminById() overridden via node:test's
// experimental module-mock support to throw) since standing up a real
// Postgres/GoTrue-backed app is out of scope here — this is the "if
// possible" companion the review asked for, exercising the same middleware
// code path (loadAdminForBackend()'s isSupabaseBackend() branch) that the
// Mongo test cannot reach.

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

test('Mongo: identifyAdminForLogout swallows an AdminUser.findById() throw as best-effort — /logout still reaches the controller, still returns 200, and cookies are still cleared', async (t) => {
  await setupTestDb();
  const { default: app } = await import('../app.js');

  const admin = await AdminUser.create({
    name: 'Test Admin',
    email: 'admin@example.com',
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
  const secret = speakeasy.generateSecret({ length: 32 });
  admin.setMfaSecret(secret.base32);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/v1/admin/auth/login').set(csrf).send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  const verifyRes = await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set(csrf)
    .send({ token: speakeasy.totp({ secret: secret.base32, encoding: 'base32' }) });
  assert.equal(verifyRes.status, 200, 'test setup: MFA verify must succeed and leave a genuinely valid admin_at on the agent');

  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  const originalFindById = AdminUser.findById.bind(AdminUser);
  AdminUser.findById = () => { throw new Error('MongoNetworkError: connection closed (simulated mid-request drop)'); };

  let logoutRes;
  try {
    // The agent's admin_at cookie is still genuinely valid (signature and
    // exp both fine) — this is NOT the expired-token grace-window path
    // (middleware/adminAuth.js's LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS); it is
    // loadAdminForBackend() itself throwing while looking up an otherwise
    // perfectly valid session.
    logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  } finally {
    AdminUser.findById = originalFindById;
    await teardownTestDb();
  }

  assert.equal(logoutRes.status, 200, 'logout must still return 200 despite identifyAdminForLogout\'s own admin lookup throwing');
  assert.equal(logoutRes.body.message, 'Logged out successfully');
  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('admin_at=;')), 'admin_at must still be cleared');
  assert.ok(setCookie.some((c) => c.startsWith('admin_rt=;')), 'admin_rt must still be cleared');

  assert.ok(
    errorCalls.some((c) => c.message.includes('identifyAdminForLogout') && c.message.includes('admin lookup failed')),
    'the lookup failure must be logged, not silently swallowed',
  );
});

test('Supabase: identifyAdminForLogout swallows a loadAdminById() throw the same way — proceeds to next() without an error, and never sets req.adminUser/req.adminId', async (t) => {
  const originalDataBackend = process.env.DATA_BACKEND;
  process.env.DATA_BACKEND = 'supabase';
  process.env.ADMIN_JWT_ACCESS_SECRET = process.env.ADMIN_JWT_ACCESS_SECRET || 'test-admin-access-secret';

  const loadAdminUrl = pathToFileURL(path.resolve('data/supabase/loadAdmin.js')).href;
  const realLoadAdminModule = await import(loadAdminUrl);
  mock.module(loadAdminUrl, {
    exports: {
      ...realLoadAdminModule,
      loadAdminById: async () => { throw new Error('Postgres unreachable (simulated outage)'); },
    },
  });

  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  try {
    const { identifyAdminForLogout } = await import('../middleware/adminAuth.js');

    const validAdminAt = jwt.sign(
      { id: 'supabase-admin-id-123', role: 'admin', mfaVerified: true },
      process.env.ADMIN_JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    const req = { cookies: { admin_at: validAdminAt } };
    const res = {};
    let nextCalledWith = 'NOT_CALLED';
    const next = (err) => { nextCalledWith = err; };

    await identifyAdminForLogout(req, res, next);

    assert.equal(nextCalledWith, undefined, 'next() must be called with no error — the request must still reach the logout controller');
    assert.equal(req.adminUser, undefined, 'a failed lookup must never fabricate an admin identity');
    assert.equal(req.adminId, undefined);
    assert.ok(
      errorCalls.some((c) => c.message.includes('identifyAdminForLogout') && c.message.includes('admin lookup failed')),
      'the lookup failure must be logged, not silently swallowed',
    );
  } finally {
    mock.reset();
    if (originalDataBackend === undefined) delete process.env.DATA_BACKEND;
    else process.env.DATA_BACKEND = originalDataBackend;
  }
});
