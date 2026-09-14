import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import TokenFamily from '../models/TokenFamily.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Review follow-up: one TokenFamily document is created per admin login,
// with no lifecycle policy at all — left running for real, this collection
// grows forever. This file proves:
//   1. A TTL index actually exists on lastActivityAt with a sane
//      expireAfterSeconds (real MongoDB TTL sweeps run on a background
//      timer that isn't practical to actually wait out in a fast test —
//      asserting the index configuration itself, the same way a real
//      admin/ops review would check it, is the meaningful thing to test).
//   2. Rotation (a successful refresh) genuinely pushes lastActivityAt
//      forward — an actively-used family must not silently age out from
//      under a still-live admin session.

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

test('TokenFamily has a TTL index on lastActivityAt, set comfortably longer than a RefreshToken document can possibly live, so the collection cannot grow unboundedly', async () => {
  await TokenFamily.init(); // ensure indexes are actually built before inspecting them
  const indexes = await TokenFamily.collection.indexes();

  const ttlIndex = indexes.find((idx) => Object.prototype.hasOwnProperty.call(idx, 'expireAfterSeconds'));
  assert.ok(ttlIndex, 'expected a TTL index on TokenFamily');
  assert.deepEqual(Object.keys(ttlIndex.key), ['lastActivityAt']);

  // RefreshToken's own maximum document lifetime: 7-day expiresAt + its own
  // 24h TTL grace period (models/RefreshToken.js).
  const refreshTokenMaxLifetimeSeconds = 7 * 24 * 60 * 60 + 24 * 60 * 60;
  assert.ok(
    ttlIndex.expireAfterSeconds > refreshTokenMaxLifetimeSeconds,
    'TokenFamily must outlive the longest any RefreshToken document belonging to it could possibly live, ' +
      `got expireAfterSeconds=${ttlIndex.expireAfterSeconds}, refresh-token max lifetime=${refreshTokenMaxLifetimeSeconds}`,
  );
});

test('a successful refresh (rotation) pushes the family\'s lastActivityAt forward — an actively-used family must not silently age out', async () => {
  const { admin, totpSecret } = await makeAdminWithMfa();
  const { agent, csrf } = await loginAgent('admin@example.com', totpSecret);

  const [family] = await RefreshToken.distinct('family', { adminId: admin._id });
  const beforeDoc = await TokenFamily.findOne({ family }).lean();
  assert.ok(beforeDoc, 'login must create a TokenFamily row');

  // Force a real, observable time gap so a later "did it move forward"
  // comparison can't be a false positive from two Date.now() calls landing
  // in the same millisecond.
  await new Promise((r) => setTimeout(r, 20));

  const refreshRes = await agent.post('/api/v1/admin/auth/refresh').set(csrf).send();
  assert.equal(refreshRes.status, 200);

  const afterDoc = await TokenFamily.findOne({ family }).lean();
  assert.ok(
    afterDoc.lastActivityAt.getTime() > beforeDoc.lastActivityAt.getTime(),
    'lastActivityAt must have moved forward after a successful rotation',
  );
});

test('an artificially old, dormant family (lastActivityAt far in the past, never rotated again) is the kind of row the TTL index is meant to remove — sanity check on the field itself, not a live MongoDB TTL sweep', async () => {
  const { admin } = await makeAdminWithMfa();
  const family = 'dormant-family-' + Date.now();
  const veryOld = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  await TokenFamily.create({ family, adminId: admin._id, lastActivityAt: veryOld });

  const doc = await TokenFamily.findOne({ family }).lean();
  assert.ok(
    Date.now() - doc.lastActivityAt.getTime() > 10 * 24 * 60 * 60 * 1000,
    'this document is old enough that the TTL index (10 days) would remove it on MongoDB\'s next background sweep',
  );
});
