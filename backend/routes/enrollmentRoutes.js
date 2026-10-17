import { Router } from 'express';
import { createEnrollment, getMyEnrollment } from '../controllers/enrollmentController.js';
import { protect } from '../middleware/auth.js';
import { enrollmentLimiter } from '../config/rateLimit.js';

const router = Router();

router.post('/',      enrollmentLimiter, createEnrollment);       // public
router.get('/mine',   protect, getMyEnrollment);                  // student

// Admin mutation (status update) now lives at /api/v1/admin/enrollments
// (MFA + RBAC + audit-logged — see routes/v1/admin/enrollmentsRoutes.js).

export default router;
