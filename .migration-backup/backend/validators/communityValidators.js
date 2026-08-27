import { body } from 'express-validator';

export const postValidation = [
  body('body').trim().notEmpty().withMessage('Post body is required').isLength({ max: 2000 }),
];

export const commentValidation = [
  body('body').trim().notEmpty().withMessage('Comment body is required').isLength({ max: 1000 }),
];

export const moderationValidation = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('adminNote').optional().trim().isLength({ max: 500 }),
];
