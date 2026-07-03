import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  validateCoupon,
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  couponValidation,
} from '../controllers/couponController.js';

const router = Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
};

router.post('/validate', protect, validateCoupon);

router.get('/',       protect, adminOnly, listCoupons);
router.post('/',      protect, adminOnly, couponValidation, createCoupon);
router.patch('/:id',  protect, adminOnly, updateCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);

export default router;
