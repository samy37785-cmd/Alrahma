// DATA_BACKEND=supabase Stripe controller. Mirrors controllers/
// stripeController.js's route/response contract (createStripeSession,
// stripeWebhook), TEST MODE ONLY — reads whatever STRIPE_SECRET_KEY/
// STRIPE_WEBHOOK_SECRET are configured (a test-mode `sk_test_...` key in
// local/rehearsal use, same env vars the Mongo path already uses; this file
// never chooses live vs. test itself and never touches real money).
//
// `payments` has no INSERT/UPDATE grant for `authenticated` at all — Stage 1
// deliberately made it RPC/service_role-only (see lib/db/drizzle/0002_rls.sql,
// "payments (no UPDATE/INSERT — RPC-only/service_role-only)"). So unlike most
// of this backend's other controllers, this one runs its DB work through
// withServiceRole() throughout, the same trust boundary a webhook handler
// already has to have — the checkout-creation step is equally "the backend
// itself deciding to record a pending charge," not a user-scoped RLS action.
//
// Idempotency: provider_events' (provider, provider_event_id) unique index
// (0000_init_20_table_baseline.sql) is the real dedup boundary — a Stripe
// webhook retry after a 200 is never reprocessed. claim_provider_event()/
// complete_provider_event() (0003/0005_provider_events_fencing.sql) add the
// lease/fencing semantics for concurrent delivery.
import crypto from 'crypto';
import Stripe from 'stripe';
import { siteOrigin } from '../../config/site.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withServiceRole } from './client.js';
import logger from '../../config/logger.js';

let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// @route POST /api/payments/stripe
// @access Public (softProtect attaches req.user if logged in)
export const createStripeSession = asyncHandler(async (req, res) => {
  const { plan: planSlug, customer = {} } = req.body;

  const plan = await withServiceRole(async (client) => {
    const r = await client.query(
      `SELECT id, slug, name, amount_minor, currency FROM plans WHERE slug = $1 AND active = true`,
      [planSlug]
    );
    return r.rows[0];
  });
  if (!plan) {
    return res.status(400).json({ message: `Unknown plan: ${planSlug}` });
  }

  const stripe = getStripe();
  const origin = siteOrigin();
  const userId = req.user?._id ?? null;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: plan.currency.toLowerCase(),
        product_data: { name: `${plan.name} Plan — Al-Rahma Academy` },
        unit_amount: plan.amount_minor,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    customer_email: customer.email || undefined,
    subscription_data: { metadata: { userId: userId ?? '', planId: plan.id } },
    metadata: { userId: userId ?? '', planId: plan.id },
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancel`,
  });

  await withServiceRole((client) =>
    client.query(
      `INSERT INTO payments (user_id, plan_id, kind, amount_minor, plan_amount_minor_snapshot, currency_snapshot, gateway, gateway_payment_id, status)
       VALUES ($1, $2, 'charge', $3, $3, $4, 'stripe', $5, 'pending')`,
      [userId, plan.id, plan.amount_minor, plan.currency, session.id]
    )
  );

  res.json({ type: 'redirect', url: session.url, sessionId: session.id });
});

async function recordEvent(client, { provider, event }) {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
  const r = await client.query(
    `INSERT INTO provider_events (provider, provider_event_id, event_type, payload_hash, payload_summary)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING id`,
    [provider, event.id, event.type, payloadHash, JSON.stringify({ type: event.type })]
  );
  return r.rows[0]?.id ?? null;
}

// @route POST /api/payments/stripe/webhook
// @access Public (verified via Stripe signature; raw body set in app.js)
export const stripeWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(401).json({ message: 'Stripe webhook not configured' });

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch {
    return res.status(400).json({ message: 'Invalid Stripe signature' });
  }

  await withServiceRole(async (client) => {
    const eventId = await recordEvent(client, { provider: 'stripe', event });
    if (!eventId) return; // duplicate delivery — already recorded, ack without reprocessing

    const claimed = await client.query(`SELECT * FROM claim_provider_event($1)`, [eventId]);
    const claimToken = claimed.rows[0]?.claim_token;
    if (!claimToken) return; // lost the race to another worker — that worker owns completion

    let outcome = 'processed';
    let errorCode = null;
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const stripeSession = event.data.object;
          if (stripeSession.mode !== 'subscription') break;

          const subscription = await stripe.subscriptions.retrieve(stripeSession.subscription);
          const userId = stripeSession.metadata?.userId || subscription.metadata?.userId || null;
          const planId = stripeSession.metadata?.planId || subscription.metadata?.planId || null;

          const paymentRes = await client.query(
            `UPDATE payments SET status = 'succeeded', gateway_payment_id = $2, updated_at = now()
             WHERE gateway_payment_id = $1 AND status = 'pending'
             RETURNING id, user_id, plan_id`,
            [stripeSession.id, stripeSession.payment_intent || subscription.id]
          );
          const payment = paymentRes.rows[0];
          if (!payment) break; // already processed (duplicate) or no matching pending payment

          if (userId || payment.user_id) {
            await client.query(
              `SELECT service_apply_subscription_update($1, $2, 'stripe', $3, $4, 'active', $5, $6, false)`,
              [
                userId || payment.user_id, planId || payment.plan_id,
                stripeSession.customer, subscription.id,
                new Date(subscription.current_period_start * 1000),
                new Date(subscription.current_period_end * 1000),
              ]
            );
          }
          await client.query(`SELECT issue_invoice_from_payment($1)`, [payment.id]);
          break;
        }

        case 'invoice.paid': {
          const stripeInvoice = event.data.object;
          if (stripeInvoice.billing_reason !== 'subscription_cycle' || !stripeInvoice.subscription) break;

          const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
          const subRes = await client.query(
            `SELECT user_id, plan_id FROM subscriptions WHERE provider_subscription_id = $1`,
            [subscription.id]
          );
          const sub = subRes.rows[0];
          if (!sub) break; // renewal for a subscription we never recorded — nothing to extend

          const paymentRes = await client.query(
            `INSERT INTO payments (user_id, plan_id, kind, amount_minor, plan_amount_minor_snapshot, currency_snapshot, gateway, gateway_payment_id, status)
             VALUES ($1, $2, 'charge', $3, $3, $4, 'stripe', $5, 'succeeded')
             RETURNING id`,
            [sub.user_id, sub.plan_id, stripeInvoice.amount_paid, (stripeInvoice.currency || 'eur').toUpperCase(), stripeInvoice.id]
          );

          await client.query(
            `SELECT service_apply_subscription_update($1, $2, 'stripe', $3, $4, 'active', $5, $6, false)`,
            [
              sub.user_id, sub.plan_id, stripeInvoice.customer, subscription.id,
              new Date(subscription.current_period_start * 1000),
              new Date(subscription.current_period_end * 1000),
            ]
          );
          await client.query(`SELECT issue_invoice_from_payment($1)`, [paymentRes.rows[0].id]);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const subRes = await client.query(
            `SELECT user_id, plan_id FROM subscriptions WHERE provider_subscription_id = $1`,
            [subscription.id]
          );
          const sub = subRes.rows[0];
          if (!sub) break;
          await client.query(
            `SELECT service_apply_subscription_update($1, $2, 'stripe', $3, $4, 'canceled', $5, $6, false)`,
            [
              sub.user_id, sub.plan_id, subscription.customer, subscription.id,
              new Date(subscription.current_period_start * 1000),
              new Date(subscription.current_period_end * 1000),
            ]
          );
          break;
        }

        default:
          outcome = 'ignored';
      }
    } catch (err) {
      logger.error('Stripe webhook processing failed', { eventType: event.type, message: err.message });
      outcome = 'failed';
      errorCode = err.code || 'processing_error';
    }

    await client.query(`SELECT complete_provider_event($1, $2, $3, $4)`, [eventId, claimToken, outcome, errorCode]);
  });

  res.sendStatus(200);
});
