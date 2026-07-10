import mongoose from 'mongoose';
import Stripe from 'stripe';
import { siteOrigin } from '../config/site.js';
import Payment from '../models/Payment.js';
import { getPlan } from '../config/plans.js';
import {
  activateRecurringSubscription,
  deactivateSubscription,
} from '../services/subscriptionService.js';
import { createInvoice } from '../services/invoiceService.js';
import { createNotification } from './notificationController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import logger from '../config/logger.js';

// Module-level singleton — avoids creating a new Stripe client (and its HTTP
// connection pool) on every request. Safe for serverless: each warm instance
// reuses the same object; a cold start creates it once.
let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
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
        const stripeSession = event.data.object;
        if (stripeSession.mode !== 'subscription') break;

        const subscription = await stripe.subscriptions.retrieve(stripeSession.subscription);
        const planName   = stripeSession.metadata?.plan || subscription.metadata?.plan;
        const userId     = stripeSession.metadata?.userId || subscription.metadata?.userId || null;
        const validUntil = new Date(subscription.current_period_end * 1000);

        // All three mutations run atomically: mark payment paid, activate
        // subscription, and record the invoice.
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(async () => {
            // Filter by status: 'pending' so that a duplicate webhook delivery
            // for an already-paid session returns null and exits immediately —
            // preventing a second invoice and second subscription activation.
            const updated = await Payment.findOneAndUpdate(
              { gatewayOrderId: stripeSession.id, status: { $ne: 'paid' } },
              {
                status:               'paid',
                gatewayTxnId:         stripeSession.payment_intent || subscription.id,
                stripeCustomerId:     stripeSession.customer,
                stripeSubscriptionId: subscription.id,
              },
              { new: true, session: dbSession },
            );

            // Guard: no pending payment found — either a race condition, a
            // duplicate delivery (already processed), or a missing record.
            if (!updated) return;

            if (userId) {
              await activateRecurringSubscription(userId, {
                plan: planName,
                validUntil,
                stripeCustomerId:     stripeSession.customer,
                stripeSubscriptionId: subscription.id,
                session: dbSession,
              });
            }

            await createInvoice({
              userId,
              email:     stripeSession.customer_email || updated.customer?.email,
              name:      updated.customer?.name,
              planName,
              paymentId: updated._id,
              session:   dbSession,
            });

            await createNotification({
              recipient: userId,
              type:      'payment_received',
              title:     'Payment approved',
              body:      `Your payment for the ${planName} plan has been received and your subscription is now active.`,
              link:      '/billing',
            }, { session: dbSession });
          });
        } finally {
          dbSession.endSession();
        }
        break;
      }

      // ---- Monthly renewal (Stripe auto-charged the saved card) ----
      case 'invoice.paid': {
        const stripeInvoice = event.data.object;
        // Skip the very first invoice — already handled by checkout.session.completed.
        if (stripeInvoice.billing_reason !== 'subscription_cycle') break;
        if (!stripeInvoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
        const planName   = subscription.metadata?.plan;
        const userId     = subscription.metadata?.userId || null;
        const validUntil = new Date(subscription.current_period_end * 1000);

        // Activate subscription extension and record the renewal invoice atomically.
        // gatewayInvoiceId = Stripe invoice ID ensures a duplicate webhook
        // delivery never creates a second invoice for the same renewal.
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(async () => {
            if (userId) {
              await activateRecurringSubscription(userId, {
                plan: planName,
                validUntil,
                stripeCustomerId:     stripeInvoice.customer,
                stripeSubscriptionId: subscription.id,
                session: dbSession,
              });
            }

            await createInvoice({
              userId,
              email:            stripeInvoice.customer_email,
              name:             stripeInvoice.customer_name,
              planName,
              gatewayInvoiceId: stripeInvoice.id,
              session:          dbSession,
            });

            await createNotification({
              recipient: userId,
              type:      'subscription_renewed',
              title:     'Subscription renewed',
              body:      `Your ${planName} subscription has been renewed.`,
              link:      '/billing',
            }, { session: dbSession });
          });
        } finally {
          dbSession.endSession();
        }
        break;
      }

      // ---- Subscription cancelled or expired ----
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await deactivateSubscription(subscription.id).catch((err) =>
          logger.error('Stripe deactivateSubscription failed', { subscriptionId: subscription.id, message: err.message }));
        break;
      }

      default:
        break;
    }

    res.sendStatus(200);
});
