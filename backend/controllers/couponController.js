import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import Coupon from '../models/Coupon.js';

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

// Fields an admin may edit via updateCoupon. `usedCount`/`usedBy` are
// system-managed (updated only by real redemptions) and must never be
// settable via this endpoint — req.body was previously passed through to
// Mongoose unfiltered, which would have allowed exactly that.
const COUPON_UPDATABLE_FIELDS = [
  'code', 'description', 'discountType', 'discountValue', 'maxUses',
  'applicablePlans', 'minOrderAmount', 'validFrom', 'validUntil', 'active',
];

export const validateCoupon = asyncHandler(async (req, res) => {
  const code = (req.body.code || req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'Coupon code is required' });

  // Exclude the potentially large usedBy array from the main fetch; check it
  // with a separate indexed query so we never load thousands of subdocuments.
  const [coupon, alreadyUsedDoc] = await Promise.all([
    Coupon.findOne({ code }).select('-usedBy'),
    req.user?._id
      ? Coupon.findOne({ code, 'usedBy.user': req.user._id }, '_id').lean()
      : Promise.resolve(null),
  ]);

  if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });

  if (!coupon.isValid()) {
    return res.status(400).json({ message: 'This coupon is expired or no longer valid' });
  }

  if (alreadyUsedDoc) {
    return res.status(400).json({ message: 'You have already used this coupon' });
  }

  res.json({
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    description: coupon.description,
  });
});

export const createCoupon = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const coupon = await Coupon.create(req.body);
  res.status(201).json({ coupon });
});

export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });
  const [coupons, total] = await Promise.all([
    Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(),
  ]);
  res.json({ coupons, total, page, pages: Math.ceil(total / limit) });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const updates = {};
  for (const key of COUPON_UPDATABLE_FIELDS) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  res.json({ coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  res.json({ message: 'Coupon deleted' });
});
