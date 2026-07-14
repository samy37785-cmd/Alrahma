import { Router } from 'express';
import { createCoupon, updateCoupon, deleteCoupon } from '../../../controllers/couponController.js';
import { couponValidation, couponUpdateValidation } from '../../../validators/couponValidators.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Coupon validation (POST /api/coupons/validate) and admin listing
// (GET /api/coupons) stay on the legacy router — only the admin mutations
// moved here.
router.post('/',      requirePermissions('coupons:write'), couponValidation,       asyncHandler(createCoupon));
router.patch('/:id',  requirePermissions('coupons:write'), couponUpdateValidation, asyncHandler(updateCoupon));
router.delete('/:id', requirePermissions('coupons:write'), asyncHandler(deleteCoupon));

export default router;
