import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMyReferrals,
  trackReferral,
  convertReferral,
} from '../controllers/referralController.js';

const router = express.Router();

// Student: view own referral stats + link
router.get('/me', protect, getMyReferrals);

// Internal: record a new referral (called by auth controller on register)
router.post('/track', trackReferral);

// Admin / internal: mark referral as converted
router.patch('/:id/convert', protect, convertReferral);

export default router;
