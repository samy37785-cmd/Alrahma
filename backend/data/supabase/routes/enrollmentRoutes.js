// Mirrors backend/routes/enrollmentRoutes.js exactly (same paths, methods,
// middleware, including the shared enrollmentLimiter) — only the controller
// implementation differs. Mounted at /api/enrollments by app.js only when
// DATA_BACKEND=supabase.
import { Router } from 'express';
import { createEnrollment, getMyEnrollment, getEnrollments } from '../enrollmentController.js';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { enrollmentLimiter } from '../../../config/rateLimit.js';

const router = Router();

router.post('/', enrollmentLimiter, createEnrollment); // public
router.get('/mine', protect, getMyEnrollment); // student
router.get('/', protect, adminOnly, getEnrollments); // admin

export default router;
