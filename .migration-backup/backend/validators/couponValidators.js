import { body } from 'express-validator';

export const couponValidation = [
  body('code').trim().toUpperCase().notEmpty().withMessage('Code is required').matches(/^[A-Z0-9_-]{3,30}$/),
  body('discountType').isIn(['percent', 'fixed']).withMessage('discountType must be percent or fixed'),
  body('discountValue').isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
  body('maxUses').optional().isInt({ min: 1 }),
  body('validUntil').optional().isISO8601(),
];

// Same field rules as couponValidation, but every field is optional — PATCH
// is a partial update, so a request that only changes e.g. `active` must not
// be rejected for omitting `discountType`/`discountValue`.
export const couponUpdateValidation = [
  body('code').optional().trim().toUpperCase().notEmpty().withMessage('Code cannot be empty').matches(/^[A-Z0-9_-]{3,30}$/),
  body('discountType').optional().isIn(['percent', 'fixed']).withMessage('discountType must be percent or fixed'),
  body('discountValue').optional().isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
  body('maxUses').optional().isInt({ min: 1 }),
  body('validUntil').optional().isISO8601(),
  body('validFrom').optional().isISO8601(),
  body('description').optional().trim().isLength({ max: 300 }),
  body('applicablePlans').optional().isArray(),
  body('minOrderAmount').optional().isFloat({ min: 0 }),
  body('active').optional().isBoolean(),
];
