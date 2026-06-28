import crypto from 'crypto';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';
import { enrollUser } from '../config/enrollment.js';

// Creates an Invoice from a confirmed Payment record.
async function createInvoice(payment) {
  const plan = getPlan(payment.plan);
  const period = new Date(payment.createdAt || Date.now())
    .toISOString().slice(0, 7); // "2025-06"
  await Invoice.create({
    user:           payment.userId,
    customerEmail:  payment.customer?.email,
    customerName:   payment.customer?.name,
    plan:           payment.plan,
    amount:         payment.amount,
    originalAmount: plan?.originalAmount ?? payment.amount,
    discountPct:    plan?.discountPct ?? 0,
    currency:       payment.currency,
    billingPeriod:  period,
    status:         'paid',
    payment:        payment._id,
  });
}

/*
 * Payment controller — PayMob (cards + Vodafone Cash / wallets + Fawry) for the
 * Egyptian/Arab market, and PayPal for international subscribers.
 *
 * Security notes:
 *  - The price is ALWAYS looked up server-side from config/plans.js. The client
 *    only sends the plan name + billing info, never the amount.
 *  - Card numbers are NEVER handled by us. PayMob serves its own PCI-compliant
 *    iframe; we just return its URL and the browser loads it.
 */

// ----------------------------- PayMob ---------------------------------------

const PAYMOB_BASE = 'https://accept.paymob.com/api';

// Maps our front-end method ids to a PayMob integration id (env-configured).
// Card uses the card integration; the wallet ids use the wallet integration.
function paymobIntegrationId(method) {
  const map = {
    card: process.env.PAYMOB_INTEGRATION_ID_CARD,
    vodafone: process.env.PAYMOB_INTEGRATION_ID_WALLET,
    instapay: process.env.PAYMOB_INTEGRATION_ID_WALLET,
    fawry: process.env.PAYMOB_INTEGRATION_ID_FAWRY || process.env.PAYMOB_INTEGRATION_ID_WALLET,
  };
  return map[method] || map.card;
}

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

// @desc   Start a PayMob payment (card iframe or wallet redirect)
// @route  POST /api/payments/paymob
// @access Public
export async function createPaymobPayment(req, res, next) {
  try {
    const { plan: planName, method = 'card', customer = {} } = req.body;
    const plan = getPlan(planName);
    if (!plan) {
      res.status(400);
      throw new Error(`Unknown plan: ${planName}`);
    }
    // Plan prices are in EUR. If PayMob settles in EGP, convert using the
    // configured rate; otherwise charge the EUR amount as-is.
    const currency = process.env.PAYMOB_CURRENCY || 'EGP';
    const rate = currency === 'EGP' ? Number(process.env.PAYMOB_EUR_TO_EGP) || 1 : 1;
    const amountCents = Math.round(plan.amount * rate * 100);

    if (!customer.email || !customer.name) {
      res.status(400);
      throw new Error('Customer name and email are required');
    }
    if (method !== 'card' && !customer.phone) {
      res.status(400);
      throw new Error('A mobile number is required for wallet payments');
    }

    // 1) Authenticate -> auth token
    const { token: authToken } = await postJSON(`${PAYMOB_BASE}/auth/tokens`, {
      api_key: process.env.PAYMOB_API_KEY,
    });

    // 2) Register an order
    const order = await postJSON(`${PAYMOB_BASE}/ecommerce/orders`, {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency,
      items: [{ name: `${plan.name} Plan`, amount_cents: amountCents, quantity: 1 }],
    });

    // 3) Request a payment key (scoped to a specific integration / method)
    const [firstName, ...rest] = (customer.name || 'Student').trim().split(' ');
    const billing = {
      first_name: firstName || 'Student',
      last_name: rest.join(' ') || 'Account',
      email: customer.email,
      phone_number: customer.phone || 'NA',
      country: 'NA', city: 'NA', state: 'NA', street: 'NA',
      building: 'NA', floor: 'NA', apartment: 'NA',
    };

    const { token: paymentToken } = await postJSON(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      auth_token: authToken,
      amount_cents: amountCents,
      currency,
      order_id: order.id,
      integration_id: Number(paymobIntegrationId(method)),
      billing_data: billing,
    });

    // Record the pending payment so the webhook can reconcile it later.
    await Payment.create({
      plan: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      gateway: 'paymob',
      method,
      customer,
      status: 'pending',
      gatewayOrderId: String(order.id),
      userId: req.user?._id ?? null,
    });

    // 4a) Cards -> return the hosted iframe URL (browser loads PayMob's secure page)
    if (method === 'card') {
      const iframeId = process.env.PAYMOB_IFRAME_ID;
      const iframeUrl = `${PAYMOB_BASE}/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;
      return res.json({ type: 'iframe', url: iframeUrl, orderId: order.id });
    }

    // 4b) Wallets (Vodafone Cash / InstaPay) -> ask PayMob to create the wallet
    // payment, then redirect the user to the returned redirect_url.
    const pay = await postJSON(`${PAYMOB_BASE}/acceptance/payments/pay`, {
      source: { identifier: customer.phone, subtype: 'WALLET' },
      payment_token: paymentToken,
    });

    const redirectUrl =
      pay.redirect_url || pay.iframe_redirection_url || pay.redirection_url;
    return res.json({ type: 'redirect', url: redirectUrl, orderId: order.id });
  } catch (err) {
    next(err);
  }
}

// @desc   PayMob server-to-server webhook (transaction processed callback)
// @route  POST /api/payments/paymob/webhook
// @access Public (verified via HMAC)
export async function paymobWebhook(req, res, next) {
  try {
    const hmacKey = process.env.PAYMOB_HMAC_SECRET;
    const received = req.query.hmac;
    const obj = req.body.obj || {};

    // PayMob computes the HMAC over these fields, in this exact order, concatenated.
    const fields = [
      'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
      'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
      'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
      'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
    ];
    const concat = fields
      .map((path) => path.split('.').reduce((o, k) => (o == null ? '' : o[k]), obj))
      .join('');
    const expected = crypto.createHmac('sha512', hmacKey).update(concat).digest('hex');

    if (expected !== received) {
      return res.status(401).json({ message: 'Invalid HMAC signature' });
    }

    const paid = obj.success === true && obj.pending === false && !obj.error_occured;
    const updated = await Payment.findOneAndUpdate(
      { gatewayOrderId: String(obj.order?.id) },
      { status: paid ? 'paid' : 'failed', gatewayTxnId: String(obj.id), raw: obj },
      { new: true }
    );

    if (paid && updated) {
      await createInvoice(updated).catch(() => {});
      await enrollUser(updated.userId, updated.plan).catch(() => {});
    }

    // PayMob only needs a 200 to stop retrying.
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
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
export async function createPaypalOrder(req, res, next) {
  try {
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
          return_url: `${process.env.CLIENT_URL?.split(',')[0]}/payment/success`,
          cancel_url: `${process.env.CLIENT_URL?.split(',')[0]}/payment/cancel`,
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
  } catch (err) {
    next(err);
  }
}

// @desc   Capture an approved PayPal order (call after the buyer approves)
// @route  POST /api/payments/paypal/:orderId/capture
// @access Public
export async function capturePaypalOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const token = await paypalAccessToken();

    const capture = await postJSON(
      `${paypalBase()}/v2/checkout/orders/${orderId}/capture`,
      {},
      { Authorization: `Bearer ${token}` }
    );

    const completed = capture.status === 'COMPLETED';
    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;

    const updated = await Payment.findOneAndUpdate(
      { gatewayOrderId: orderId },
      { status: completed ? 'paid' : 'failed', gatewayTxnId: captureId, raw: capture },
      { new: true }
    );

    if (completed && updated) {
      await createInvoice(updated).catch(() => {});
      await enrollUser(updated.userId, updated.plan).catch(() => {});
    }

    res.json({ status: capture.status, orderId });
  } catch (err) {
    next(err);
  }
}
