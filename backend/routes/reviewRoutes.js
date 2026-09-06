import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  createReview,
  getTeacherReviews,
  getCourseReviews,
  reviewValidation,
} from '../controllers/reviewController.js';

const router = Router();

router.post('/',                 protect, reviewValidation, createReview);
router.get('/teacher/:teacherId', getTeacherReviews);
router.get('/course/:courseId',   getCourseReviews);

// Admin mutation (moderation) now lives at /api/v1/admin/reviews
// (MFA + RBAC + audit-logged — see routes/v1/admin/reviewsRoutes.js).

export default router;
