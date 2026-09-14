import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCourseProgress, toggleProgress } from '../controllers/progressController.js';

const router = Router();

// Auth hardening security batch: the admin report that used to live here
// (GET /user/:userId, protect+adminOnly) is removed — AdminProgressModal.jsx
// (the real, MFA-gated admin SPA) is its only consumer and now calls
// GET /api/v1/admin/users/:id/progress instead (see routes/v1/admin/
// usersRoutes.js), behind the real hardened admin stack.

router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
