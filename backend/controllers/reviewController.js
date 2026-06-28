import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import Review from '../models/Review.js';

export const reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  body('body').trim().notEmpty().withMessage('Review body is required').isLength({ max: 2000 }),
  body('title').optional().trim().isLength({ max: 120 }),
];

export const createReview = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { rating, title, body: reviewBody, teacherId, courseId } = req.body;

  if (!teacherId && !courseId) {
    return res.status(400).json({ message: 'Provide either teacherId or courseId' });
  }

  const existing = await Review.findOne({
    student: req.user._id,
    ...(teacherId ? { teacher: teacherId } : { course: courseId }),
  });
  if (existing) return res.status(409).json({ message: 'You have already submitted a review' });

  const review = await Review.create({
    student: req.user._id,
    ...(teacherId ? { teacher: teacherId } : { course: courseId }),
    rating,
    title,
    body: reviewBody,
  });

  res.status(201).json({ review });
});

export const getTeacherReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const [reviews, total, stats] = await Promise.all([
    Review.find({ teacher: req.params.teacherId, status: 'approved' })
      .populate('student', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ teacher: req.params.teacherId, status: 'approved' }),
    Review.avgRatingForTeacher(req.params.teacherId),
  ]);

  res.json({ reviews, total, page, pages: Math.ceil(total / limit), ...stats });
});

export const getCourseReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const [reviews, total] = await Promise.all([
    Review.find({ course: req.params.courseId, status: 'approved' })
      .populate('student', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ course: req.params.courseId, status: 'approved' }),
  ]);

  res.json({ reviews, total, page, pages: Math.ceil(total / limit) });
});

export const moderateReview = asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status, ...(adminNote && { adminNote }) },
    { new: true },
  );
  if (!review) return res.status(404).json({ message: 'Review not found' });
  res.json({ review });
});
