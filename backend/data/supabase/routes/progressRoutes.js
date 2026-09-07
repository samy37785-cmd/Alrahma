// Mirrors backend/routes/progressRoutes.js exactly. Mounted at /api/progress
// by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { getCourseProgress, toggleProgress, getUserProgress } from '../courseProgressController.js';

const router = Router();

router.get('/user/:userId', protect, adminOnly, getUserProgress);
router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
