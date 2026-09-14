import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { createCoupon, updateCoupon, deleteCoupon, couponValidation, couponUpdateValidation, listCoupons } from './couponsAdminController.js';

const router = Router();

// Auth hardening security batch: migrated from the legacy protect+adminOnly
// GET /api/coupons (data/supabase/routes/couponRoutes.js) — see
// couponsAdminController.js's listCoupons for why. Reuses `coupons:write`
// rather than minting a `coupons:read` permission, same as the Mongo fix.
router.get('/',        requirePermissions('coupons:write'), asyncHandler(listCoupons));
router.post('/',      requirePermissions('coupons:write'), couponValidation,       asyncHandler(createCoupon));
router.patch('/:id',  requirePermissions('coupons:write'), couponUpdateValidation, asyncHandler(updateCoupon));
router.delete('/:id', requirePermissions('coupons:write'), asyncHandler(deleteCoupon));

export default router;
