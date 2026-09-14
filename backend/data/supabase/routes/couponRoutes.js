// Mirrors backend/routes/couponRoutes.js's shutdown exactly — /validate
// backed the removed in-app CheckoutModal's coupon-code field
// (Booking-First Enrollment; see docs/current-project-status.md). There is
// no checkout left to apply a coupon at, so this is a server-side close
// (410 PAYMENTS_DISABLED) on the Supabase backend too, since app.js mounts
// this file instead of the Mongo one whenever DATA_BACKEND=supabase — the
// real validateCoupon controller stays in couponController.js, untouched,
// as legacy/deferred code.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose `role`/
// `account_role` claim said 'admin', not the real hardened AdminUser + MFA
// session) is removed. Admin listing + mutations now live at
// /api/v1/admin/coupons (see data/supabase/admin/couponsAdminRoutes.js).
import { Router } from 'express';
import { paymentsDisabled } from '../../../middleware/paymentsDisabled.js';

const router = Router();

router.post('/validate', paymentsDisabled);

export default router;
