// Supabase-mode replacement for config/plans.js's getPlan(). Not a route —
// this is the internal, server-side-only pricing lookup used by the payment
// controllers (backend/controllers/stripeController.js, paymentController.js,
// manualPaymentController.js) so the browser can never dictate what it pays.
//
// Stage 2E documented originalAmount/discountPct as missing columns (the
// plan's real charge amount is `amount_minor`, unaffected either way — these
// two fields only ever drove the marketing page's "crossed out original
// price" display). Stage 2F closed the gap (0014_close_partial_gaps_schema.sql
// adds plans.original_amount_minor/discount_pct, display-only, updatable only
// via admin_update_plan_marketing() — see its own AAL2-gated RPC).
import { withAnonContext } from './client.js';

export async function getPlan(slug) {
  const row = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT slug, name, amount_minor, original_amount_minor, discount_pct, currency
         FROM plans
        WHERE slug = $1 AND active = true`,
      [slug]
    );
    return r.rows[0];
  });
  if (!row) return undefined;
  return {
    name: row.name,
    amount: row.amount_minor / 100,
    originalAmount: row.original_amount_minor != null ? row.original_amount_minor / 100 : null,
    discountPct: row.discount_pct,
    currency: row.currency,
  };
}
