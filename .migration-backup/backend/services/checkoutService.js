import { enrollUser, activateRecurringSubscription } from './subscriptionService.js';
import { redeemCoupon } from './couponService.js';
import { createInvoice } from './invoiceService.js';
import { createNotification } from './notificationService.js';
import logger from '../config/logger.js';

/**
 * The one post-payment fulfillment sequence, shared by every payment source
 * (Stripe checkout + renewals, PayPal capture/webhook, manual-transfer
 * approval). Before Phase 3 each controller carried its own copy of this
 * block with drifting argument shapes.
 *
 * MUST be called inside the caller's transaction: the caller owns the
 * source-specific, idempotent "claim" of its payment record (findOneAndUpdate
 * on status: 'pending' etc.) and passes the same `session` here, so that the
 * claim plus everything below commits or aborts as one unit.
 *
 * Sequence (canonical order — each step tolerates a null/guest userId):
 *  1. Record the coupon redemption, now that money actually moved. A false
 *     return (per-user/maxUses race) is LOGGED, NOT THROWN — the buyer
 *     already paid the discounted price; failing the whole fulfillment over
 *     usage bookkeeping would be worse.
 *  2. Activate the subscription — 30-day one-time enrollment, or recurring
 *     with Stripe ids/period end.
 *  3. Record the invoice for what was actually charged (callers pass amounts
 *     already net of any coupon).
 *  4. Notify the student (no-ops for guest checkouts with no recipient).
 *
 * @param {object} p
 * @param {string} p.source        'stripe' | 'stripe-renewal' | 'paypal' | 'manual' — log context
 * @param {object} p.session       REQUIRED Mongoose ClientSession (caller's transaction)
 * @param {*}      p.userId        may be null for guest checkouts
 * @param {string} p.planName
 * @param {string} [p.couponCode]  redemption recorded only when both code and userId exist
 * @param {object} p.invoice       forwarded to createInvoice: { email, name, paymentId,
 *                                 createdAt, amountPaid, gatewayInvoiceId } — pass what
 *                                 the source knows, omissions are fine
 * @param {object} [p.subscription]  { mode: 'one-time' } (default) or
 *                                 { mode: 'recurring', validUntil, stripeCustomerId, stripeSubscriptionId }
 * @param {object} p.notification  { type, title, body, link } — source-specific wording
 */
export async function fulfillPaidCheckout({
  source,
  session,
  userId,
  planName,
  couponCode,
  invoice = {},
  subscription = { mode: 'one-time' },
  notification,
}) {
  if (!session) throw new Error('fulfillPaidCheckout requires the caller’s transaction session');

  if (couponCode && userId) {
    const redeemed = await redeemCoupon(couponCode, userId, session);
    if (!redeemed) {
      logger.warn(`${source} fulfillment: coupon redemption not recorded (already used or cap reached)`, {
        coupon: couponCode, userId: String(userId),
      });
    }
  }

  if (subscription.mode === 'recurring') {
    await activateRecurringSubscription(userId, {
      plan:                 planName,
      validUntil:           subscription.validUntil,
      stripeCustomerId:     subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      session,
    });
  } else {
    await enrollUser(userId, planName, session);
  }

  await createInvoice({ userId, planName, ...invoice, session });

  await createNotification({
    recipient: userId,
    link:      '/billing',
    ...notification,
  }, { session });
}
