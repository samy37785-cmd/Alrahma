import { Router } from 'express';
import { paymentsDisabled } from '../middleware/paymentsDisabled.js';

const router = Router();

// /validate backed the removed in-app CheckoutModal's coupon-code field
// (Booking-First Enrollment; see docs/current-project-status.md). There is
// no checkout left to apply a coupon at, so this is now a server-side close
// (410 PAYMENTS_DISABLED), not just an unlinked frontend route — the real
// validateCoupon controller stays in controllers/couponController.js,
// untouched, as legacy/deferred code.
router.post('/validate', paymentsDisabled);

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly, zero live frontend consumer) is removed.
// Admin listing + mutations (create/update/delete) now live at
// /api/v1/admin/coupons (MFA + RBAC + audit-logged — see routes/v1/admin/
// couponsRoutes.js).

export default router;
