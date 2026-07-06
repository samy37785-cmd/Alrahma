import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  validateCoupon,
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  couponValidation,
  couponUpdateValidation,
} from '../controllers/couponController.js';

const router = Router();

router.post('/validate', protect, validateCoupon);

router.get('/',       protect, adminOnly, listCoupons);
router.post('/',      protect, adminOnly, couponValidation, createCoupon);
router.patch('/:id',  protect, adminOnly, couponUpdateValidation, updateCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);

export default router;
