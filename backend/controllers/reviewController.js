import mongoose from 'mongoose';
import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import { auditFromReq } from '../services/auditService.js';
import Review from '../models/Review.js';
import { createNotification } from './notificationController.js';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Additive, backward-compatible: omitting ?sort (or passing an unrecognized
// value) preserves the original hardcoded newest-first behavior.
const REVIEW_SORTS = {
  recent: { createdAt: -1 },
  rating_desc: { rating: -1, createdAt: -1 },
  rating_asc: { rating: 1, createdAt: -1 },
};

function resolveReviewSort(sortParam) {
  return REVIEW_SORTS[sortParam] || REVIEW_SORTS.recent;
}

export const reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  body('body').trim().notEmpty().withMessage('Review body is required').isLength({ max: 2000 }),
  body('title').optional().trim().isLength({ max: 120 }),
];

// moderateReview operates on a different field set than reviewValidation
// (moderation status, not review content), so it has its own small rule set.
// Both fields optional: the controller currently allows updating adminNote
// alone (status is a no-op if omitted), which this preserves — but status,
// when present, must be one of the real enum values.
export const reviewModerationValidation = [
  body('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('status must be pending, approved, or rejected'),
  body('adminNote').optional().trim().isLength({ max: 500 }),
];

export const createReview = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { rating, title, body: reviewBody, teacherId, courseId } = req.body;

  if (!teacherId && !courseId) {
    return res.status(400).json({ message: 'Provide either teacherId or courseId' });
  }
  if ((teacherId && !isValidObjectId(teacherId)) || (courseId && !isValidObjectId(courseId))) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  const existing = await Review.findOne({
    student: req.user._id,
    ...(teacherId ? { teacher: teacherId } : { course: courseId }),
  }).lean();
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
  if (!isValidObjectId(req.params.teacherId)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const [reviews, total, stats] = await Promise.all([
    Review.find({ teacher: req.params.teacherId, status: 'approved' })
      .populate('student', 'name')
      .sort(resolveReviewSort(req.query.sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ teacher: req.params.teacherId, status: 'approved' }),
    Review.avgRatingForTeacher(req.params.teacherId),
  ]);

  res.json({ reviews, total, page, pages: Math.ceil(total / limit), ...stats });
});

export const getCourseReviews = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const [reviews, total, stats] = await Promise.all([
    Review.find({ course: req.params.courseId, status: 'approved' })
      .populate('student', 'name')
      .sort(resolveReviewSort(req.query.sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ course: req.params.courseId, status: 'approved' }),
    Review.ratingStatsForCourse(req.params.courseId),
  ]);

  res.json({ reviews, total, page, pages: Math.ceil(total / limit), ...stats });
});

export const moderateReview = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  const { status, adminNote } = req.body;

  // Read the prior status first so a notification only fires on the actual
  // pending/rejected -> approved transition, not on every subsequent
  // moderateReview call (e.g. an admin editing adminNote after approval).
  const before = await Review.findById(req.params.id).select('status').lean();
  if (!before) return res.status(404).json({ message: 'Review not found' });

  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { ...(status && { status }), ...(adminNote && { adminNote }) },
    { new: true, runValidators: true },
  );
  await auditFromReq(req, 'review.moderate', 'Review', review._id, null, review, 'info');

  if (status === 'approved' && before.status !== 'approved') {
    await createNotification({
      recipient: review.student,
      type:      'review_approved',
      title:     'Your review was approved',
      body:      'Your review has been approved and is now visible to others.',
      link:      '/dashboard',
    });
  }

  res.json({ review });
});

// @desc  Admin: list all reviews (any status), optionally filtered — the
//        moderation queue's only source of pending review IDs, since
//        getTeacherReviews/getCourseReviews only ever return status:'approved'.
// @route GET /api/reviews?status=pending
// @access Admin (mirrors the legacy protect+adminOnly convention already used
//         for GET /api/coupons, /api/contact, /api/certificates — only the
//         moderation mutation itself lives on the hardened /v1/admin stack).
export const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('student', 'name email')
      .populate('teacher', 'name')
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  res.json({ reviews, total, page, pages: Math.ceil(total / limit) });
});
