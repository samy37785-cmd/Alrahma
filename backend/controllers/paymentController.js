import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import { getPlan } from '../config/plans.js';
import { enrollUser } from '../services/subscriptionService.js';
import { createInvoice } from '../services/invoiceService.js';
import { siteOrigin } from '../config/site.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import logger from '../config/logger.js';

/*
 * Payment controller — PayPal for international subscribers, plus the shared
 * helpers used by the manual/offline payment flow.
 *
 * Security notes:
 *  - The price is ALWAYS looked up server-side from config/plans.js. The client
 *    only sends the plan name + billing info, never the amount.
 *  - Card numbers are NEVER handled by us (Stripe/PayPal host their own
 *    PCI-compliant checkout; we only redirect the browser to it).
 */

// Small fetch helper that throws with the gateway's error body on failure.
async function postJSON(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gateway error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// ----------------------------- PayPal ---------------------------------------

function paypalBase() {
  return process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

// OAuth2 client-credentials -> short-lived access token.
async function paypalAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// @desc   Create a PayPal order (returns the approval link to redirect to)
// @route  POST /api/payments/paypal
// @access Public
export const createPaypalOrder = asyncHandler(async (req, res) => {
    const { plan: planName, customer = {} } = req.body;
    const plan = getPlan(planName);
    if (!plan) {
      res.status(400);
      throw new Error(`Unknown plan: ${planName}`);
    }
    const token = await paypalAccessToken();

    const order = await postJSON(
      `${paypalBase()}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            description: `${plan.name} Plan — Al-Rahma Academy`,
            amount: { currency_code: plan.currency, value: plan.amount.toFixed(2) },
          },
        ],
        application_context: {
          brand_name: 'Al-Rahma Academy',
          user_action: 'PAY_NOW',
          return_url: `${siteOrigin()}/payment/success`,
          cancel_url: `${siteOrigin()}/payment/cancel`,
        },
      },
      { Authorization: `Bearer ${token}` }
    );

    await Payment.create({
      plan: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      gateway: 'paypal',
      method: 'paypal',
      customer,
      status: 'pending',
      gatewayOrderId: order.id,
      userId: req.user?._id ?? null,
    });

    const approve = order.links?.find((l) => l.rel === 'approve')?.href;
    res.json({ type: 'redirect', url: approve, orderId: order.id });
});

/**
 * Idempotently finalises a PayPal order inside a single MongoDB transaction.
 *
 * All three mutations — marking the Payment paid, creating the Invoice, and
 * activating the subscription — execute atomically. If any step throws, the
 * session aborts and the database is left in a fully consistent state.
 *
 * Safe to call multiple times for the same order (idempotent: a payment that
 * is already 'paid' exits before the transaction begins).
 */
async function finalizePaypalOrder(orderId, capture) {
  // Fast-path idempotency check outside the transaction to avoid overhead.
  const existing = await Payment.findOne({ gatewayOrderId: orderId }).lean();
  if (!existing) {
    logger.warn('PayPal finalize: no payment record found', { orderId });
    return { status: capture?.status, fulfilled: false };
  }
  if (existing.status === 'paid') {
    logger.debug('PayPal finalize: already paid — idempotent skip', { orderId });
    return { status: 'COMPLETED', fulfilled: false };
  }

  const completed = capture?.status === 'COMPLETED';

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      // Re-fetch inside the transaction for a consistent, locked snapshot.
      const payment = await Payment.findOne({ gatewayOrderId: orderId }).session(session);
      if (!payment || payment.status === 'paid') {
        result = { status: capture?.status, fulfilled: false };
        return;
      }

      payment.status       = completed ? 'paid' : 'failed';
      payment.gatewayTxnId = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      payment.raw          = capture;
      await payment.save({ session });

      if (completed) {
        await createInvoice({
          userId:    payment.userId,
          email:     payment.customer?.email,
          name:      payment.customer?.name,
          planName:  payment.plan,
          paymentId: payment._id,
          createdAt: payment.createdAt,
          session,
        });

        await enrollUser(payment.userId, payment.plan, session);
        logger.info('PayPal payment finalized', {
          orderId,
          paymentId: String(payment._id),
          plan:      payment.plan,
          userId:    String(payment.userId),
        });
      } else {
        logger.warn('PayPal capture not completed', { orderId, captureStatus: capture?.status });
      }

      result = { status: capture?.status, fulfilled: completed };
    });
    return result;
  } finally {
    session.endSession();
  }
}

// @desc   Capture an approved PayPal order (called by the browser after approval)
// @route  POST /api/payments/paypal/:orderId/capture
// @access Public
export const capturePaypalOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const token = await paypalAccessToken();

    const capture = await postJSON(
      `${paypalBase()}/v2/checkout/orders/${orderId}/capture`,
      {},
      { Authorization: `Bearer ${token}` }
    );

    await finalizePaypalOrder(orderId, capture);
    res.json({ status: capture.status, orderId });
});

// @desc   PayPal webhook — safety net so a payment is never lost if the buyer
//         closes the tab before the browser-side capture runs.
// @route  POST /api/payments/paypal/webhook
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
        auth_algo:         req.headers['paypal-auth-algo'],
        cert_url:          certUrl,
        transmission_id:   req.headers['paypal-transmission-id'],
        transmission_sig:  req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id:        webhookId,
        webhook_event:     req.body,
      },
      { Authorization: `Bearer ${token}` }
    );

    if (verify.verification_status !== 'SUCCESS') {
      return res.status(400).json({ message: 'Invalid PayPal webhook signature' });
    }

    const event = req.body;

    // Buyer approved but capture may not have run yet (closed tab) → capture now.
    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource?.id;
      const capture = await postJSON(
        `${paypalBase()}/v2/checkout/orders/${orderId}/capture`,
        {},
        { Authorization: `Bearer ${token}` }
      ).catch(() => null);
      if (capture) await finalizePaypalOrder(orderId, capture);
    }

    // A capture completed → make sure it's fulfilled (idempotent).
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await finalizePaypalOrder(orderId, {
          status: 'COMPLETED',
          purchase_units: [{ payments: { captures: [{ id: event.resource.id }] } }],
        });
      }
    }

    res.sendStatus(200);
});
