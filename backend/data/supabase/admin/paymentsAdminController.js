// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/payments.
// Two capabilities: manual-payment review (approve/reject a WU/MoneyGram/
// Payoneer-style submission — admin_review_manual_payment(), 0002_rls.sql)
// and refund (admin_record_refund(), 0009_refund_integrity.sql). Both RPCs
// are is_admin_aal2()-gated; req.adminAal (verified fresh per request — see
// middleware/adminAuth.js) is what makes that check pass.
//
// admin_record_refund() itself only ever writes the ledger row — its own
// doc comment is explicit that it "never calls Stripe/PayPal". This
// controller is what actually closes that gap in TEST MODE: it calls the
// real (test-mode) gateway refund API first, then records the ledger row
// with the gateway's own refund id, so a refund here is a genuine refund,
// not just a database entry pretending one happened.
import Stripe from 'stripe';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext, withServiceRole } from '../client.js';
import logger from '../../../config/logger.js';

let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

function paypalBase() {
  return process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
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

// @route GET /api/v1/admin/payments/manual
export const listManualPayments = asyncHandler(async (req, res) => {
  const rows = await withServiceRole((client) =>
    client.query(`SELECT * FROM manual_payments ORDER BY created_at DESC LIMIT 200`).then((r) => r.rows)
  );
  res.json(rows);
});

// @route PATCH /api/v1/admin/payments/manual/:id
export const reviewManualPayment = asyncHandler(async (req, res) => {
  const { decision, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(422).json({ message: 'decision must be approved or rejected' });
  }

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(`SELECT * FROM admin_review_manual_payment($1, $2, $3)`, [req.params.id, decision, adminNote || null]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /caller is not an aal2-verified admin/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    if (/is not a pending manual_payments row/i.test(err.message)) {
      return res.status(404).json({ message: 'Manual payment not found or already reviewed' });
    }
    throw err;
  }

  res.json(row);
});

// @route POST /api/v1/admin/payments/:id/refund
// @body { amountMinor, reason? }
export const recordRefund = asyncHandler(async (req, res) => {
  const amountMinor = parseInt(req.body.amountMinor, 10);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(422).json({ message: 'amountMinor must be a positive integer' });
  }

  const charge = await withServiceRole((client) =>
    client.query(`SELECT * FROM payments WHERE id = $1`, [req.params.id]).then((r) => r.rows[0])
  );
  if (!charge) return res.status(404).json({ message: 'Payment not found' });
  if (charge.kind !== 'charge' || charge.status !== 'succeeded') {
    return res.status(400).json({ message: 'Only a succeeded charge can be refunded' });
  }

  let gatewayRefundId = null;
  try {
    if (charge.gateway === 'stripe' && charge.gateway_payment_id) {
      const refund = await getStripe().refunds.create({
        payment_intent: charge.gateway_payment_id,
        amount: amountMinor,
      });
      gatewayRefundId = refund.id;
    } else if (charge.gateway === 'paypal') {
      const captureId = charge.gateway_metadata?.captureId;
      if (captureId) {
        const token = await paypalAccessToken();
        const res2 = await fetch(`${paypalBase()}/v2/payments/captures/${captureId}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: { value: (amountMinor / 100).toFixed(2), currency_code: charge.currency_snapshot } }),
        });
        const data = await res2.json().catch(() => ({}));
        if (!res2.ok) throw new Error(`PayPal refund failed: ${JSON.stringify(data)}`);
        gatewayRefundId = data.id;
      }
    }
    // 'manual' gateway charges have no external gateway to call — the
    // ledger row alone is the refund record, same as the Mongo path's
    // equivalent manual-payment handling.
  } catch (err) {
    logger.error('Gateway refund call failed', { paymentId: charge.id, gateway: charge.gateway, message: err.message });
    return res.status(502).json({ message: `Gateway refund failed: ${err.message}` });
  }

  let refund;
  try {
    refund = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(`SELECT * FROM admin_record_refund($1, $2, $3)`, [req.params.id, amountMinor, gatewayRefundId]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /caller is not an aal2-verified admin/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  res.status(201).json(refund);
});
