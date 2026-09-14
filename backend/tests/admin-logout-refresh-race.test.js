import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import request from 'supertest';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import TokenFamily from '../models/TokenFamily.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Review follow-up: controllers/adminAuthController.js's logout() always
// revokes EVERY refresh-token family belonging to the identified admin (not
// just the one admin_rt happens to belong to), whether that admin was
// identified via admin_rt's own stored RefreshToken document or via
// req.adminId. It used to revoke RefreshToken documents by adminId alone,
// without ever touching TokenFamily -- leaving a real race: a refresh
// request that atomically claimed an old, still-valid token an instant
// before logout runs was still free to mint a brand-new successor token
// AFTER logout's sweep had already returned 200, because
// issueRefreshToken()'s post-insert self-check only catches itself by
// reading TokenFamily.revoked, and the old code never set it. This file
// proves the fix: logout now flags TokenFamily for every family this admin
// has (upserting rows for families that predate the TokenFamily collection)
// BEFORE sweeping RefreshToken.
//
// Second review follow-up (logout must survive an expired admin_at):
// admin_rt's Path was widened from /auth/refresh only to the whole /auth
// subtree (utils/adminAuthTokens.js's refreshCookieOptions), so a real
// browser's own agent below DOES now send it to /logout alongside admin_at
// -- see admin-logout-expired-access-token.test.js for the companion test
// proving logout still works via admin_rt alone once admin_at has expired.

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
  const token = speakeasy.totp({ secret: totpSecret, encoding: 'base32' });
  const verifyRes = await agent.post('/api/v1/admin/auth/mfa/verify').set(csrf).send({ token });
  assert.equal(verifyRes.status, 200, 'test setup: MFA verify must succeed');
  return { agent, csrf };
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

test('TokenFamily: a real login creates a row for its own family, and a real browser-realistic logout revokes it AND upserts+revokes a legacy family that predates the TokenFamily collection', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { agent, csrf } = await loginAgent('admin@example.com', totpSecret);

  const loginFamilies = await RefreshToken.distinct('family', { adminId: admin._id });
  assert.equal(loginFamilies.length, 1, 'one login must produce exactly one family');
  const [realFamily] = loginFamilies;

  const realFamilyDocBeforeLogout = await TokenFamily.findOne({ family: realFamily });
  assert.ok(realFamilyDocBeforeLogout, 'login must create a TokenFamily row for its own family');
  assert.equal(realFamilyDocBeforeLogout.revoked, false);

  // Simulates a family minted before the TokenFamily collection existed:
  // a RefreshToken document with a family value, but deliberately NO
  // TokenFamily row for it at all.
  const legacyFamily = 'legacy-family-' + Date.now();
  await RefreshToken.create({
    tokenHash: 'legacy-hash-' + Date.now(),
    adminId: admin._id,
    family: legacyFamily,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  assert.equal(
    await TokenFamily.findOne({ family: legacyFamily }),
    null,
    'sanity: no TokenFamily row exists yet for the legacy family',
  );

  // Real, browser-realistic logout: this agent's own cookie jar now sends
  // BOTH admin_at and admin_rt (Path=/v1/admin/auth) here, exactly like a
  // real browser would -- but logout() must still revoke every family for
  // this admin regardless (see this file's own header comment), including
  // the legacy family admin_rt itself has no relationship to at all.
  const logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  assert.equal(logoutRes.status, 200);

  const realFamilyDocAfter = await TokenFamily.findOne({ family: realFamily });
  assert.equal(realFamilyDocAfter.revoked, true, 'the real, logged-in family must end up revoked');

  const legacyFamilyDocAfter = await TokenFamily.findOne({ family: legacyFamily });
  assert.ok(legacyFamilyDocAfter, 'a TokenFamily row must now exist for the legacy family (created via upsert)');
  assert.equal(legacyFamilyDocAfter.revoked, true, 'the legacy family must also end up revoked');

  const anyStillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(anyStillActive, null, 'every RefreshToken document for this admin must be revoked after logout');
});

test('deterministic: a refresh request that atomically claims a token an instant before a browser-realistic logout can never leave its newly-minted successor token usable afterward', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { agent, csrf } = await loginAgent('admin@example.com', totpSecret);

  // Gates the two real model operations issueRefreshToken()/refreshTokens()
  // perform, so this test controls their real interleaving deterministically
  // instead of guessing with a fixed sleep:
  //   1. Let the refresh request's atomic claim (findOneAndUpdate) run for
  //      real against the real DB, then signal once it resolves.
  //   2. Pause the refresh request's RefreshToken.create() (the successor
  //      token insert inside issueRefreshToken()) until this test explicitly
  //      releases it -- AFTER logout has already fully completed.
  const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate.bind(RefreshToken);
  const originalCreate           = RefreshToken.create.bind(RefreshToken);

  let signalClaimed;
  const claimed = new Promise((resolve) => { signalClaimed = resolve; });
  let releaseInsert;
  const insertGate = new Promise((resolve) => { releaseInsert = resolve; });

  RefreshToken.findOneAndUpdate = async (...args) => {
    const result = await originalFindOneAndUpdate(...args);
    signalClaimed();
    return result;
  };
  RefreshToken.create = async (...args) => {
    await insertGate;
    return originalCreate(...args);
  };

  let refreshPromise;
  let logoutRes;
  try {
    refreshPromise = agent.post('/api/v1/admin/auth/refresh').set(csrf).send();
    // supertest/superagent requests are LAZY: nothing is actually dispatched
    // over the wire until something calls .then()/await on them (their
    // thenable implementation triggers .end() the first time .then() runs).
    // Just holding the reference above never starts the request, which
    // would make `claimed` below hang forever. This forces dispatch now,
    // on this tick, while still letting the real result be awaited later.
    refreshPromise.then(() => {}, () => {});
    await claimed; // deterministic handoff -- no arbitrary sleep involved

    logoutRes = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  } finally {
    releaseInsert();
    RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
    RefreshToken.create           = originalCreate;
  }

  assert.equal(logoutRes.status, 200);

  const refreshRes = await refreshPromise;
  // Per the claim-winner policy (see adminAuthController.js's
  // refreshTokens() comment): the request that atomically won the claim is
  // never retroactively failed just because a race happened, so this may
  // still legitimately be 200. What must be true regardless is that the
  // token it hands back can never actually be used again.
  if (refreshRes.status === 200) {
    const newToken = cookieValue(refreshRes, 'admin_rt');
    assert.ok(newToken, 'a 200 response must carry a new refresh token cookie');

    const secondRefresh = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set(csrf)
      .set('Cookie', `admin_rt=${newToken}; csrf_token=${csrf['x-csrf-token']}`)
      .send();
    assert.equal(
      secondRefresh.status,
      401,
      'a refresh token minted while a browser-realistic logout was racing it must never remain usable',
    );
  }

  const stillActive = await RefreshToken.exists({ adminId: admin._id, revoked: false });
  assert.equal(stillActive, null, 'no non-revoked refresh token may survive logout, including one minted mid-race');
});
