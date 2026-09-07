import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { createCoupon, updateCoupon, deleteCoupon, couponValidation, couponUpdateValidation } from './couponsAdminController.js';

const router = Router();

router.post('/',      requirePermissions('coupons:write'), couponValidation,       asyncHandler(createCoupon));
router.patch('/:id',  requirePermissions('coupons:write'), couponUpdateValidation, asyncHandler(updateCoupon));
router.delete('/:id', requirePermissions('coupons:write'), asyncHandler(deleteCoupon));

export default router;
