import { Router } from 'express';
import { validateCoupon } from '../controllers/couponController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Scope correction (see docs/current-project-status.md): coupons/discount
// codes are plan-price discounts, not an online card-gateway feature — kept
// live. Admin listing + mutations (create/update/delete) live at
// /api/v1/admin/coupons (MFA + RBAC + audit-logged — see routes/v1/admin/
// couponsRoutes.js).
router.post('/validate', asyncHandler(validateCoupon));

export default router;
