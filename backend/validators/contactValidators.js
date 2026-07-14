import { body } from 'express-validator';

export const contactValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ min: 10, max: 3000 }),
];

// updateContactStatus operates on a different field set than contactValidation
// (admin workflow status, not the submitted message), so it has its own small
// rule set. Both optional: the controller allows updating adminNote alone.
export const contactStatusValidation = [
  body('status').optional().isIn(['new', 'in_progress', 'resolved', 'spam']).withMessage('status must be new, in_progress, resolved, or spam'),
  body('adminNote').optional().trim().isLength({ max: 1000 }),
];
