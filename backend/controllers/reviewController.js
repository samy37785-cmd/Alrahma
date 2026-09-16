import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import { auditFromReq } from '../services/auditService.js';
import Review from '../models/Review.js';
import CourseProgress from '../models/CourseProgress.js';

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

  // XOR: exactly one of teacherId/courseId, never both, never neither —
  // previously only the "neither" half was checked, so a request setting
  // BOTH could smuggle an owned relationship (e.g. a real CourseProgress
  // row) alongside an unowned one and slip past whichever branch of the
  // ownership check below ran first.
  if (teacherId && courseId) {
    return res.status(400).json({ message: 'Provide exactly one of teacherId or courseId, not both' });
  }
  if (!teacherId && !courseId) {
    return res.status(400).json({ message: 'Provide either teacherId or courseId' });
  }

  // Auth hardening security batch: previously any authenticated student
  // could review any course/teacher id with no relationship to it at all —
  // only a duplicate-review check existed. Enrollment cannot be used for
  // this (the booking-first Enrollment schema has no course/teacher
  // reference — see models/Enrollment.js); CourseProgress (created via
  // toggleProgress, itself gated behind an active subscription) is the only
  // real signal linking a student to a specific course, and User.teacher is
  // the only signal linking a student to their assigned teacher.
  if (courseId) {
    const hasProgress = await CourseProgress.exists({ user: req.user._id, course: courseId });
    if (!hasProgress) {
      return res.status(403).json({ message: 'You can only review a course you have engaged with' });
    }
  } else if (String(req.user.teacher ?? '') !== String(teacherId)) {
    return res.status(403).json({ message: 'You can only review your assigned teacher' });
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
  if (handleValidationErrors(req, res)) return;

  const { status, adminNote } = req.body;
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { ...(status && { status }), ...(adminNote && { adminNote }) },
    { new: true, runValidators: true },
  );
  if (!review) return res.status(404).json({ message: 'Review not found' });
  await auditFromReq(req, 'review.moderate', 'Review', review._id, null, review, 'info');
  res.json({ review });
});
