// Mirrors backend/routes/courseRoutes.js exactly. Mounted at /api/courses by
// app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { getCourses, getCourse } from '../courseController.js';
import { protect } from '../../../middleware/auth.js';

const router = Router();

router.get('/', getCourses);
router.get('/:id', protect, getCourse);

export default router;
