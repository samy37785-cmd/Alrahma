// Mirrors backend/routes/couponRoutes.js's shutdown exactly — /validate
// backed the removed in-app CheckoutModal's coupon-code field
// (Booking-First Enrollment; see docs/current-project-status.md). There is
// no checkout left to apply a coupon at, so this is a server-side close
// (410 PAYMENTS_DISABLED) on the Supabase backend too, since app.js mounts
// this file instead of the Mongo one whenever DATA_BACKEND=supabase — the
// real validateCoupon controller stays in couponController.js, untouched,
// as legacy/deferred code. Admin listing stays live (historical/admin
// functionality, not a customer payment-initiation path).
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { listCoupons } from '../couponController.js';
import { paymentsDisabled } from '../../../middleware/paymentsDisabled.js';

const router = Router();

router.post('/validate', paymentsDisabled);

router.get('/', protect, adminOnly, listCoupons);

// Admin mutations (create/update/delete) live at /api/v1/admin/coupons
// under the Mongo path (MFA + RBAC + audit-logged) and are out of scope
// for this adapter entirely — see couponController.js's module comment.

export default router;
