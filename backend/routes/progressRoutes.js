import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getCourseProgress, toggleProgress, getUserProgress } from '../controllers/progressController.js';

const router = Router();

// Admin report — must be declared before the generic /:courseId route.
router.get('/user/:userId', protect, adminOnly, getUserProgress);

router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
