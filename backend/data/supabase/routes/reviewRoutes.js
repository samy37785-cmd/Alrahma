// Mirrors backend/routes/reviewRoutes.js exactly. Mounted at /api/reviews by
// app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { createReview, getTeacherReviews, getCourseReviews, reviewValidation } from '../reviewController.js';

const router = Router();

router.post('/', protect, reviewValidation, createReview);
router.get('/teacher/:teacherId', getTeacherReviews);
router.get('/course/:courseId', getCourseReviews);

export default router;
