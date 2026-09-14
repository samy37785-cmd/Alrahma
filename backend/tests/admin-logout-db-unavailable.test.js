import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import speakeasy from 'speakeasy';
import RefreshToken from '../models/RefreshToken.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';
import logger from '../config/logger.js';

// Review follow-up: admin logout must clear this app's own cookies locally
// even when MongoDB is unreachable -- an admin stuck looking "logged in"
// in their own browser during a real DB outage is exactly the kind of
// failure a security-critical logout path must not have. Two distinct
// things had to be fixed together, and this file proves both:
//
//   1. app.js's global DB-connection gate used to 503 EVERY /api/* request
//      -- including this one -- before it ever reached a controller
//      whenever connectDB() failed. No route, no controller, no
//      cookie-clearing code ever ran at all. app.js's DB_INDEPENDENT_PATHS
//      now exempts /logout specifically -- proven here by mocking
//      config/db.js's connectDB() to fail on demand and confirming /logout
//      still reaches the controller (and still 200s) while an ordinary
//      admin route correctly still 503s under the exact same failure.
//
//   2. Even past that gate, controllers/adminAuthController.js's logout()
//      itself must survive a genuine Mongoose query failure (a dropped
//      connection mid-request, not just a failed initial connect) without
//      that failure blocking the cookie-clearing `finally` block -- proven
//      here by making RefreshToken's own methods throw.
const dbModuleUrl = pathToFileURL(path.resolve('config/db.js')).href;

let app;
let dbShouldFail = false;

before(async () => {
  const realDbModule = await import(dbModuleUrl);
  mock.module(dbModuleUrl, {
    exports: {
      ...realDbModule,
      default: async (...args) => {
        if (dbShouldFail) throw new Error('MongoNetworkError: connect ECONNREFUSED (simulated outage)');
        return realDbModule.default(...args);
      },
    },
  });

  // setupTestDb() itself calls connectDB() (see tests/helpers/db.js) -- with
  // dbShouldFail still false at this point, that call passes straight
  // through to the real implementation and establishes a genuinely working
  // connection, exactly like every other test file.
  await setupTestDb();

  ({ default: app } = await import('../app.js'));
}, { timeout: 60_000 });

after(async () => {
  await teardownTestDb();
  mock.reset();
});

beforeEach(async () => {
  dbShouldFail = false;
  await clearTestDb();
});

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function loginWithMfa() {
  const { default: AdminUser } = await import('../models/AdminUser.js');
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
  assert.equal(verifyRes.status, 200, 'test setup: MFA verify must succeed');
  return { admin, agent, csrf };
}

test('the global DB-connection gate exempts /logout: a connectDB() failure still reaches the route and still clears cookies, while an ordinary admin route correctly still 503s under the exact same failure', async () => {
  const { agent, csrf } = await loginWithMfa();

  dbShouldFail = true;

  const logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  assert.equal(logoutRes.status, 200, '/logout must not 503 just because the DB-connection gate\'s own connectDB() call failed');
  assert.equal(logoutRes.body.message, 'Logged out successfully');
  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('admin_at=;')), 'admin_at must still be cleared');
  assert.ok(setCookie.some((c) => c.startsWith('admin_rt=;')), 'admin_rt must still be cleared');

  // Control: an ORDINARY admin route (not in DB_INDEPENDENT_PATHS) under
  // the exact same simulated outage must still be blocked -- proving this
  // is a deliberate, narrow exemption for /logout, not an accidental gap
  // that disabled the DB gate altogether.
  const usersRes = await agent.get('/api/v1/admin/users').set(csrf).send();
  assert.equal(usersRes.status, 503, 'a route NOT exempted from the DB gate must still 503 under the same simulated outage');
});

test('logout() survives a genuine Mongoose query failure (not just a failed initial connect) — cookies are still cleared and the failure is logged, not swallowed', async (t) => {
  const { admin, agent, csrf } = await loginWithMfa();

  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  const originalFindOne = RefreshToken.findOne.bind(RefreshToken);
  const originalDistinct = RefreshToken.distinct.bind(RefreshToken);
  RefreshToken.findOne = () => { throw new Error('MongoNetworkError: connection closed (simulated mid-request drop)'); };
  RefreshToken.distinct = () => { throw new Error('MongoNetworkError: connection closed (simulated mid-request drop)'); };

  let logoutRes;
  try {
    logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send(); // must not throw / 500
  } finally {
    RefreshToken.findOne = originalFindOne;
    RefreshToken.distinct = originalDistinct;
  }

  assert.equal(logoutRes.status, 200, 'logout must still return 200 despite the Mongoose query throwing');
  assert.equal(logoutRes.body.message, 'Logged out successfully');
  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('admin_at=;')), 'admin_at must still be cleared');
  assert.ok(setCookie.some((c) => c.startsWith('admin_rt=;')), 'admin_rt must still be cleared');

  assert.ok(
    errorCalls.some((c) => c.message.includes('could not look up the refresh token')),
    'the refresh-token lookup failure must be logged, not silently swallowed',
  );

  // Unaffected by any of the above: the admin's real session must still
  // exist in the (perfectly healthy, only the CALLS above were poisoned)
  // database, untouched — logout could not revoke what it could not reach.
  const stillThere = await RefreshToken.exists({ adminId: admin._id });
  assert.ok(stillThere, 'sanity: the real DB itself was never actually down — only the specific calls were made to fail');
});
