import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCourseProgress, toggleProgress } from '../controllers/progressController.js';

const router = Router();

// The per-student admin report (GET /user/:userId) let a regular account with
// role 'admin' read any student's progress with a password alone; it is
// closed (AR-04).
router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
