import Coupon from '../models/Coupon.js';

// Money math on EUR amounts — keep two decimals, avoid float dust.
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Resolves (and fully validates) a coupon for a checkout attempt.
 *
 * Never throws for business outcomes — returns a discriminated result the
 * payment controllers translate into their usual `res.status(...); throw`
 * pattern:
 *
 *   { ok: true,  coupon: null, discount: 0, finalAmount }  — no code sent
 *   { ok: true,  coupon, discount, finalAmount }           — coupon applies
 *   { ok: false, status, message }                         — rejected
 *
 * Rules (mirrors validateCoupon + Coupon.calculateDiscount, plus the
 * checkout-only ones that need the plan/user context):
 *   - a coupon requires a logged-in user (usage is tracked per user)
 *   - code must exist, be active, be inside its date window, under maxUses
 *   - one redemption per user, ever
 *   - applicablePlans (when non-empty) must include the plan
 *   - plan price must meet minOrderAmount
 *   - the discounted total must stay above zero — payment gateways cannot
 *     charge €0, so a coupon that fully covers the plan is rejected rather
 *     than silently producing an uncollectable order
 *
 * @param {object} params
 * @param {string} [params.code]    - raw coupon code from the client (optional)
 * @param {*}      [params.userId]  - authenticated user id (required to use a code)
 * @param {object} params.plan      - plan object from config/plans.js
 */
export async function resolveCouponForCheckout({ code, userId, plan }) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    return { ok: true, coupon: null, discount: 0, finalAmount: plan.amount };
  }
  if (!userId) {
    return { ok: false, status: 401, message: 'Please log in to use a coupon code.' };
  }

  // Exclude the potentially large usedBy array from the main fetch; check
  // per-user usage with a separate indexed query (same pattern as
  // couponController.validateCoupon).
  const [coupon, alreadyUsed] = await Promise.all([
    Coupon.findOne({ code: normalized }).select('-usedBy'),
    Coupon.findOne({ code: normalized, 'usedBy.user': userId }, '_id').lean(),
  ]);

  if (!coupon)           return { ok: false, status: 400, message: 'Invalid coupon code' };
  if (!coupon.isValid()) return { ok: false, status: 400, message: 'This coupon is expired or no longer valid' };
  if (alreadyUsed)       return { ok: false, status: 400, message: 'You have already used this coupon' };
  if (coupon.applicablePlans?.length && !coupon.applicablePlans.includes(plan.name)) {
    return { ok: false, status: 400, message: `This coupon is not valid for the ${plan.name} plan` };
  }
  if (plan.amount < (coupon.minOrderAmount || 0)) {
    return { ok: false, status: 400, message: `This coupon requires a minimum order of €${coupon.minOrderAmount}` };
  }

  const discount = round2(coupon.calculateDiscount(plan.amount));
  if (discount <= 0) {
    return { ok: false, status: 400, message: 'This coupon does not provide a discount for this plan' };
  }

  const finalAmount = round2(plan.amount - discount);
  if (finalAmount <= 0) {
    return { ok: false, status: 400, message: 'This coupon cannot cover the entire plan price — please contact support to redeem it' };
  }

  return { ok: true, coupon, discount, finalAmount };
}

/**
 * Records a redemption atomically once the payment actually succeeds.
 *
 * The single guarded update enforces both invariants under concurrency:
 * per-user once-only ('usedBy.user': $ne) and the global maxUses cap
 * ($expr comparison) — two racing redemptions can never both pass, because
 * MongoDB applies the filter and the update as one atomic document operation.
 *
 * Deliberately does NOT re-check active/date-window validity: those were
 * enforced at checkout time by resolveCouponForCheckout, and the customer
 * has already paid the discounted price by the time this runs — usage must
 * be recorded regardless of a coupon being deactivated in the interim.
 *
 * @returns {Promise<boolean>} true when this call recorded the redemption.
 */
export async function redeemCoupon(code, userId, session = null) {
  if (!code || !userId) return false;
  const res = await Coupon.updateOne(
    {
      code: String(code).trim().toUpperCase(),
      'usedBy.user': { $ne: userId },
      $or: [
        { maxUses: null },
        { $expr: { $lt: ['$usedCount', '$maxUses'] } },
      ],
    },
    {
      $inc:  { usedCount: 1 },
      $push: { usedBy: { user: userId } },
    },
    session ? { session } : {},
  );
  return res.modifiedCount === 1;
}
