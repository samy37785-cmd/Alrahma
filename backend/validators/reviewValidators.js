import { body } from 'express-validator';

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
