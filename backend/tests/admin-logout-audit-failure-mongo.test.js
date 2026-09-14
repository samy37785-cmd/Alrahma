import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';
import speakeasy from 'speakeasy';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import TokenFamily from '../models/TokenFamily.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';
import logger from '../config/logger.js';

// Review follow-up: an audit-write failure (Mongo unreachable, a transient
// write error, whatever) must never prevent controllers/
// adminAuthController.js's logout() from clearing this app's own cookies
// locally — an admin must never be stuck looking "logged in" in their own
// browser just because SystemAuditLog.create() threw. This proves it
// against the real HTTP endpoint, with auditFromAdmin (services/
// auditService.js) genuinely throwing — not a hand-mocked req/res — and
// confirms the revoke itself still ran (TokenFamily/RefreshToken really
// end up revoked) even though the audit write that runs after it failed.
const auditServiceUrl = pathToFileURL(path.resolve('services/auditService.js')).href;

let app;
let auditImpl;

before(async () => {
  await setupTestDb();

  const realAuditServiceModule = await import(auditServiceUrl);
  mock.module(auditServiceUrl, {
    exports: {
      ...realAuditServiceModule,
      // Indirected through auditImpl (reset in beforeEach) so individual
      // tests can make just the logout audit call throw, while every other
      // stage (login, mfa/verify) still writes a real audit row via the
      // real implementation — those are not what this file is testing.
      auditFromAdmin: async (adminUser, action, req, extra) =>
        auditImpl(adminUser, action, req, extra, realAuditServiceModule.auditFromAdmin),
    },
  });

  ({ default: app } = await import('../app.js'));
}, { timeout: 60_000 });

after(async () => {
  await teardownTestDb();
  mock.reset();
});

beforeEach(async () => {
  await clearTestDb();
  auditImpl = (adminUser, action, req, extra, realFn) => realFn(adminUser, action, req, extra);
});

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function loginWithMfa() {
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

test('logout still returns 200 and clears every cookie when the auth.logout audit write throws, and still revokes the session for real', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  const { admin, agent, csrf } = await loginWithMfa();

  auditImpl = async (adminUser, action, req, extra, realFn) => {
    if (action === 'auth.logout') throw new Error('Mongo audit write failed: connection reset');
    return realFn(adminUser, action, req, extra);
  };

  const logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send(); // must not 500

  assert.equal(logoutRes.status, 200, 'logout must still return 200 despite the audit write throwing');
  assert.equal(logoutRes.body.message, 'Logged out successfully');

  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('admin_at=;')), 'admin_at must still be cleared');
  assert.ok(setCookie.some((c) => c.startsWith('admin_rt=;')), 'admin_rt must still be cleared');

  // The revoke itself (which runs BEFORE the audit call) must be entirely
  // unaffected by the audit call throwing after it.
  const stillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(stillActive, null, 'every refresh token for this admin must still end up revoked');
  const families = await RefreshToken.distinct('family', { adminId: admin._id });
  const familyDoc = await TokenFamily.findOne({ family: families[0] });
  assert.equal(familyDoc.revoked, true);

  assert.ok(
    errorCalls.some((c) => c.message.includes('audit write failed')),
    'the audit failure must be logged, not silently swallowed',
  );
});
