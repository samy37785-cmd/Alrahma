import { Router } from 'express';
import { createEnrollment, getMyEnrollment } from '../controllers/enrollmentController.js';
import { protect } from '../middleware/auth.js';
import { enrollmentLimiter } from '../config/rateLimit.js';

const router = Router();

router.post('/',      enrollmentLimiter, createEnrollment);       // public
router.get('/mine',   protect, getMyEnrollment);                  // student

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — reachable with nothing but a regular User
// session whose `role` field said 'admin') is removed. It had zero live
// frontend consumer: the real admin Bookings tab (AdminBookingsTab.jsx)
// already reads/writes exclusively through the hardened admin API (MFA +
// RBAC + audit-logged) — see src/api/enrollmentApi.js's own comment.
// Admin CRUD (list + mutation) lives at /api/v1/admin/enrollments (see
// routes/v1/admin/enrollmentsRoutes.js).

export default router;
