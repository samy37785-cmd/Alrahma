// Mirrors backend/routes/enrollmentRoutes.js exactly (same paths, methods,
// middleware, including the shared enrollmentLimiter) — only the controller
// implementation differs. Mounted at /api/enrollments by app.js only when
// DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose role claim
// said 'admin', not the real hardened admin + MFA session) is removed.
// Admin listing now lives at /api/v1/admin/enrollments (see
// data/supabase/admin/enrollmentsAdminRoutes.js).
import { Router } from 'express';
import { createEnrollment, getMyEnrollment } from '../enrollmentController.js';
import { protect } from '../../../middleware/auth.js';
import { enrollmentLimiter } from '../../../config/rateLimit.js';

const router = Router();

router.post('/', enrollmentLimiter, createEnrollment); // public
router.get('/mine', protect, getMyEnrollment); // student

export default router;
