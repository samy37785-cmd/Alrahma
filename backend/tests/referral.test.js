import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import { trackReferral } from '../controllers/referralController.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Coverage for the T3 query-optimization change to trackReferral():
// replaced an unindexed User.find({}) full-collection scan with a targeted
// lookup on the new indexed `referralCode` field, plus a self-healing
// fallback for users that predate the field. These tests exercise the real
// controller function directly (not a re-implementation) and assert the
// exact same external behavior the old scan-based version had.

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
  await trackReferral({ body: { code: referrer.referralCode, refereeId: referee._id.toString() } }, res);

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
  await trackReferral({ body: { code: legacyCode, refereeId: referee._id.toString() } }, res);

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
  await trackReferral({ body: { code: user.referralCode, refereeId: user._id.toString() } }, res);

  assert.equal(res.statusCode, 400);
});

test('trackReferral: returns 404 for a code that matches no user (new or legacy)', async () => {
  await User.create({ name: 'Someone', email: 'someone@example.com', password: PASSWORD });
  const referee = await User.create({ name: 'Referee2', email: 'referee2@example.com', password: PASSWORD });

  const res = makeRes();
  const next = (err) => { throw err; }; // asyncHandler forwards the throw here — surface it to the test
  await assert.rejects(
    () => trackReferral({ body: { code: 'nomatch1', refereeId: referee._id.toString() } }, res, next),
    /Referral code not found/,
  );
  assert.equal(res.statusCode, 404);
});

test('trackReferral: calling twice for the same referrer+referee returns the existing referral, never creates a duplicate', async () => {
  const referrer = await User.create({ name: 'Repeat Referrer', email: 'repeat-referrer@example.com', password: PASSWORD });
  const referee = await User.create({ name: 'Repeat Referee', email: 'repeat-referee@example.com', password: PASSWORD });

  const first = makeRes();
  await trackReferral({ body: { code: referrer.referralCode, refereeId: referee._id.toString() } }, first);
  const second = makeRes();
  await trackReferral({ body: { code: referrer.referralCode, refereeId: referee._id.toString() } }, second);

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200); // existing() branch returns 200, not 201
  assert.equal(String(first.body._id), String(second.body._id));

  const count = await Referral.countDocuments({ referrer: referrer._id, referee: referee._id });
  assert.equal(count, 1);
});
