import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { validateCoupon, listCoupons } from '../controllers/couponController.js';

const router = Router();

router.post('/validate', protect, validateCoupon);

router.get('/', protect, adminOnly, listCoupons);

// Admin mutations (create/update/delete) now live at /api/v1/admin/coupons
// (MFA + RBAC + audit-logged — see routes/v1/admin/couponsRoutes.js).

export default router;
