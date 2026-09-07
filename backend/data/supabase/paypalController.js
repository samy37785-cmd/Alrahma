// DATA_BACKEND=supabase PayPal controller. Mirrors controllers/
// paymentController.js's PayPal route/response contract (createPaypalOrder,
// capturePaypalOrder, paypalWebhook). Uses PAYPAL_MODE=sandbox (or whatever
// the Mongo path is already configured with — this file never chooses
// live vs. sandbox itself) — same env vars, never real money.
//
// Scope decision: unlike Stripe, this schema's subscription-granting RPCs
// treat PayPal as a ONE-TIME payment gateway, not a recurring-billing one —
// service_apply_subscription_update() (0006_subscription_integrity.sql) is
// stripe-only by design ("paypal/manual grants use
// admin_activate_manual_subscription()"). Rather than force PayPal through
// that admin-approval RPC (which requires a human AAL2 action per payment —
// wrong for an automated checkout), this controller uses a new, purpose-
// built RPC, service_grant_subscription_from_payment() (lib/db/drizzle/
// 0017_paypal_subscription_grant.sql), that grants one billing period per
// successful capture — consistent with how the Mongo path's own PayPal
// integration already works (a one-time charge that activates a month of
// access, not a PayPal Subscriptions API recurring agreement).
import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { siteOrigin } from '../../config/site.js';
import { withServiceRole } from './client.js';
import logger from '../../config/logger.js';

function paypalBase() {
  return process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function postJSON(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gateway error (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function paypalAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// @route POST /api/payments/paypal
// @access Public (softProtect attaches req.user if logged in)
export const createPaypalOrder = asyncHandler(async (req, res) => {
  const { plan: planSlug } = req.body;

  const plan = await withServiceRole(async (client) => {
    const r = await client.query(`SELECT id, slug, name, amount_minor, currency FROM plans WHERE slug = $1 AND active = true`, [planSlug]);
    return r.rows[0];
  });
  if (!plan) return res.status(400).json({ message: `Unknown plan: ${planSlug}` });

  const token = await paypalAccessToken();
  const order = await postJSON(
    `${paypalBase()}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [{
        description: `${plan.name} Plan — Al-Rahma Academy`,
        amount: { currency_code: plan.currency, value: (plan.amount_minor / 100).toFixed(2) },
      }],
      application_context: {
        brand_name: 'Al-Rahma Academy',
        user_action: 'PAY_NOW',
        return_url: `${siteOrigin()}/payment/success`,
        cancel_url: `${siteOrigin()}/payment/cancel`,
      },
    },
    { Authorization: `Bearer ${token}` }
  );

  await withServiceRole((client) =>
    client.query(
      `INSERT INTO payments (user_id, plan_id, kind, amount_minor, plan_amount_minor_snapshot, currency_snapshot, gateway, gateway_payment_id, status)
       VALUES ($1, $2, 'charge', $3, $3, $4, 'paypal', $5, 'pending')`,
      [req.user?._id ?? null, plan.id, plan.amount_minor, plan.currency, order.id]
    )
  );

  const approveLink = order.links?.find((l) => l.rel === 'approve')?.href;
  res.json({ type: 'redirect', url: approveLink, orderId: order.id });
});

// One period's worth of access per successful one-time capture, mirroring
// the Mongo path's own PayPal behavior (see module comment above).
const PAYPAL_GRANT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

async function finalizePaypalOrder(client, orderId, capture) {
  // The order id (gateway_payment_id) is what we matched the pending row by
  // and remains stable for idempotent re-delivery lookups; the CAPTURE id
  // (needed later for an actual PayPal refund call — captures, not orders,
  // are what /v2/payments/captures/{id}/refund takes) is stashed in
  // gateway_metadata instead of overwriting gateway_payment_id.
  const captureId = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
  const paymentRes = await client.query(
    `UPDATE payments SET status = 'succeeded', gateway_metadata = $2, updated_at = now()
     WHERE gateway_payment_id = $1 AND gateway = 'paypal' AND status = 'pending'
     RETURNING id, user_id, plan_id`,
    [orderId, captureId ? JSON.stringify({ captureId }) : null]
  );
  const payment = paymentRes.rows[0];
  if (!payment) return { fulfilled: false }; // no matching pending row: unknown order or already finalized

  if (capture?.status !== 'COMPLETED') return { fulfilled: false };

  if (payment.user_id) {
    await client.query(
      `SELECT service_grant_subscription_from_payment($1, $2, 'paypal', $3, $4)`,
      [payment.user_id, payment.plan_id, orderId, new Date(Date.now() + PAYPAL_GRANT_PERIOD_MS)]
    );
  }
  await client.query(`SELECT issue_invoice_from_payment($1)`, [payment.id]);
  return { fulfilled: true };
}

// @route POST /api/payments/paypal/:orderId/capture
// @access Public
export const capturePaypalOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const token = await paypalAccessToken();
  const capture = await postJSON(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {}, { Authorization: `Bearer ${token}` });

  await withServiceRole((client) => finalizePaypalOrder(client, orderId, capture));
  res.json({ status: capture.status, orderId });
});

// @route POST /api/payments/paypal/webhook
// @access Public (verified via PayPal's verify-webhook-signature API)
export const paypalWebhook = asyncHandler(async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return res.status(401).json({ message: 'PayPal webhook not configured' });

  const certUrl = req.headers['paypal-cert-url'] || '';
  if (!/^https:\/\/api(?:-m)?\.paypal\.com\//.test(certUrl)) {
    return res.status(400).json({ message: 'Invalid PayPal cert_url' });
  }

  const token = await paypalAccessToken();
  const verify = await postJSON(
    `${paypalBase()}/v1/notifications/verify-webhook-signature`,
    {
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: certUrl,
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: req.body,
    },
    { Authorization: `Bearer ${token}` }
  );
  if (verify.verification_status !== 'SUCCESS') {
    return res.status(400).json({ message: 'Invalid PayPal webhook signature' });
  }

  const event = req.body;

  await withServiceRole(async (client) => {
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const inserted = await client.query(
      `INSERT INTO provider_events (provider, provider_event_id, event_type, payload_hash, payload_summary)
       VALUES ('paypal', $1, $2, $3, $4)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [event.id, event.event_type, payloadHash, JSON.stringify({ type: event.event_type })]
    );
    const eventId = inserted.rows[0]?.id;
    if (!eventId) return; // duplicate delivery

    const claimed = await client.query(`SELECT * FROM claim_provider_event($1)`, [eventId]);
    const claimToken = claimed.rows[0]?.claim_token;
    if (!claimToken) return;

    let outcome = 'processed';
    let errorCode = null;
    try {
      if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
        const orderId = event.resource?.id;
        const capture = await postJSON(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {}, { Authorization: `Bearer ${token}` }).catch(() => null);
        if (capture) await finalizePaypalOrder(client, orderId, capture);
      } else {
        outcome = 'ignored';
      }
    } catch (err) {
      logger.error('PayPal webhook processing failed', { eventType: event.event_type, message: err.message });
      outcome = 'failed';
      errorCode = err.code || 'processing_error';
    }

    await client.query(`SELECT complete_provider_event($1, $2, $3, $4)`, [eventId, claimToken, outcome, errorCode]);
  });

  res.sendStatus(200);
});
