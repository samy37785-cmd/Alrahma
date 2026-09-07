// Supabase-mode manual-payment controller. See docs/option-a-mongo-supabase-
// parity-map.md ("ManualPayment") for the schema comparison.
//
// One real, documented gap here (an RLS/schema property, not an
// implementation shortcut): manual_payments' INSERT policy requires
// `user_id = auth.uid()` — there is no anon-insert policy, so (unlike the
// Mongo path, which allows a logged-out visitor to submit via softProtect) a
// caller MUST be signed in to submit a manual payment under
// DATA_BACKEND=supabase.
//
// Admin review (approve/reject) and refund now have a real implementation —
// see data/supabase/admin/paymentsAdminController.js, wired at
// /api/v1/admin/payments (routes/v1/admin/index.js), using req.adminAal (see
// middleware/adminAuth.js) as genuine AAL2 proof.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';
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
