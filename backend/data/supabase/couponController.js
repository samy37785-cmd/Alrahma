// DATA_BACKEND=supabase coupon controller — PARTIAL scope only: admin-read
// (listCoupons) and validate-at-checkout (validateCoupon). Coupon
// creation/update/delete are admin writes gated by
// coupons_insert/update/delete_admin_aal2 — out of scope for this adapter
// (not implemented, not even stubbed; see lib/db/drizzle/0002_rls.sql).
//
// Schema differences vs. the Mongo Coupon document (see
// lib/db/drizzle/0000_init_20_table_baseline.sql — coupons has no
// created_at/updated_at, no applicablePlans/minOrderAmount/validFrom, and a
// richer discount_scope/discount_duration_cycles model that replaces
// Mongo's flat discountType-only shape) are documented field-by-field in
// toJson() below.
//
// GENUINE RLS GAP (not an implementation shortcut) — see validateCoupon:
// coupons_select_admin is the ONLY select policy on this table
// (is_admin()-gated). A regular, non-admin authenticated user's own
// connection cannot read this table at all under the current schema, so
// POST /api/coupons/validate cannot be implemented as a real query without
// either (a) a new SECURITY DEFINER RPC that doesn't exist yet, or (b)
// bypassing RLS via service_role, which would let any signed-in customer
// read the entire coupons table through this endpoint — an authorization
// bypass. Implemented as an explicit 501 instead of either.
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
    // No column in this schema — documented gap, always empty/default.
    applicablePlans: [],
    minOrderAmount: 0,
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
export const validateCoupon = asyncHandler(async () => {
  const err = new Error(
    'Coupon validation is not supported under DATA_BACKEND=supabase yet — the coupons table has ' +
      'no authenticated-read RLS policy (only coupons_select_admin, is_admin()-gated) and no ' +
      'validate_coupon_for_user()-style SECURITY DEFINER RPC exists in the migrations yet. See ' +
      'docs/option-a-mongo-supabase-parity-map.md, "Coupon" section, before implementing this.'
  );
  err.status = 501;
  throw err;
});

// @route  GET /api/coupons
// @access Private + adminOnly
export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

  // req.user is an admin here (adminOnly ran first) — is_admin() is AAL1-
  // fine for SELECT (coupons_select_admin has no aal2 requirement), so a
  // plain withUserContext(req.user._id, ...) call is sufficient; no
  // withAdminAal2Context() needed for this read.
  const { coupons, total } = await withUserContext(req.user._id, async (client) => {
    const [listRes, totalRes] = await Promise.all([
      client.query(
        `SELECT c.*, COUNT(cr.user_id)::int AS used_count
           FROM coupons c
           LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id
          GROUP BY c.id
          ORDER BY c.code
          LIMIT $1 OFFSET $2`,
        [limit, skip]
      ),
      client.query('SELECT count(*)::int AS count FROM coupons'),
    ]);
    return { coupons: listRes.rows, total: totalRes.rows[0].count };
  });

  res.json({ coupons: coupons.map(toJson), total, page, pages: Math.ceil(total / limit) });
});
