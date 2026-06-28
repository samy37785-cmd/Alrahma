import Stripe from 'stripe';
import { siteOrigin } from '../config/site.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';
import {
  activateRecurringSubscription,
  deactivateSubscription,
} from '../config/enrollment.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Module-level singleton — avoids creating a new Stripe client (and its HTTP
// connection pool) on every request. Safe for serverless: each warm instance
// reuses the same object; a cold start creates it once.
let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Records a paid invoice for a given plan + customer (initial or renewal).
async function recordInvoice({ userId, email, name, planName }) {
  const plan = getPlan(planName);
  const period = new Date().toISOString().slice(0, 7); // "2025-06"
  await Invoice.create({
    user:           userId || undefined,
    customerEmail:  email,
    customerName:   name,
    plan:           planName,
    amount:         plan?.amount ?? 0,
    originalAmount: plan?.originalAmount ?? plan?.amount ?? 0,
    discountPct:    plan?.discountPct ?? 0,
    currency:       plan?.currency ?? 'EUR',
    billingPeriod:  period,
    status:         'paid',
  });
}

// @desc   Create a Stripe Checkout Session for a MONTHLY recurring subscription
//         (cards + Apple Pay + Google Pay). Stripe auto-charges every month.
// @route  POST /api/payments/stripe
// @access Public (softProtect attaches userId if logged in)
export const createStripeSession = asyncHandler(async (req, res) => {
    const { plan: planName, customer = {} } = req.body;
    const plan = getPlan(planName);
    if (!plan) {
      res.status(400);
      throw new Error(`Unknown plan: ${planName}`);
    }

    const stripe = getStripe();
    const origin = siteOrigin();
    const userId = String(req.user?._id ?? '');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: { name: `${plan.name} Plan — Al-Rahma Academy` },
          unit_amount: Math.round(plan.amount * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      customer_email: customer.email || undefined,
      // Metadata is copied onto the subscription so renewal webhooks can find the user.
      subscription_data: { metadata: { userId, plan: plan.name } },
      metadata: { userId, plan: plan.name },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/payment/cancel`,
    });

    await Payment.create({
      plan:           plan.name,
      amount:         plan.amount,
      currency:       plan.currency,
      gateway:        'stripe',
      method:         'card',
      customer,
      status:         'pending',
      gatewayOrderId: session.id,
      userId:         req.user?._id ?? null,
    });

    res.json({ type: 'redirect', url: session.url, sessionId: session.id });
});

// @desc   Stripe webhook — handles initial payment, monthly renewals, cancellation.
// @route  POST /api/payments/stripe/webhook
// @access Public (verified via Stripe signature; raw body set in app.js)
export const stripeWebhook = asyncHandler(async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(401).json({ message: 'Stripe webhook not configured' });

    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        webhookSecret
      );
    } catch {
      return res.status(400).json({ message: 'Invalid Stripe signature' });
    }

    switch (event.type) {
      // ---- Initial subscription purchase ----
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const planName = session.metadata?.plan || subscription.metadata?.plan;
        const userId   = session.metadata?.userId || subscription.metadata?.userId || null;
        const validUntil = new Date(subscription.current_period_end * 1000);

        const updated = await Payment.findOneAndUpdate(
          { gatewayOrderId: session.id },
          {
            status:               'paid',
            gatewayTxnId:         session.payment_intent || subscription.id,
            stripeCustomerId:     session.customer,
            stripeSubscriptionId: subscription.id,
          },
          { new: true }
        );

        if (userId) {
          await activateRecurringSubscription(userId, {
            plan: planName,
            validUntil,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: subscription.id,
          }).catch((err) =>
            console.error('[stripe] activateRecurringSubscription failed:', { userId, planName, err: err.message }));
        }
        await recordInvoice({
          userId,
          email: session.customer_email || updated?.customer?.email,
          name:  updated?.customer?.name,
          planName,
        }).catch((err) =>
          console.error('[stripe] recordInvoice failed:', { userId, planName, err: err.message }));
        break;
      }

      // ---- Monthly renewal (Stripe auto-charged the saved card) ----
      case 'invoice.paid': {
        const invoice = event.data.object;
        // Skip the very first invoice — already handled by checkout.session.completed.
        if (invoice.billing_reason !== 'subscription_cycle') break;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const planName = subscription.metadata?.plan;
        const userId   = subscription.metadata?.userId || null;
        const validUntil = new Date(subscription.current_period_end * 1000);

        if (userId) {
          await activateRecurringSubscription(userId, {
            plan: planName,
            validUntil,
            stripeCustomerId: invoice.customer,
            stripeSubscriptionId: subscription.id,
          }).catch((err) =>
            console.error('[stripe] activateRecurringSubscription failed (renewal):', { userId, planName, err: err.message }));
        }
        await recordInvoice({
          userId,
          email: invoice.customer_email,
          name:  invoice.customer_name,
          planName,
        }).catch((err) =>
          console.error('[stripe] recordInvoice failed (renewal):', { userId, planName, err: err.message }));
        break;
      }

      // ---- Subscription cancelled or expired ----
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await deactivateSubscription(subscription.id).catch((err) =>
          console.error('[stripe] deactivateSubscription failed:', { subscriptionId: subscription.id, err: err.message }));
        break;
      }

      default:
        break;
    }

    res.sendStatus(200);
});
