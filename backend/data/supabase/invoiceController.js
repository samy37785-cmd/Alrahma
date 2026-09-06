// Supabase-mode invoice controller. Stage 2E documented invoices.invoice_
// number as missing (always null); Stage 2F closed that gap
// (0014_close_partial_gaps_schema.sql adds the column, and
// issue_invoice_from_payment() now populates it via next_document_number()
// — see 0015_new_domains_rls.sql). Everything else in the response is
// reshaped from Postgres's snapshot columns into the same field names the
// Mongo controller returns.
//
// getAdminInvoices requires is_admin_aal2() at the RLS level, but runs under
// GET /api/invoices/admin — a customer-session route (protect+adminOnly),
// which has no AAL2 concept at all (see client.js's module comment on
// withAdminAal2Context for the full explanation). It calls
// withAdminAal2Context() and lets it throw, rather than fabricating AAL2.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext, withAdminAal2Context } from './client.js';

function toMongoShape(row) {
  // invoices stores the discount as a currency amount (discount_minor_
  // snapshot), not a percentage — derived here rather than faked as null,
  // since the underlying amount is real (closes the discountPct gap noted
  // in the parity map's field-mismatch list).
  const pretaxMinor = row.amount_minor_snapshot + (row.discount_minor_snapshot ?? 0);
  const discountPct =
    row.discount_minor_snapshot > 0 && pretaxMinor > 0
      ? Math.round((row.discount_minor_snapshot / pretaxMinor) * 100)
      : 0;

  return {
    _id: row.id,
    invoiceNumber: row.invoice_number ?? null,
    user: row.user_id,
    customerEmail: row.customer_email ?? null,
    customerName: row.customer_name_snapshot,
    plan: row.plan_name_snapshot,
    amount: row.amount_minor_snapshot / 100,
    discountPct,
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
      `SELECT id, invoice_number, user_id, plan_name_snapshot, customer_name_snapshot,
              amount_minor_snapshot, discount_minor_snapshot, currency_snapshot, status, payment_id,
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
      `SELECT id, invoice_number, user_id, plan_name_snapshot, customer_name_snapshot,
              amount_minor_snapshot, discount_minor_snapshot, currency_snapshot, status, payment_id,
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
