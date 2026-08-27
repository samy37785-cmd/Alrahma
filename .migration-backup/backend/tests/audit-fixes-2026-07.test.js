import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Course from '../models/Course.js';
import Coupon from '../models/Coupon.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Referral from '../models/Referral.js';
import ManualPayment from '../models/ManualPayment.js';
import Invoice from '../models/Invoice.js';
import Notification from '../models/Notification.js';
import { resolveCouponForCheckout, redeemCoupon } from '../services/couponService.js';
import { PLANS } from '../config/plans.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Regression coverage for the 2026-07 review-board fixes:
//   F1 — community moderation notification types missing from the enum
//        (approving a post/comment threw a ValidationError → 500 for the
//        admin, after the status change had already committed)
//   F3 — verifyMfaLogin never checked the per-account lock, so a locked
//        account could keep brute-forcing TOTP with a valid pre-auth token
//   F4 — coupons were validated but never applied to (or redeemed by) any
//        payment flow; usedCount/usedBy were never written anywhere
//   F5 — referral conversion set a status but never delivered the documented
//        1-month credit to either party
//   F7 — public course search had no published:true filter, leaking drafts

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader, admin };
}

async function studentAgent(overrides = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student-${Date.now()}${Math.random()}@example.com`;
  const user = await User.create({ name: 'Student', email, password: PASSWORD, ...overrides });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf, user };
}

// ───────────────────────────── F1 — community moderation ─────────────────────

test('F1: approving a community post succeeds and creates a post_approved notification', async () => {
  const { user } = await studentAgent();
  const post = await Post.create({ author: user._id, body: 'A pending post' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent
    .patch(`/api/v1/admin/community/posts/${post._id}/moderate`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.post.status, 'approved');

  const notif = await Notification.findOne({ recipient: user._id, type: 'post_approved' }).lean();
  assert.ok(notif, 'a post_approved notification must be created for the author');
});

test('F1: approving a community comment succeeds and creates a comment_approved notification', async () => {
  const { user } = await studentAgent();
  const post = await Post.create({ author: user._id, body: 'Post', status: 'approved' });
  const comment = await Comment.create({ post: post._id, author: user._id, body: 'A pending comment' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent
    .patch(`/api/v1/admin/community/comments/${comment._id}/moderate`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'approved' });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  const notif = await Notification.findOne({ recipient: user._id, type: 'comment_approved' }).lean();
  assert.ok(notif, 'a comment_approved notification must be created for the author');
});

// ───────────────────────────── F3 — MFA lockout ──────────────────────────────

test('F3: a locked admin account gets 423 at the MFA-verify stage, even with a valid pre-auth token', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: 'Locked Admin', email: `locked-${Date.now()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role: 'admin',
    mfaEnabled: true,
    failedLoginAttempts: 5,
    lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
  });

  // A pre-auth (stage: 'mfa') token exactly like login() issues.
  const preAuth = jwt.sign(
    { id: String(admin._id), role: admin.role, stage: 'mfa' },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '10m' },
  );

  const res = await agent
    .post('/api/v1/admin/auth/mfa/verify')
    .set({ ...csrf, Cookie: `admin_at=${preAuth}; csrf_token=${csrf['x-csrf-token']}` })
    .send({ token: '123456' });

  assert.equal(res.status, 423, `expected 423 ACCOUNT_LOCKED, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.code, 'ACCOUNT_LOCKED');
});

// ───────────────────────────── F4 — coupons in checkout ─────────────────────

test('F4: resolveCouponForCheckout computes the discounted total for a valid percent coupon', async () => {
  const user = await User.create({ name: 'U', email: `u-${Date.now()}@example.com`, password: PASSWORD });
  await Coupon.create({ code: 'SAVE20', discountType: 'percent', discountValue: 20 });

  const result = await resolveCouponForCheckout({ code: 'save20', userId: user._id, plan: PLANS.Starter });
  assert.equal(result.ok, true);
  assert.equal(result.discount, 11.2);       // 20% of €56
  assert.equal(result.finalAmount, 44.8);
});

test('F4: resolveCouponForCheckout rejects a coupon restricted to a different plan', async () => {
  const user = await User.create({ name: 'U', email: `u2-${Date.now()}@example.com`, password: PASSWORD });
  await Coupon.create({ code: 'PREMONLY', discountType: 'fixed', discountValue: 10, applicablePlans: ['Premium'] });

  const result = await resolveCouponForCheckout({ code: 'PREMONLY', userId: user._id, plan: PLANS.Starter });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.message, /not valid for the Starter plan/);
});

test('F4: resolveCouponForCheckout requires a logged-in user to use a code (guests pass through only without one)', async () => {
  await Coupon.create({ code: 'NOGUEST', discountType: 'fixed', discountValue: 5 });

  const withCode = await resolveCouponForCheckout({ code: 'NOGUEST', userId: null, plan: PLANS.Starter });
  assert.equal(withCode.ok, false);
  assert.equal(withCode.status, 401);

  const withoutCode = await resolveCouponForCheckout({ code: '', userId: null, plan: PLANS.Starter });
  assert.equal(withoutCode.ok, true);
  assert.equal(withoutCode.finalAmount, PLANS.Starter.amount);
});

test('F4: redeemCoupon records usage once per user and enforces maxUses atomically', async () => {
  const userA = await User.create({ name: 'A', email: `a-${Date.now()}@example.com`, password: PASSWORD });
  const userB = await User.create({ name: 'B', email: `b-${Date.now()}@example.com`, password: PASSWORD });
  await Coupon.create({ code: 'ONETWO', discountType: 'fixed', discountValue: 5, maxUses: 2 });

  assert.equal(await redeemCoupon('ONETWO', userA._id), true,  'first redemption records');
  assert.equal(await redeemCoupon('ONETWO', userA._id), false, 'same user can never redeem twice');
  assert.equal(await redeemCoupon('ONETWO', userB._id), true,  'second user fits under maxUses');

  const userC = await User.create({ name: 'C', email: `c-${Date.now()}@example.com`, password: PASSWORD });
  assert.equal(await redeemCoupon('ONETWO', userC._id), false, 'maxUses cap blocks a third redemption');

  const coupon = await Coupon.findOne({ code: 'ONETWO' }).lean();
  assert.equal(coupon.usedCount, 2);
  assert.equal(coupon.usedBy.length, 2);
});

test('F4 end-to-end: manual payment with a coupon records the discounted amount; admin approval redeems it and invoices the paid amount', async () => {
  const { agent, csrf, user } = await studentAgent();
  await Coupon.create({ code: 'HALFOFF', discountType: 'percent', discountValue: 50 });

  // Student submits a manual payment with the coupon applied.
  const submit = await agent.post('/api/payments/manual').set(csrf).send({
    plan: 'Starter', method: 'wu',
    customer: { name: 'Student', email: user.email },
    reference: 'MTCN-1', coupon: 'HALFOFF',
  });
  assert.equal(submit.status, 201, JSON.stringify(submit.body));

  const record = await ManualPayment.findById(submit.body.id).lean();
  assert.equal(record.amount, 28);            // €56 − 50%
  assert.equal(record.couponCode, 'HALFOFF');
  assert.equal(record.discountAmount, 28);

  // Coupon must NOT be consumed before the money is verified.
  let coupon = await Coupon.findOne({ code: 'HALFOFF' }).lean();
  assert.equal(coupon.usedCount, 0);

  // Admin approves → coupon redeemed + invoice shows the amount actually paid.
  const { agent: aAgent, csrf: aCsrf, cookieHeader } = await adminAgent();
  const approve = await aAgent
    .patch(`/api/v1/admin/payments/manual/${record._id}`)
    .set({ ...aCsrf, Cookie: cookieHeader })
    .send({ status: 'approved' });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));

  coupon = await Coupon.findOne({ code: 'HALFOFF' }).lean();
  assert.equal(coupon.usedCount, 1, 'approval must record the redemption');
  assert.equal(String(coupon.usedBy[0].user), String(user._id));

  const invoice = await Invoice.findOne({ customerEmail: user.email }).lean();
  assert.ok(invoice, 'approval must create an invoice');
  assert.equal(invoice.amount, 28, 'invoice must reflect the discounted amount actually paid');

  // The user's subscription was activated by the approval.
  const fresh = await User.findById(user._id).lean();
  assert.equal(fresh.subscription.status, 'active');
});

test('F4: an invalid coupon blocks the manual-payment submission with a clean 400', async () => {
  const { agent, csrf, user } = await studentAgent();

  const submit = await agent.post('/api/payments/manual').set(csrf).send({
    plan: 'Starter', method: 'wu',
    customer: { name: 'Student', email: user.email },
    reference: 'MTCN-2', coupon: 'NOSUCHCODE',
  });
  assert.equal(submit.status, 400);
  assert.match(submit.body.message, /Invalid coupon code/);
  assert.equal(await ManualPayment.countDocuments(), 0, 'no payment record on a rejected coupon');
});

test('F4: plan-aware POST /api/coupons/validate returns the discounted total the checkout will charge', async () => {
  const { agent, csrf } = await studentAgent();
  await Coupon.create({ code: 'TEN', discountType: 'fixed', discountValue: 10 });

  const res = await agent.post('/api/coupons/validate').set(csrf).send({ code: 'TEN', plan: 'Starter' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.discount, 10);
  assert.equal(res.body.finalAmount, 46);
  assert.equal(res.body.originalAmount, 56);
});

// ───────────────────────────── F5 — referral rewards ────────────────────────

test('F5: converting a referral credits 30 days to BOTH referrer and referee and marks it rewarded', async () => {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // Referrer: active subscription with 10 days left → extends from validUntil.
  const referrer = await User.create({
    name: 'Referrer', email: `ref-${now}@example.com`, password: PASSWORD,
    subscription: { plan: 'Starter', status: 'active', activeSince: new Date(now - 20 * DAY), validUntil: new Date(now + 10 * DAY) },
  });
  // Referee: no subscription yet → credit starts from now.
  const referee = await User.create({ name: 'Referee', email: `fee-${now}@example.com`, password: PASSWORD });
  const referral = await Referral.create({ referrer: referrer._id, referee: referee._id, code: 'ABCD1234' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent
    .patch(`/api/v1/admin/referrals/${referral._id}/convert`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'rewarded');
  assert.ok(res.body.convertedAt && res.body.rewardedAt);

  const freshReferrer = await User.findById(referrer._id).lean();
  const freshReferee  = await User.findById(referee._id).lean();

  // Referrer: 10 remaining days + 30 credit ≈ 40 days out.
  const referrerDays = (new Date(freshReferrer.subscription.validUntil) - now) / DAY;
  assert.ok(referrerDays > 39 && referrerDays < 41, `referrer should be ~40 days out, got ${referrerDays}`);
  assert.equal(freshReferrer.subscription.plan, 'Starter', 'existing plan must never be overwritten');

  // Referee: ~30 days out, activated.
  const refereeDays = (new Date(freshReferee.subscription.validUntil) - now) / DAY;
  assert.ok(refereeDays > 29 && refereeDays < 31, `referee should be ~30 days out, got ${refereeDays}`);
  assert.equal(freshReferee.subscription.status, 'active');
});

test('F5: converting the same referral twice never double-credits', async () => {
  const referrer = await User.create({ name: 'R', email: `r2-${Date.now()}@example.com`, password: PASSWORD });
  const referee  = await User.create({ name: 'F', email: `f2-${Date.now()}@example.com`, password: PASSWORD });
  const referral = await Referral.create({ referrer: referrer._id, referee: referee._id, code: 'DUP12345' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const first = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(first.status, 200);
  const validUntilAfterFirst = (await User.findById(referrer._id).lean()).subscription.validUntil;

  const second = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(second.status, 200);
  assert.equal(second.body.status, 'rewarded');

  const validUntilAfterSecond = (await User.findById(referrer._id).lean()).subscription.validUntil;
  assert.equal(String(validUntilAfterFirst), String(validUntilAfterSecond), 'a second convert must not add more days');
});

test('F5: a referral with no registered referee cannot be converted', async () => {
  const referrer = await User.create({ name: 'R', email: `r3-${Date.now()}@example.com`, password: PASSWORD });
  const referral = await Referral.create({ referrer: referrer._id, code: 'NOFEE123' });

  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.patch(`/api/v1/admin/referrals/${referral._id}/convert`).set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 400);

  const fresh = await Referral.findById(referral._id).lean();
  assert.equal(fresh.status, 'pending', 'the referral must stay pending');
});

// ───────────────────────────── F7 — search leak ─────────────────────────────

test('F7: unpublished courses never appear in global search or course search', async () => {
  await Course.create({ title: 'Public Tajweed', description: 'published course', published: true });
  await Course.create({ title: 'Secret Tajweed Draft', description: 'unpublished draft', published: false });

  const { agent } = await agentWithCsrf(app);

  const global = await agent.get('/api/search').query({ q: 'Tajweed' });
  assert.equal(global.status, 200);
  const globalTitles = global.body.results.courses.map((c) => c.title);
  assert.ok(globalTitles.includes('Public Tajweed'));
  assert.ok(!globalTitles.includes('Secret Tajweed Draft'), 'drafts must not leak via /api/search');

  const courses = await agent.get('/api/search/courses').query({ q: 'Tajweed' });
  assert.equal(courses.status, 200);
  const courseTitles = courses.body.courses.map((c) => c.title);
  assert.ok(courseTitles.includes('Public Tajweed'));
  assert.ok(!courseTitles.includes('Secret Tajweed Draft'), 'drafts must not leak via /api/search/courses');

  // A level-only filter (no q) must not leak drafts either.
  const levelOnly = await agent.get('/api/search/courses').query({ level: 'All levels' });
  assert.equal(levelOnly.status, 200);
  assert.ok(!levelOnly.body.courses.map((c) => c.title).includes('Secret Tajweed Draft'));
});
