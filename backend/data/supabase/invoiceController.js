// Supabase-mode invoice controller. See docs/option-a-mongo-supabase-parity-
// map.md ("Invoice") — the Postgres `invoices` table has no invoice-number
// column at all, so `invoiceNumber` is always returned as `null` here (a
// real, documented gap: there is no customer-facing "INV-2026-0001"-style
// identifier under this backend yet). Everything else in the response is
// reshaped from Postgres's snapshot columns into the same field names the
// Mongo controller returns.
//
// getAdminInvoices requires is_admin_aal2() at the RLS level (see
// client.js's module comment on why this backend can't safely assert that) —
// it calls withAdminAal2Context() and lets it throw.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext, withAdminAal2Context } from './client.js';

function toMongoShape(row) {
  return {
    _id: row.id,
    invoiceNumber: null, // gap — see module comment
    user: row.user_id,
    customerEmail: row.customer_email ?? null,
    customerName: row.customer_name_snapshot,
    plan: row.plan_name_snapshot,
    amount: row.amount_minor_snapshot / 100,
    discountPct: null, // no equivalent column — see plans.js gap note
    currency: row.currency_snapshot,
    status: row.status,
    payment: row.payment_id,
    gatewayInvoiceId: row.gateway_invoice_id,
    createdAt: row.created_at,
  };
}

// @route GET /api/invoices/admin
export const getAdminInvoices = asyncHandler(async () => {
  await withAdminAal2Context();
});

// @route GET /api/invoices
export const getMyInvoices = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, user_id, plan_name_snapshot, customer_name_snapshot,
              amount_minor_snapshot, currency_snapshot, status, payment_id,
              gateway_invoice_id, created_at
         FROM invoices
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user._id]
    );
    return r.rows;
  });
  res.json(rows.map(toMongoShape));
});

// @route GET /api/invoices/:id
export const getInvoice = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT id, user_id, plan_name_snapshot, customer_name_snapshot,
              amount_minor_snapshot, currency_snapshot, status, payment_id,
              gateway_invoice_id, created_at
         FROM invoices
        WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user._id]
    );
    return r.rows[0];
  });

  if (!row) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  res.json(toMongoShape(row));
});
