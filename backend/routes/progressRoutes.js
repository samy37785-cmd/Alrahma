import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCourseProgress, toggleProgress } from '../controllers/progressController.js';

const router = Router();

// The admin's per-student report is GET /api/v1/admin/users/:userId/progress
// (AR-04).
router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
