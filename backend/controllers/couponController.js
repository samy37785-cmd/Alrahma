import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/asyncHandler.js';
import Coupon from '../models/Coupon.js';

export const couponValidation = [
  body('code').trim().toUpperCase().notEmpty().withMessage('Code is required').matches(/^[A-Z0-9_-]{3,30}$/),
  body('discountType').isIn(['percent', 'fixed']).withMessage('discountType must be percent or fixed'),
  body('discountValue').isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
  body('maxUses').optional().isInt({ min: 1 }),
  body('validUntil').optional().isISO8601(),
];

export const validateCoupon = asyncHandler(async (req, res) => {
  const code = (req.body.code || req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'Coupon code is required' });

  const coupon = await Coupon.findOne({ code });
  if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });

  if (!coupon.isValid()) {
    return res.status(400).json({ message: 'This coupon is expired or no longer valid' });
  }

  const alreadyUsed = coupon.usedBy.some((u) => u.user?.toString() === req.user?._id?.toString());
  if (alreadyUsed) {
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
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const coupon = await Coupon.create(req.body);
  res.status(201).json({ coupon });
});

export const listCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json({ coupons });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  res.json({ coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  res.json({ message: 'Coupon deleted' });
});
