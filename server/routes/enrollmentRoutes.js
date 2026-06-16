import { Router } from 'express';
import { createEnrollment, getEnrollments, updateEnrollment } from '../controllers/enrollmentController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/',      createEnrollment);                          // public
router.get('/',       protect, adminOnly, getEnrollments);        // admin
router.patch('/:id',  protect, adminOnly, updateEnrollment);      // admin

export default router;
