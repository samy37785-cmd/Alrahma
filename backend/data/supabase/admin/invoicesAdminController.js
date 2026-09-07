// Admin-router (DATA_BACKEND=supabase) controller for
// /api/v1/admin/invoices — the real fix for the admin-invoices architecture
// gap: GET /api/invoices/admin (data/supabase/invoiceController.js) is
// mounted under the customer-session protect+adminOnly middleware, which
// has no AAL2 concept at all, yet invoices RLS requires is_admin_aal2().
// This endpoint runs under the real /api/v1/admin/* verifyAccessToken flow,
// which DOES produce a freshly-verified req.adminAal every request — the
// same AAL2 proof every other admin-router adapter forwards into
// withUserContext.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';

function toJson(row) {
  const pretaxMinor = row.amount_minor_snapshot + (row.discount_minor_snapshot ?? 0);
  const discountPct =
    row.discount_minor_snapshot > 0 && pretaxMinor > 0
      ? Math.round((row.discount_minor_snapshot / pretaxMinor) * 100)
      : 0;

  return {
    _id: row.id,
    invoiceNumber: row.invoice_number ?? null,
    user: row.user_id,
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

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

// @route GET /api/v1/admin/invoices
export const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM invoices ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, skip]
    );
    const countRes = await client.query('SELECT count(*)::int AS n FROM invoices');
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit), limit });
});
