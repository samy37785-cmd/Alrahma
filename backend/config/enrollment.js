import User from '../models/User.js';

// Activates a 30-day subscription for the user after a confirmed one-off payment
// (PayPal / manual transfer). Kept for backward compatibility.
export async function enrollUser(userId, planName) {
  if (!userId) return;
  const activeSince = new Date();
  const validUntil  = new Date(activeSince);
  validUntil.setDate(validUntil.getDate() + 30);

  await User.findByIdAndUpdate(userId, {
    'subscription.plan':        planName,
    'subscription.status':      'active',
    'subscription.activeSince': activeSince,
    'subscription.validUntil':  validUntil,
  });
}

// Activates or extends a recurring (Stripe) subscription. Called by the Stripe
// webhook on the initial checkout and on every successful renewal invoice.
// `validUntil` should be the current period end reported by Stripe.
export async function activateRecurringSubscription(userId, {
  plan,
  validUntil,
  stripeCustomerId,
  stripeSubscriptionId,
}) {
  if (!userId) return;
  await User.findByIdAndUpdate(userId, {
    'subscription.plan':                 plan,
    'subscription.status':               'active',
    'subscription.activeSince':          new Date(),
    'subscription.validUntil':           validUntil,
    'subscription.provider':             'stripe',
    'subscription.stripeCustomerId':     stripeCustomerId,
    'subscription.stripeSubscriptionId': stripeSubscriptionId,
    'subscription.cancelAtPeriodEnd':    false,
  });
}

// Marks a subscription inactive (Stripe cancellation / expiry webhook).
export async function deactivateSubscription(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return;
  await User.findOneAndUpdate(
    { 'subscription.stripeSubscriptionId': stripeSubscriptionId },
    { 'subscription.status': 'inactive' }
  );
}
