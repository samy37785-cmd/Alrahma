import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import request from 'supertest';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import TokenFamily from '../models/TokenFamily.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Review follow-up: POST /api/v1/admin/auth/logout used to sit behind
// verifyAccessToken like every other protected admin route, which is a
// flat 401 the instant admin_at's 15-minute window has passed -- there was
// no way left to reach this app's own logout at all once that happened,
// even though a real admin_rt-based revoke (controllers/
// adminAuthController.js's logout()) existed the whole time. This file
// proves the fix end-to-end against the real HTTP endpoints, with a
// genuinely expired (but signature-valid) admin_at -- not a hand-mocked
// request -- and confirms the fix actually revokes something real: a
// refresh attempted after this logout must fail.
before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function makeAdminWithMfa(overrides = {}) {
  const admin = await AdminUser.create({
    name: 'Test Admin',
    email: 'admin@example.com',
    password: ADMIN_PASSWORD,
    role: 'admin',
    ...overrides,
  });
  const secret = speakeasy.generateSecret({ length: 32 });
  admin.setMfaSecret(secret.base32);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });
  return { admin, totpSecret: secret.base32 };
}

async function loginAgent(email, totpSecret) {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/v1/admin/auth/login').set(csrf).send({ email, password: ADMIN_PASSWORD });
  const verifyRes = await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set(csrf)
    .send({ token: speakeasy.totp({ secret: totpSecret, encoding: 'base32' }) });
  assert.equal(verifyRes.status, 200, 'test setup: MFA verify must succeed');
  return { agent, csrf, verifyRes };
}

function cookieValue(res, name) {
  const setCookie = res.headers['set-cookie'] || [];
  // A response can legitimately carry TWO Set-Cookie headers for the same
  // name — a real value on its current Path plus an empty/expiring
  // directive clearing a legacy Path (see clearLegacyRefreshCookie(),
  // utils/adminAuthTokens.js) — so `name=;` (an empty value) is explicitly
  // excluded here: that is always the clearing directive, never a real
  // value a test would want to extract.
  const match = setCookie.map(String).find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  return match ? match.split(';')[0].split('=')[1] : null;
}

// A genuinely expired token: same secret, same claim shape signAccessToken()
// produces, but `exp` already in the past. jwt.verify() with its default
// (expiration-checking) options rejects this exactly like a real 15-minutes-
// later admin_at would -- this is not a forged/tampered token, it is what a
// real one looks like after its window closes.
function mintExpiredAccessToken(adminId) {
  return jwt.sign(
    { id: String(adminId), role: 'admin', mfaVerified: true },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '-10s' },
  );
}

test('logout succeeds via admin_rt even when admin_at has already expired, and the refresh token it revoked can never be used again', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { csrf, verifyRes } = await loginAgent('admin@example.com', totpSecret);

  const realRefreshToken = cookieValue(verifyRes, 'admin_rt');
  assert.ok(realRefreshToken, 'login must have issued a real admin_rt');

  // Sanity check on the test's own premise: a normal, non-expired admin_at
  // would be accepted by verifyAccessToken -- confirm the token we're about
  // to mint really is rejected by real expiration checking (not just
  // hand-waved), so this test is proving something real.
  const expiredAccessToken = mintExpiredAccessToken(admin._id);
  assert.throws(
    () => jwt.verify(expiredAccessToken, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] }),
    /jwt expired/,
    'test setup: the minted token must actually be expired under normal verification',
  );

  // Real HTTP request, not the agent (whose jar still holds the fresh,
  // non-expired admin_at from login) -- explicitly swaps in the expired
  // admin_at while keeping the real, still-valid admin_rt, reproducing
  // exactly what a real browser sends once its 15-minute admin_at window has
  // closed but its 7-day admin_rt has not.
  const logoutRes = await request(app)
    .post('/api/v1/admin/auth/logout')
    .set(csrf)
    .set('Cookie', `admin_at=${expiredAccessToken}; admin_rt=${realRefreshToken}; csrf_token=${csrf['x-csrf-token']}`)
    .send();

  assert.equal(logoutRes.status, 200, 'logout must succeed (not 401) despite the expired admin_at');
  assert.equal(logoutRes.body.message, 'Logged out successfully');

  const families = await RefreshToken.distinct('family', { adminId: admin._id });
  assert.equal(families.length, 1);
  const familyDoc = await TokenFamily.findOne({ family: families[0] });
  assert.equal(familyDoc.revoked, true, 'the session identified via admin_rt must end up revoked');

  // The real proof this isn't just a 200 with nothing behind it: the exact
  // refresh token this logout was supposed to revoke must now be rejected.
  const refreshAfterLogout = await request(app)
    .post('/api/v1/admin/auth/refresh')
    .set(csrf)
    .set('Cookie', `admin_rt=${realRefreshToken}; csrf_token=${csrf['x-csrf-token']}`)
    .send();
  assert.equal(refreshAfterLogout.status, 401, 'a refresh token revoked by logout must never work again');
});

test('logout still identifies and revokes the admin via an expired-but-signature-valid admin_at even when admin_rt is absent from the request entirely', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { csrf, verifyRes } = await loginAgent('admin@example.com', totpSecret);

  const realRefreshToken = cookieValue(verifyRes, 'admin_rt');
  const expiredAccessToken = mintExpiredAccessToken(admin._id);

  // No admin_rt at all on this request -- only the expired admin_at and the
  // CSRF cookie. identifyAdminForLogout must still resolve req.adminId from
  // the expired-but-genuinely-signed token, and logout() must fall back to
  // revoking every family for that admin.
  const logoutRes = await request(app)
    .post('/api/v1/admin/auth/logout')
    .set(csrf)
    .set('Cookie', `admin_at=${expiredAccessToken}; csrf_token=${csrf['x-csrf-token']}`)
    .send();

  assert.equal(logoutRes.status, 200, 'logout must succeed even with only an expired admin_at and no admin_rt');

  const stillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(stillActive, null, 'the admin identified purely via the expired admin_at must have every family revoked');

  const refreshAfterLogout = await request(app)
    .post('/api/v1/admin/auth/refresh')
    .set(csrf)
    .set('Cookie', `admin_rt=${realRefreshToken}; csrf_token=${csrf['x-csrf-token']}`)
    .send();
  assert.equal(refreshAfterLogout.status, 401, 'the pre-existing refresh token must be revoked too, despite never being sent on the logout request itself');
});

test('logout is a safe no-op (still 200, cookies still cleared) when there is nothing at all to identify — no admin_at, no admin_rt', async () => {
  const { csrf } = await agentWithCsrf(app);

  const logoutRes = await request(app)
    .post('/api/v1/admin/auth/logout')
    .set(csrf)
    .set('Cookie', `csrf_token=${csrf['x-csrf-token']}`)
    .send();

  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.message, 'Logged out successfully');
  const setCookie = (logoutRes.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('admin_at=;')), 'admin_at must still be cleared');
  assert.ok(setCookie.some((c) => c.startsWith('admin_rt=;')), 'admin_rt must still be cleared');
});
