import { Router } from 'express';
import { createEnrollment, getMyEnrollment, getEnrollments, updateEnrollment } from '../controllers/enrollmentController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { enrollmentLimiter } from '../config/rateLimit.js';

const router = Router();

router.post('/',      enrollmentLimiter, createEnrollment);       // public
router.get('/mine',   protect, getMyEnrollment);                  // student
router.get('/',       protect, adminOnly, getEnrollments);        // admin
router.patch('/:id',  protect, adminOnly, updateEnrollment);      // admin

export default router;
