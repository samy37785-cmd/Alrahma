import { Router } from 'express';
import { getCourses, getCourse } from '../controllers/courseController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Public catalogue (no resources)
router.get('/', getCourses);
// Single course WITH resources — requires login; resources gated by subscription
router.get('/:id', protect, getCourse);

// Admin mutations (create/update/delete) now live at /api/v1/admin/courses
// (MFA + RBAC + audit-logged — see routes/v1/admin/coursesRoutes.js).

export default router;
