import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import cookiejarPkg from 'cookiejar';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

const { CookieAccessInfo } = cookiejarPkg;

// Review follow-up: admin_rt's Path was widened from /api/v1/admin/auth/
// refresh to /api/v1/admin/auth (see utils/adminAuthTokens.js's
// refreshCookieOptions) so it also reaches /logout. That change does
// nothing on its own to a real browser that authenticated BEFORE this
// deploy — it is still holding a cookie stored under the OLD, narrower
// Path, and only an explicit Set-Cookie with that EXACT Path (which
// clearLegacyRefreshCookie() issues everywhere admin_rt is set or cleared)
// removes it. Left unaddressed, that stale cookie would coexist forever
// alongside the new one: both would be sent together on every request to
// /auth/refresh (the one place their Paths overlap), and which same-named
// cookie a server-side parser exposes when two arrive together is
// unspecified — exactly the kind of shadowing bug a credential cookie must
// never be left exposed to. This file proves the migration against real
// HTTP-cookie-jar semantics (supertest's agent, backed by the `cookiejar`
// package, which — like a real browser — respects the Path attribute when
// deciding which cookie to resend and which Set-Cookie replaces which
// stored cookie), not a hand-rolled mock: a real login happens first (so
// the refresh token is genuinely valid and DB-backed), then the agent's own
// jar is rewritten to hold that SAME real token under the OLD Path only —
// simulating exactly what a pre-migration browser's cookie jar looks like —
// before exercising two consecutive refreshes and a logout against it.

const OLD_PATH = '/api/v1/admin/auth/refresh';
const NEW_PATH = '/api/v1/admin/auth';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

function findRtCookie(jar, path) {
  return jar.getCookies(CookieAccessInfo.All).find((c) => c.name === 'admin_rt' && c.path === path);
}

test('a pre-migration admin_rt cookie (legacy Path only) survives two consecutive refreshes and a logout, and is fully migrated/cleared along the way', async () => {
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
  await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set(csrf)
    .send({ token: speakeasy.totp({ secret: secret.base32, encoding: 'base32' }) });

  const realRtBeforeMigration = findRtCookie(agent.jar, NEW_PATH);
  assert.ok(realRtBeforeMigration, 'sanity: a fresh login issues admin_rt under the current, widened Path');
  const rawValue = realRtBeforeMigration.value;
  // The real cookie the login flow just set carries an explicit Domain
  // (whatever host supertest's ephemeral server used) — the `cookiejar`
  // package's same-cookie collision detection keys on Domain matching
  // exactly, so the two manually-constructed Set-Cookie strings below must
  // reuse this SAME domain, or the package treats them as unrelated to the
  // real cookie and never replaces/removes it, leaving the jar in an
  // inconsistent (not realistically reachable) two-cookies-at-once state
  // no actual browser could ever produce for a single Set-Cookie sequence.
  const domain = realRtBeforeMigration.domain;

  // Simulate a browser that authenticated BEFORE this Path migration
  // shipped: same real, DB-backed refresh token value, but stored under the
  // OLD, narrower Path only -- exactly what a real pre-migration cookie jar
  // would hold at this point, nothing more.
  agent.jar.setCookie(`admin_rt=; Path=${NEW_PATH}; Domain=${domain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  agent.jar.setCookie(`admin_rt=${rawValue}; Path=${OLD_PATH}; Domain=${domain}; HttpOnly`);
  assert.ok(findRtCookie(agent.jar, OLD_PATH), 'sanity: the jar now only holds the legacy-Path cookie');
  assert.ok(!findRtCookie(agent.jar, NEW_PATH), 'sanity: the widened-Path cookie is gone from the jar');

  // First refresh: the legacy-Path cookie's Path always covered /refresh
  // (old and new Path definitions agree on that one route), so this must
  // still succeed -- continuity for real pre-migration sessions is
  // non-negotiable.
  const firstRefresh = await agent.post('/api/v1/admin/auth/refresh').set(csrf).send();
  assert.equal(firstRefresh.status, 200, 'a legacy-Path admin_rt must still work on /refresh');

  // The response must have migrated the cookie: the stale legacy-Path copy
  // is gone, a fresh one lives only under the new, widened Path.
  assert.ok(!findRtCookie(agent.jar, OLD_PATH), 'the legacy-Path admin_rt must be cleared by the migration response');
  const migratedRt = findRtCookie(agent.jar, NEW_PATH);
  assert.ok(migratedRt, 'a fresh admin_rt must now exist under the new, widened Path');
  assert.notEqual(migratedRt.value, rawValue, 'rotation must still mint a genuinely new token, not just move the cookie');

  // Second, fully-migrated refresh: ordinary post-migration operation must
  // keep working exactly as it does for an admin who never had a legacy
  // cookie at all.
  const secondRefresh = await agent.post('/api/v1/admin/auth/refresh').set(csrf).send();
  assert.equal(secondRefresh.status, 200, 'a second, already-migrated refresh must also succeed');
  assert.ok(findRtCookie(agent.jar, NEW_PATH), 'the new-Path admin_rt must still be present after the second refresh');
  assert.ok(!findRtCookie(agent.jar, OLD_PATH), 'the legacy-Path admin_rt must still be absent after the second refresh');

  const logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  assert.equal(logoutRes.status, 200, 'logout must succeed for a fully-migrated session');

  assert.ok(!findRtCookie(agent.jar, OLD_PATH), 'no legacy-Path admin_rt may survive logout either');
  assert.ok(!findRtCookie(agent.jar, NEW_PATH), 'the new-Path admin_rt must also be cleared by logout');

  const stillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(stillActive, null, 'every refresh token for this admin must end up revoked after logout');
});
