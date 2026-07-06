import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  createReview,
  getTeacherReviews,
  getCourseReviews,
  moderateReview,
  reviewValidation,
  reviewModerationValidation,
} from '../controllers/reviewController.js';

const router = Router();

router.post('/',                              protect, reviewValidation, createReview);
router.get('/teacher/:teacherId',             getTeacherReviews);
router.get('/course/:courseId',               getCourseReviews);
router.patch('/:id/moderate', protect, adminOnly, reviewModerationValidation, moderateReview);

export default router;
