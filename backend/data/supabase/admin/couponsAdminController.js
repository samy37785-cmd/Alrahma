// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/coupons.
// coupons_insert/update/delete_admin_aal2 (0002_rls.sql) require
// is_admin_aal2() only (no authorize() call inside the policy) — the
// app-layer requirePermissions('coupons:write') in couponsAdminRoutes.js
// enforces the permission string.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../../utils/validationHelper.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';
import { parsePagination } from '../../../utils/pagination.js';

export { couponValidation, couponUpdateValidation } from '../../../controllers/couponController.js';

// Auth hardening security batch: the admin listing used to live only at
// GET /api/coupons (data/supabase/routes/couponRoutes.js's legacy
// protect+adminOnly path, keyed off a regular customer session whose
// `role`/`account_role` claim said 'admin' — not the real hardened
// AdminUser + MFA session). Migrated here, into the real admin pipeline;
// req.adminUser.id is a real Supabase Auth uid under DATA_BACKEND=supabase
// (see data/supabase/adminAuthController.js), so the same
// withUserContext()-scoped query works unchanged, just no longer reachable
// via a regular customer session at all.
// @route GET /api/v1/admin/coupons
export const listCoupons = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

  const { coupons, total } = await withUserContext(req.adminUser.id, async (client) => {
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
};

function toJson(row) {
  return {
    _id: row.id,
    code: row.code,
    description: row.description ?? '',
    discountType: row.type,
    discountValue: Number(row.value),
    maxUses: row.max_uses,
    applicablePlans: row.applicable_plan_ids ?? [],
    minOrderAmount: row.min_order_minor ?? 0,
    validUntil: row.expires_at,
    active: row.active,
    discountScope: row.discount_scope,
    discountDurationCycles: row.discount_duration_cycles,
  };
}

// @route POST /api/v1/admin/coupons
export const createCoupon = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const {
    code, description, discountType, discountValue, discountScope = 'first_payment_only', discountDurationCycles,
    maxUses, applicablePlans = [], minOrderAmount, validUntil,
  } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO coupons (code, description, type, value, discount_scope, discount_duration_cycles,
                               max_uses, applicable_plan_ids, min_order_minor, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          String(code).toUpperCase(), description ?? null, discountType, discountValue, discountScope,
          discountDurationCycles ?? null, maxUses ?? null, applicablePlans, minOrderAmount ?? null,
          validUntil ? new Date(validUntil) : null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A coupon with this code already exists' });
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  await auditAdminAction({ adminId: req.adminUser.id, action: 'coupon.create', resourceType: 'coupons', resourceId: row.id, after: row });
  res.status(201).json({ coupon: toJson(row) });
});

// @route PATCH /api/v1/admin/coupons/:id
export const updateCoupon = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const { code, description, discountType, discountValue, maxUses, applicablePlans, minOrderAmount, validUntil, active } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE coupons SET
           code = COALESCE($2, code),
           description = COALESCE($3, description),
           type = COALESCE($4::coupon_type, type),
           value = COALESCE($5, value),
           max_uses = COALESCE($6, max_uses),
           applicable_plan_ids = COALESCE($7, applicable_plan_ids),
           min_order_minor = COALESCE($8, min_order_minor),
           expires_at = COALESCE($9, expires_at),
           active = COALESCE($10, active)
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id, code ? String(code).toUpperCase() : null, description ?? null, discountType ?? null,
          discountValue ?? null, maxUses ?? null, applicablePlans ?? null, minOrderAmount ?? null,
          validUntil ? new Date(validUntil) : null, active ?? null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A coupon with this code already exists' });
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Coupon not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'coupon.update', resourceType: 'coupons', resourceId: row.id, after: row });
  res.json({ coupon: toJson(row) });
});

// @route DELETE /api/v1/admin/coupons/:id
export const deleteCoupon = asyncHandler(async (req, res) => {
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [req.params.id]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  if (!row) return res.status(404).json({ message: 'Coupon not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'coupon.delete', resourceType: 'coupons', resourceId: row.id, severity: 'warning' });
  res.json({ message: 'Coupon deleted' });
});
