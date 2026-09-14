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

// Review follow-up: middleware/adminAuth.js's identifyAdminForLogout() used
// to trust an expired-but-signature-valid admin_at UNCONDITIONALLY, for
// however long its signature stayed valid -- effectively forever, since
// this codebase never rotates ADMIN_JWT_ACCESS_SECRET. That meant a JWT an
// admin's browser discarded long ago (recovered from a disk image, an old
// log line, browser history) could still be replayed against /logout to
// revoke every one of that admin's CURRENT sessions, indefinitely into the
// future -- using nothing but a credential that should have been worthless
// the moment it expired. This file proves the fix (a short, bounded grace
// window past admin_at's own `exp`, LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS)
// against the real HTTP endpoints: a genuinely stale admin_at (expired
// hours ago, well outside the grace window) must not be able to touch a
// session that admin only created afterward.
before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function makeAdminWithMfa() {
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
  return { admin, totpSecret: secret.base32 };
}

async function loginAgent(totpSecret) {
  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/v1/admin/auth/login').set(csrf).send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  const verifyRes = await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set(csrf)
    .send({ token: speakeasy.totp({ secret: totpSecret, encoding: 'base32' }) });
  assert.equal(verifyRes.status, 200, 'test setup: MFA verify must succeed');
  return { agent, csrf };
}

function cookieValue(res, name) {
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  return match ? match.split(';')[0].split('=')[1] : null;
}

// A genuinely stale token: signed with the real secret (so its signature is
// entirely valid -- this is not a forgery), but `exp` hours in the past --
// far outside LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS (2 minutes,
// middleware/adminAuth.js). This is what a token an admin's browser
// discarded long ago genuinely looks like: real, once-legitimate, and long
// expired -- exactly the credential that must no longer carry any weight.
function mintStaleAccessToken(adminId) {
  return jwt.sign(
    { id: String(adminId), role: 'admin', mfaVerified: true },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '-3h' },
  );
}

test('a stale admin_at (expired hours ago, well past the grace window) cannot identify the admin for logout at all, and never touches a session created after it', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();

  // Session A: logs in once, just to obtain a genuinely real, signature-
  // valid admin_at for this admin -- this is the token that will go stale.
  const { csrf: csrfA } = await loginAgent(totpSecret);
  const staleAccessToken = mintStaleAccessToken(admin._id);

  // Session B: a SEPARATE, later login -- the current, legitimate session
  // whose tokens must never be touched by session A's now-stale admin_at.
  const { agent: agentB, csrf: csrfB } = await loginAgent(totpSecret);
  const familiesBeforeAttack = await RefreshToken.distinct('family', { adminId: admin._id });
  assert.ok(familiesBeforeAttack.length >= 1, 'session B must have created at least one refresh-token family');

  // The attack: present ONLY the stale admin_at to /logout (no admin_rt at
  // all -- exactly what an attacker holding nothing but an old, discarded
  // JWT would have). If identifyAdminForLogout() still trusted this
  // unconditionally, this would revoke every family above, including
  // session B's -- an admin whose browser leaked or logged this token
  // months ago should never be able to remote-kill every session they have
  // right now.
  const attackRes = await request(app)
    .post('/api/v1/admin/auth/logout')
    .set(csrfA)
    .set('Cookie', `admin_at=${staleAccessToken}; csrf_token=${csrfA['x-csrf-token']}`)
    .send();
  assert.equal(attackRes.status, 200, 'logout is still a safe no-op — it must not error, just fail to identify anyone');

  const stillActiveAfterAttack = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.ok(
    stillActiveAfterAttack,
    'session B (created after the stale token was minted) must still have at least one live, non-revoked refresh token',
  );

  const familiesAfterAttack = await TokenFamily.find({ family: { $in: familiesBeforeAttack } });
  assert.ok(
    familiesAfterAttack.every((f) => f.revoked === false),
    'none of session B\'s families may have been revoked by the stale admin_at alone',
  );

  // The real, positive proof: session B's own refresh token must still
  // genuinely work, end to end, completely unaffected by the attack above.
  const refreshB = await agentB.post('/api/v1/admin/auth/refresh').set(csrfB).send();
  assert.equal(refreshB.status, 200, 'session B must still be able to refresh after the stale-token attack');
  assert.ok(cookieValue(refreshB, 'admin_rt'), 'session B\'s refresh must still mint a real new refresh token');
});

test('sanity check on the test\'s own premise: a RECENTLY expired admin_at (well within the grace window) still works for logout — this is the legitimate case the grace window exists for, not a false negative', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { csrf } = await loginAgent(totpSecret);

  const recentlyExpired = jwt.sign(
    { id: String(admin._id), role: 'admin', mfaVerified: true },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '-5s' },
  );

  const logoutRes = await request(app)
    .post('/api/v1/admin/auth/logout')
    .set(csrf)
    .set('Cookie', `admin_at=${recentlyExpired}; csrf_token=${csrf['x-csrf-token']}`)
    .send();
  assert.equal(logoutRes.status, 200);

  const stillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(stillActive, null, 'a recently-expired admin_at (within the grace window) must still be able to revoke its own admin\'s sessions');
});
