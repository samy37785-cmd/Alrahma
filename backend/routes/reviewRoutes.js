import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  createReview,
  getTeacherReviews,
  getCourseReviews,
  moderateReview,
  reviewValidation,
} from '../controllers/reviewController.js';

const router = Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
};

router.post('/',                              protect, reviewValidation, createReview);
router.get('/teacher/:teacherId',             getTeacherReviews);
router.get('/course/:courseId',               getCourseReviews);
router.patch('/:id/moderate', protect, adminOnly, moderateReview);

export default router;
