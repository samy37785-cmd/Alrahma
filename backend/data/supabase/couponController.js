// DATA_BACKEND=supabase coupon controller — PARTIAL scope only: admin-read
// (listCoupons) and validate-at-checkout (validateCoupon). Coupon
// creation/update/delete are admin writes gated by
// coupons_insert/update/delete_admin_aal2 — out of scope for this adapter
// (not implemented, not even stubbed; see lib/db/drizzle/0002_rls.sql).
//
// Schema differences vs. the Mongo Coupon document (see
// lib/db/drizzle/0000_init_20_table_baseline.sql — coupons has no
// created_at/updated_at, and a richer discount_scope/discount_duration_cycles
// model that replaces Mongo's flat discountType-only shape) are documented
// field-by-field in toJson() below. applicablePlans/minOrderAmount (Stage 2E
// gaps) were closed in Stage 2F (0014_close_partial_gaps_schema.sql —
// applicable_plan_ids/min_order_minor) and are now real columns.
//
// validateCoupon: Stage 2E left this as an explicit 501 because
// coupons_select_admin was the only SELECT policy on this table (a regular
// user's connection couldn't read it at all) and no validate RPC existed.
// Closed in Stage 2F via validate_coupon() (lib/db/drizzle/
// 0015_new_domains_rls.sql, SECURITY DEFINER) — it never exposes the raw
// row, only the {valid, discountType, discountValue, discountScope} (or
// {valid:false, reason}) shape below.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { withUserContext } from './client.js';

function toJson(row) {
  return {
    _id: row.id,
    code: row.code,
    description: row.description ?? '',
    discountType: row.type,
    discountValue: Number(row.value),
    maxUses: row.max_uses,
    usedCount: row.used_count ?? 0,
    // Per-redemption detail isn't joined into this bulk listing (would need
    // a json_agg per row) — the full record lives in coupon_redemptions.
    usedBy: [],
    applicablePlans: row.applicable_plan_ids ?? [],
    minOrderAmount: row.min_order_minor ?? 0,
    validFrom: null,
    validUntil: row.expires_at,
    active: row.active,
    // Postgres-native fields with no Mongo equivalent — see
    // docs/option-a-mongo-supabase-parity-map.md, "Coupon" section.
    discountScope: row.discount_scope,
    discountDurationCycles: row.discount_duration_cycles,
  };
}

// @route  POST /api/coupons/validate
// @access Private (any authenticated user)
export const validateCoupon = asyncHandler(async (req, res) => {
  const code = (req.body.code || req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'Coupon code is required' });

  const planId = req.body.planId || req.query.planId || null;
  const orderAmountMinor = req.body.orderAmountMinor != null ? Number(req.body.orderAmountMinor) : null;

  const result = await withUserContext(req.user._id, async (client) => {
    const r = await client.query('SELECT validate_coupon($1, $2, $3) AS result', [
      code,
      planId,
      orderAmountMinor,
    ]);
    return r.rows[0].result;
  });

  if (!result.valid) {
    const status = result.reason === 'not_found' ? 404 : 400;
    const messages = {
      not_found: 'Invalid coupon code',
      expired: 'This coupon is expired or no longer valid',
      max_uses_reached: 'This coupon is expired or no longer valid',
      already_used: 'You have already used this coupon',
      plan_not_eligible: 'This coupon is not valid for the selected plan',
      min_order_not_met: 'This coupon requires a higher order amount',
    };
    return res.status(status).json({ message: messages[result.reason] ?? 'Invalid coupon code' });
  }

  // validate_coupon() deliberately never returns `description` (the RPC's
  // own comment: "never the raw row") — omitted here rather than faked.
  res.json({
    valid: true,
    code,
    discountType: result.discountType,
    discountValue: Number(result.discountValue),
  });
});

// @route  GET /api/coupons
// @access Private + adminOnly
export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

  // req.user is an admin here (adminOnly ran first) — is_admin() is AAL1-
  // fine for SELECT (coupons_select_admin has no aal2 requirement), so a
  // plain withUserContext(req.user._id, ...) call is sufficient; no
  // withAdminAal2Context() needed for this read.
  // Sequential, not Promise.all — a single pg client can only run one query
  // at a time; firing several concurrently on it is deprecated, undefined
  // behavior, not real parallelism (same bug class found and fixed in
  // parentController.js/reviewController.js during the Al-Rahma Final
  // Corrections Part A rehearsal).
  const { coupons, total } = await withUserContext(req.user._id, async (client) => {
    const listRes = await client.query(
      `SELECT c.*, COUNT(cr.user_id)::int AS used_count
         FROM coupons c
         LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id
        GROUP BY c.id
        ORDER BY c.code
        LIMIT $1 OFFSET $2`,
      [limit, skip]
    );
    const totalRes = await client.query('SELECT count(*)::int AS count FROM coupons');
    return { coupons: listRes.rows, total: totalRes.rows[0].count };
  });

  res.json({ coupons: coupons.map(toJson), total, page, pages: Math.ceil(total / limit) });
});
