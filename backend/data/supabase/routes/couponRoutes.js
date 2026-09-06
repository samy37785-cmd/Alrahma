// Mirrors backend/routes/couponRoutes.js's in-scope routes only (validate +
// admin list) — see couponController.js's module comment for what's
// deliberately out of scope (admin create/update/delete, AAL2-gated).
// Mounted at /api/coupons by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { validateCoupon, listCoupons } from '../couponController.js';

const router = Router();

router.post('/validate', protect, validateCoupon);

router.get('/', protect, adminOnly, listCoupons);

// Admin mutations (create/update/delete) live at /api/v1/admin/coupons under
// the Mongo path (MFA + RBAC + audit-logged) and are out of scope for this
// adapter entirely — see couponController.js's module comment.

export default router;
