import { Router } from 'express';
import {
  createCoupon, updateCoupon, deleteCoupon, couponValidation, couponUpdateValidation, listCoupons,
} from '../../../controllers/couponController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Coupon validation (POST /api/coupons/validate — now itself closed by the
// Booking-First Enrollment payment shutdown) stays on the legacy router.
//
// Auth hardening security batch: the admin listing used to ALSO stay on
// that legacy router (GET /api/coupons, protect+adminOnly, zero live
// frontend consumer) — migrated here for the same reason the mutations
// already were. Reuses `coupons:write` rather than minting a narrow
// `coupons:read` permission for an endpoint with no current UI consumer.
router.get('/',        requirePermissions('coupons:write'), asyncHandler(listCoupons));
router.post('/',      requirePermissions('coupons:write'), couponValidation,       asyncHandler(createCoupon));
router.patch('/:id',  requirePermissions('coupons:write'), couponUpdateValidation, asyncHandler(updateCoupon));
router.delete('/:id', requirePermissions('coupons:write'), asyncHandler(deleteCoupon));

export default router;
