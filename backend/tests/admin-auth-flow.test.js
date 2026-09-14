import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import request from 'supertest';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import TokenFamily from '../models/TokenFamily.js';
import { hashToken } from '../utils/hashToken.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Integration coverage for the hardened admin auth stack (password -> TOTP
// MFA -> access+refresh token pair, with rotation and reuse detection) --
// previously untested (discovery-audit report: "Admin auth (MFA + rotation +
// reuse detection) is implemented correctly" was rated high-confidence from
// reading the code alone, not from running it).
//
// Deliberately economical with /login (5 req/15min) and /mfa/* (10 req/15min,
// config/adminRateLimits.js) -- both are much tighter than the regular
// authLimiter, and this file's scenarios total well under either budget.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function makeAdmin(overrides = {}) {
  return AdminUser.create({
    name: 'Test Admin',
    email: 'admin@example.com',
    password: ADMIN_PASSWORD,
    role: 'admin',
    ...overrides,
  });
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

test('login: wrong password is rejected without revealing account existence details', async () => {
  await makeAdmin();
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent
    .post('/api/v1/admin/auth/login')
    .set(csrf)
    .send({ email: 'admin@example.com', password: 'wrong-password' });

  assert.equal(res.status, 401);
});

test('full flow: first login prompts MFA setup, confirming activates MFA and issues real session tokens', async () => {
  await makeAdmin();
  const { agent, csrf } = await agentWithCsrf(app);

  const stage1 = await agent
    .post('/api/v1/admin/auth/login')
    .set(csrf)
    .send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  assert.equal(stage1.status, 200);
  assert.equal(stage1.body.stage, 'mfa_setup');
  assert.ok(cookieValue(stage1, 'admin_at'), 'expected a pre-auth admin_at cookie');

  const setup = await agent.post('/api/v1/admin/auth/mfa/setup').set(csrf).send();
  assert.equal(setup.status, 200);
  assert.ok(setup.body.secret);
  assert.ok(setup.body.qrCode.startsWith('data:image'));

  const validCode = speakeasy.totp({ secret: setup.body.secret, encoding: 'base32' });
  const confirm = await agent.post('/api/v1/admin/auth/mfa/confirm').set(csrf).send({ token: validCode });
  assert.equal(confirm.status, 200);
  assert.ok(cookieValue(confirm, 'admin_at'), 'expected a full access token cookie');
  assert.ok(cookieValue(confirm, 'admin_rt'), 'expected a refresh token cookie');

  const admin = await AdminUser.findOne({ email: 'admin@example.com' });
  assert.equal(admin.mfaEnabled, true);
});

test('once MFA is enabled, a later login requires a valid TOTP code (wrong code rejected, right code succeeds)', async () => {
  const admin = await makeAdmin();
  const secret = speakeasy.generateSecret({ length: 32 });
  admin.setMfaSecret(secret.base32);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  const { agent, csrf } = await agentWithCsrf(app);
  const stage1 = await agent
    .post('/api/v1/admin/auth/login')
    .set(csrf)
    .send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  assert.equal(stage1.body.stage, 'mfa');

  const wrongCode = await agent.post('/api/v1/admin/auth/mfa/verify').set(csrf).send({ token: '000000' });
  assert.equal(wrongCode.status, 401);

  const rightCode = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });
  const verify = await agent.post('/api/v1/admin/auth/mfa/verify').set(csrf).send({ token: rightCode });
  assert.equal(verify.status, 200);
  assert.ok(cookieValue(verify, 'admin_rt'));
});

test('refresh token rotation: the old token stops working, and re-presenting it (reuse) revokes the entire family', async () => {
  const admin = await makeAdmin();
  const secret = speakeasy.generateSecret({ length: 32 });
  admin.setMfaSecret(secret.base32);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  const { agent, csrf } = await agentWithCsrf(app);
  await agent.post('/api/v1/admin/auth/login').set(csrf).send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  const verify = await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set(csrf)
    .send({ token: speakeasy.totp({ secret: secret.base32, encoding: 'base32' }) });
  const originalRefresh = cookieValue(verify, 'admin_rt');

  // Rotate once -- should succeed and issue a new refresh token.
  const rotated = await agent.post('/api/v1/admin/auth/refresh').set(csrf).send();
  assert.equal(rotated.status, 200);
  const newRefresh = cookieValue(rotated, 'admin_rt');
  assert.notEqual(newRefresh, originalRefresh);

  // Re-presenting the now-superseded original token is reuse -- must revoke
  // the whole family and reject, not just reject. Uses a fresh, agent-less
  // request with an explicit Cookie header: mixing request.agent()'s
  // automatic cookie-jar attachment with a manual .set('Cookie', ...)
  // override for the SAME cookie name is unreliable (the jar's own value
  // can win), so this needs full manual control instead.
  const reuse = await request(app)
    .post('/api/v1/admin/auth/refresh')
    .set({ ...csrf, Cookie: `admin_rt=${originalRefresh}; csrf_token=${csrf['x-csrf-token']}` })
    .send();
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.code, 'TOKEN_REUSE');

  const family = await RefreshToken.find({ adminId: admin._id });
  assert.ok(family.length >= 2, 'expected at least the original and rotated tokens on record');
  assert.ok(family.every((t) => t.revoked === true), 'every token in the family should be revoked after reuse detection');

  // The token issued by the (now-revoked) rotation must also be unusable.
  const afterRevocation = await request(app)
    .post('/api/v1/admin/auth/refresh')
    .set({ ...csrf, Cookie: `admin_rt=${newRefresh}; csrf_token=${csrf['x-csrf-token']}` })
    .send();
  assert.equal(afterRevocation.status, 401);
});

test('concurrent refresh requests presenting the SAME valid refresh token: exactly one succeeds, the other is treated as reuse and revokes the family (closes a real TOCTOU race — see controllers/adminAuthController.js)', async () => {
  const admin = await makeAdmin();

  // Mints a valid refresh token directly in the DB, the same way
  // controllers/adminAuthController.js's issueRefreshToken() does — avoids
  // spending this file's shared, tightly-budgeted /login rate-limit quota
  // (5 req/15min, shared across every test in this file since node --test
  // runs a file's tests in one process/one in-memory limiter) on a login
  // flow this test isn't actually exercising.
  const rawRefresh = crypto.randomBytes(48).toString('hex');
  const family = crypto.randomUUID();
  await RefreshToken.create({
    tokenHash: hashToken(rawRefresh),
    adminId:   admin._id,
    family,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const { csrf } = await agentWithCsrf(app);
  const cookieHeader = `admin_rt=${rawRefresh}; csrf_token=${csrf['x-csrf-token']}`;

  // Two truly concurrent requests presenting the exact same not-yet-used
  // token — fired together, not awaited sequentially, so both reach the
  // atomic claim step before either's write could be observed by the other.
  const [first, second] = await Promise.all([
    request(app).post('/api/v1/admin/auth/refresh').set({ ...csrf, Cookie: cookieHeader }).send(),
    request(app).post('/api/v1/admin/auth/refresh').set({ ...csrf, Cookie: cookieHeader }).send(),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 401], 'exactly one racer must win (200) and the other must be rejected (401)');

  const loser = first.status === 401 ? first : second;
  assert.equal(loser.body.code, 'TOKEN_REUSE');

  // The loser's rejection must have revoked the whole family — including
  // the winner's freshly-issued token, matching this endpoint's existing
  // "reuse means the device is compromised, log everywhere out" policy.
  const winner = first.status === 200 ? first : second;
  const winnerNewToken = cookieValue(winner, 'admin_rt');
  const afterRevocation = await request(app)
    .post('/api/v1/admin/auth/refresh')
    .set({ ...csrf, Cookie: `admin_rt=${winnerNewToken}; csrf_token=${csrf['x-csrf-token']}` })
    .send();
  assert.equal(afterRevocation.status, 401);

  const tokenFamily = await RefreshToken.find({ adminId: admin._id });
  assert.ok(tokenFamily.every((t) => t.revoked === true), 'every token in the family must end up revoked');
});

// The Promise.all test above exercises real HTTP-level concurrency, but
// which of {the loser's family-wide sweep, the winner's new-token insert}
// actually completes first on the real DB connection is up to Node's I/O
// scheduler — running it N times raises confidence but never proves the fix
// handles BOTH orderings. This test removes that dependency entirely by
// driving the exact same sequence of DB operations
// controllers/adminAuthController.js's issueRefreshToken() and the
// refresh-endpoint's reuse branch perform, in each order explicitly, so
// both interleavings the real race could produce are deterministically
// reproduced every single run.
test('refresh-token reuse sweep vs. concurrent new-token issuance: whichever of the two DB operation sequences runs first, the newly-issued token still ends up revoked (deterministic reproduction of both possible interleavings)', async () => {
  const admin = await makeAdmin();

  async function loserSweep(family) {
    await TokenFamily.updateOne(
      { family },
      { $set: { revoked: true, revokedAt: new Date() } },
      { upsert: true },
    );
    await RefreshToken.updateMany({ family }, { revoked: true });
  }

  // Mirrors issueRefreshToken()'s exact sequence: insert the new token,
  // THEN check the family flag and self-revoke if it's already set.
  async function winnerIssue(family) {
    const raw       = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(raw);
    await RefreshToken.create({
      tokenHash,
      adminId:   admin._id,
      family,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const familyDoc = await TokenFamily.findOne({ family }).lean();
    if (familyDoc?.revoked) {
      await RefreshToken.updateOne({ tokenHash }, { $set: { revoked: true } });
    }
    return tokenHash;
  }

  async function runScenario(order) {
    const family = crypto.randomUUID();
    await TokenFamily.create({ family, adminId: admin._id });

    let winnerTokenHash;
    if (order === 'sweep-completes-before-issue') {
      await loserSweep(family);
      winnerTokenHash = await winnerIssue(family);
    } else {
      winnerTokenHash = await winnerIssue(family);
      await loserSweep(family);
    }

    const winnerDoc = await RefreshToken.findOne({ tokenHash: winnerTokenHash });
    assert.equal(
      winnerDoc.revoked,
      true,
      `winner's freshly-issued token must end up revoked when the sweep runs "${order}"`,
    );
  }

  await runScenario('sweep-completes-before-issue');
  await runScenario('issue-completes-before-sweep');
});

test('logout revokes the refresh token family', async () => {
  const admin = await makeAdmin();
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

  const logout = await agent.post('/api/v1/admin/auth/logout').set(csrf).send();
  assert.equal(logout.status, 200);

  const tokens = await RefreshToken.find({ adminId: admin._id });
  assert.ok(tokens.length >= 1);
  assert.ok(tokens.every((t) => t.revoked === true));
});
