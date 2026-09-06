import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Referral from '../models/Referral.js';
import { trackReferral } from '../controllers/referralController.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

async function adminUserAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

// Coverage for the T3 query-optimization change to trackReferral():
// replaced an unindexed User.find({}) full-collection scan with a targeted
// lookup on the new indexed `referralCode` field, plus a self-healing
// fallback for users that predate the field. These tests exercise the real
// controller function directly (not a re-implementation) and assert the
// exact same external behavior the old scan-based version had.
//
// Updated for T21 (security audit): trackReferral used to take `refereeId`
// from the request body with no authentication at all — any anonymous
// caller could attribute an arbitrary user's account to any referral code.
// It's now derived from `req.user` (the authenticated caller), so these
// fake requests set `user` instead of `body.refereeId`.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

// Minimal req/res doubles — trackReferral is a plain Express handler wrapped
// in asyncHandler; no need to spin up supertest/app for a unit-level check
// of its query behavior and response body.
function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

const PASSWORD = 'Str0ngP@ssw0rd!';

test('trackReferral: a user created after this change is found via the indexed referralCode fast path', async () => {
  const referrer = await User.create({ name: 'Amina', email: 'amina-ref@example.com', password: PASSWORD });
  const referee = await User.create({ name: 'Bilal', email: 'bilal-ref@example.com', password: PASSWORD });

  assert.ok(referrer.referralCode, 'a newly created user must have a referralCode set by the pre-save hook');
  assert.equal(referrer.referralCode, referrer._id.toString().slice(-8));

  const res = makeRes();
  await trackReferral({ body: { code: referrer.referralCode }, user: referee }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(String(res.body.referrer), String(referrer._id));

  const referral = await Referral.findOne({ referrer: referrer._id, referee: referee._id });
  assert.ok(referral);
});

test('trackReferral: self-heals a legacy user with no referralCode (simulates a user created before this migration)', async () => {
  // Bypass Mongoose entirely (raw driver insert) so no pre-save hook runs —
  // this is exactly what a pre-migration user document looks like: no
  // referralCode field at all.
  const legacyId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: legacyId, name: 'Legacy Teacher', email: 'legacy@example.com',
    password: 'irrelevant-hash', role: 'student', tokenVersion: 0,
  });

  const legacyCode = legacyId.toString().slice(-8);
  const referee = await User.create({ name: 'Referee', email: 'referee-legacy@example.com', password: PASSWORD });

  const res = makeRes();
  await trackReferral({ body: { code: legacyCode }, user: referee }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(String(res.body.referrer), String(legacyId));

  // Self-healed: the field is now persisted, so the next lookup for this
  // user hits the fast indexed path instead of the fallback scan.
  const healed = await User.findById(legacyId).lean();
  assert.equal(healed.referralCode, legacyCode);
});

test('trackReferral: rejects self-referral with 400', async () => {
  const user = await User.create({ name: 'Solo', email: 'solo@example.com', password: PASSWORD });

  const res = makeRes();
  await trackReferral({ body: { code: user.referralCode }, user }, res);

  assert.equal(res.statusCode, 400);
});

test('trackReferral: returns 404 for a code that matches no user (new or legacy)', async () => {
  await User.create({ name: 'Someone', email: 'someone@example.com', password: PASSWORD });
  const referee = await User.create({ name: 'Referee2', email: 'referee2@example.com', password: PASSWORD });

  const res = makeRes();
  const next = (err) => { throw err; }; // asyncHandler forwards the throw here — surface it to the test
  await assert.rejects(
    () => trackReferral({ body: { code: 'nomatch1' }, user: referee }, res, next),
    /Referral code not found/,
  );
  assert.equal(res.statusCode, 404);
});

test('trackReferral: calling twice for the same referrer+referee returns the existing referral, never creates a duplicate', async () => {
  const referrer = await User.create({ name: 'Repeat Referrer', email: 'repeat-referrer@example.com', password: PASSWORD });
  const referee = await User.create({ name: 'Repeat Referee', email: 'repeat-referee@example.com', password: PASSWORD });

  const first = makeRes();
  await trackReferral({ body: { code: referrer.referralCode }, user: referee }, first);
  const second = makeRes();
  await trackReferral({ body: { code: referrer.referralCode }, user: referee }, second);

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200); // existing() branch returns 200, not 201
  assert.equal(String(first.body._id), String(second.body._id));

  const count = await Referral.countDocuments({ referrer: referrer._id, referee: referee._id });
  assert.equal(count, 1);
});

// ---------------------------------------------------------------------------
// T21 (security audit): real HTTP route-level authorization checks. The
// tests above call the controller directly (bypassing middleware) to test
// its query/self-healing behavior in isolation; these go through the actual
// Express routes to prove the auth gate itself is really wired in.
// ---------------------------------------------------------------------------

test('POST /api/referrals/track: unauthenticated request is rejected with 401 (previously: no auth at all)', async () => {
  const referrer = await User.create({ name: 'Referrer', email: 'http-referrer@example.com', password: PASSWORD });
  // A valid CSRF token/cookie pair is supplied (but no auth cookie), so this
  // isolates the auth check itself rather than being rejected earlier by the
  // globally-mounted CSRF middleware (which would otherwise return 403 for
  // any mutating request regardless of auth state).
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/referrals/track').set(csrf).send({ code: referrer.referralCode });
  assert.equal(res.status, 401);
});

test('POST /api/referrals/track: an authenticated caller can only ever record a referral for themselves', async () => {
  const referrer = await User.create({ name: 'Referrer2', email: 'http-referrer2@example.com', password: PASSWORD });
  const victim = await User.create({ name: 'Victim', email: 'http-victim@example.com', password: PASSWORD });

  const { agent, csrf } = await agentWithCsrf(app);
  const callerEmail = 'http-caller@example.com';
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Caller', email: callerEmail, password: PASSWORD });
  const caller = await User.findOne({ email: callerEmail });

  // Even if a client tried to send someone else's id as refereeId, the
  // server derives the real referee from the session, not the body.
  const res = await agent.post('/api/referrals/track').set(csrf).send({ code: referrer.referralCode, refereeId: victim._id.toString() });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.referee), String(caller._id));
  assert.notEqual(String(res.body.referee), String(victim._id));
});

// convertReferral moved to /api/v1/admin/referrals/:id/convert (MFA + RBAC +
// audit-logged) as part of the B1 legacy-route migration — see
// routes/v1/admin/referralsRoutes.js. The legacy /api/referrals/:id/convert
// route no longer exists (see the "no longer exists" test at the bottom of
// this file).

test('PATCH /api/v1/admin/referrals/:id/convert: unauthenticated request is rejected with 401', async () => {
  const referral = await Referral.create({
    referrer: new mongoose.Types.ObjectId(), referee: new mongoose.Types.ObjectId(), code: 'ABCD1234',
  });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set(csrf).send({});
  assert.equal(res.status, 401);
});

test('PATCH /api/v1/admin/referrals/:id/convert: an AdminUser without referrals:write is rejected with 403 (previously: any logged-in regular User could convert)', async () => {
  const referral = await Referral.create({
    referrer: new mongoose.Types.ObjectId(), referee: new mongoose.Types.ObjectId(), code: 'ABCD5678',
  });
  // 'editor' has courses:read/write and enrollments:read only — no
  // referrals:write (see ROLE_PERMISSIONS in models/AdminUser.js).
  const { agent, csrf, cookieHeader } = await adminUserAgent('editor');

  const res = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 403);

  const unchanged = await Referral.findById(referral._id);
  assert.equal(unchanged.status, 'pending');
});

test('PATCH /api/v1/admin/referrals/:id/convert: an admin can convert a referral', async () => {
  const referral = await Referral.create({
    referrer: new mongoose.Types.ObjectId(), referee: new mongoose.Types.ObjectId(), code: 'ABCD9999',
  });
  const { agent, csrf, cookieHeader } = await adminUserAgent();

  const res = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'converted');
});

test('legacy PATCH /api/referrals/:id/convert no longer exists (404)', async () => {
  const referral = await Referral.create({
    referrer: new mongoose.Types.ObjectId(), referee: new mongoose.Types.ObjectId(), code: 'LEGACY001',
  });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch(`/api/referrals/${referral._id}/convert`).set(csrf).send({});
  assert.equal(res.status, 404);
});
