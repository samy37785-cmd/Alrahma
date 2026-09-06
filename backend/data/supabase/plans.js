// Supabase-mode replacement for config/plans.js's getPlan(). Not a route —
// this is the internal, server-side-only pricing lookup used by the payment
// controllers (backend/controllers/stripeController.js, paymentController.js,
// manualPaymentController.js) so the browser can never dictate what it pays.
//
// KNOWN GAP (see docs/option-a-mongo-supabase-parity-map.md, "plans" section):
// the Postgres `plans` table has no `originalAmount`/`discountPct` columns —
// it stores one flat `amount_minor` per plan version, with per-transaction
// discounts (from a coupon) captured as a *payment-level* snapshot
// (`payments.discount_minor_snapshot`), not as a permanent property of the
// plan itself. `amount_minor` here is seeded to match what customers
// currently actually pay (the Mongo config's already-discounted Starter/
// Standard/Premium prices), so nobody is over/undercharged — but the
// marketing-page "crossed out original price" display has no backing data
// under this backend and is returned as `null`.
import { withAnonContext } from './client.js';

export async function getPlan(slug) {
  const row = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT slug, name, amount_minor, currency
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
    originalAmount: null,
    discountPct: null,
    currency: row.currency,
  };
}
