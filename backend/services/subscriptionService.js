import User from '../models/User.js';

/**
 * Activates a 30-day subscription after a confirmed one-off payment
 * (PayPal / manual transfer).
 *
 * @param {*}      userId
 * @param {string} planName
 * @param {object} [session] - Mongoose ClientSession for transactions
 */
export async function enrollUser(userId, planName, session = null) {
  if (!userId) return;
  const activeSince = new Date();
  const validUntil  = new Date(activeSince);
  validUntil.setDate(validUntil.getDate() + 30);

  const opts = session ? { session } : {};
  await User.findByIdAndUpdate(
    userId,
    {
      'subscription.plan':        planName,
      'subscription.status':      'active',
      'subscription.activeSince': activeSince,
      'subscription.validUntil':  validUntil,
    },
    opts,
  );
}

/**
 * Activates or extends a recurring (Stripe) subscription.
 * Called on the initial checkout and on every successful renewal invoice.
 *
 * @param {*}      userId
 * @param {object} params
 * @param {string} params.plan
 * @param {Date}   params.validUntil          - current_period_end from Stripe
 * @param {string} params.stripeCustomerId
 * @param {string} params.stripeSubscriptionId
 * @param {object} [params.session]           - Mongoose ClientSession for transactions
 */
export async function activateRecurringSubscription(userId, {
  plan,
  validUntil,
  stripeCustomerId,
  stripeSubscriptionId,
  session = null,
}) {
  if (!userId) return;
  const opts = session ? { session } : {};
  await User.findByIdAndUpdate(
    userId,
    {
      'subscription.plan':                 plan,
      'subscription.status':               'active',
      'subscription.activeSince':          new Date(),
      'subscription.validUntil':           validUntil,
      'subscription.provider':             'stripe',
      'subscription.stripeCustomerId':     stripeCustomerId,
      'subscription.stripeSubscriptionId': stripeSubscriptionId,
      'subscription.cancelAtPeriodEnd':    false,
    },
    opts,
  );
}

/**
 * Marks a subscription inactive (Stripe cancellation / expiry webhook).
 *
 * @param {string} stripeSubscriptionId
 * @param {object} [session] - Mongoose ClientSession for transactions
 */
export async function deactivateSubscription(stripeSubscriptionId, session = null) {
  if (!stripeSubscriptionId) return;
  const opts = session ? { session } : {};
  await User.findOneAndUpdate(
    { 'subscription.stripeSubscriptionId': stripeSubscriptionId },
    { 'subscription.status': 'inactive' },
    opts,
  );
}

/**
 * Admin-initiated subscription change, keyed by userId (not a Stripe
 * subscription id, unlike deactivateSubscription — an admin can be changing
 * a manual/PayPal subscription with no Stripe linkage at all).
 *
 * Only the specific fields the requested action changes are $set — every
 * other subscription field (provider, stripeCustomerId, stripeSubscriptionId,
 * cancelAtPeriodEnd, renewalReminderSentFor) is left untouched. This must
 * never be a whole-subscription-object replace: that would silently wipe a
 * user's live Stripe linkage the next time an admin merely renews/deactivates
 * their plan from the dashboard.
 *
 * @param {*}      userId
 * @param {object} params
 * @param {string} params.action              'activate' | 'renew' | 'deactivate' (anything
 *                                             other than 'deactivate' is treated as an
 *                                             activate/renew — preserves the exact
 *                                             fallback behavior this replaces)
 * @param {string} [params.plan]
 * @param {object} [params.currentSubscription] - the user's subscription sub-document as
 *                                                currently persisted, so 'renew' can
 *                                                preserve the existing activeSince
 * @param {object} [params.session]           - Mongoose ClientSession for transactions
 */
export async function adminSetSubscription(userId, { action, plan, currentSubscription = {}, session = null } = {}) {
  const opts = session ? { session } : {};

  if (action === 'deactivate') {
    await User.findByIdAndUpdate(userId, { 'subscription.status': 'inactive' }, opts);
    return;
  }

  const activeSince = action === 'renew' ? (currentSubscription.activeSince || new Date()) : new Date();
  const validUntil  = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  await User.findByIdAndUpdate(
    userId,
    {
      'subscription.plan':        plan || currentSubscription.plan || 'Starter',
      'subscription.status':      'active',
      'subscription.activeSince': activeSince,
      'subscription.validUntil':  validUntil,
    },
    opts,
  );
}
