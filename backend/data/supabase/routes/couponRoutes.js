// Scope correction (see docs/current-project-status.md): mirrors
// backend/routes/couponRoutes.js exactly — coupons are a plan-price
// discount feature, not an online card-gateway feature, so this stays live
// under DATA_BACKEND=supabase too.
import { Router } from 'express';
import { validateCoupon } from '../couponController.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.post('/validate', asyncHandler(validateCoupon));

export default router;
