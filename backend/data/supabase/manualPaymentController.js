// Supabase-mode manual-payment controller. See docs/option-a-mongo-supabase-
// parity-map.md ("ManualPayment") for the schema comparison.
//
// Two real, documented gaps here (both are RLS/schema properties, not
// implementation shortcuts):
//   1. manual_payments' INSERT policy requires `user_id = auth.uid()` — there
//      is no anon-insert policy, so (unlike the Mongo path, which allows a
//      logged-out visitor to submit via softProtect) a caller MUST be signed
//      in to submit a manual payment under DATA_BACKEND=supabase.
//   2. Both admin endpoints (list, review) require `is_admin_aal2()` at the
//      RLS/RPC level — this backend has no way to prove an admin completed
//      MFA (see client.js's module comment), so they call
//      withAdminAal2Context() and let it throw, surfacing as a clear error
//      rather than silently bypassing the check.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext, withAdminAal2Context } from './client.js';
import { getManualMethods } from '../../controllers/manualPaymentController.js';

// Pure env-var read, no database access either way — safe to reuse verbatim
// from the Mongo controller.
export { getManualMethods };

// @route POST /api/payments/manual
export const submitManualPayment = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Please sign in to submit a manual payment.');
  }

  const { plan: planSlug, method, reference = '', notes = '' } = req.body;

  const record = await withUserContext(req.user._id, async (client) => {
    const planRes = await client.query(
      'SELECT id, amount_minor, currency FROM plans WHERE slug = $1 AND active = true',
      [planSlug]
    );
    const plan = planRes.rows[0];
    if (!plan) return null;

    const r = await client.query(
      `INSERT INTO manual_payments
         (user_id, plan_id, requested_plan_slug, amount_minor, currency_snapshot, method, reference, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.user._id, plan.id, planSlug, plan.amount_minor, plan.currency, method, reference, notes]
    );
    return r.rows[0];
  });

  if (!record) {
    res.status(400);
    throw new Error(`Unknown plan: ${planSlug}`);
  }

  res.status(201).json({
    message: 'Payment request received. We will verify and activate your plan within 24 hours.',
    id: record.id,
  });
});

// @route GET /api/v1/admin/payments/manual
export const listManualPayments = asyncHandler(async () => {
  await withAdminAal2Context();
});

// @route PATCH /api/v1/admin/payments/manual/:id
export const reviewManualPayment = asyncHandler(async () => {
  await withAdminAal2Context();
});
