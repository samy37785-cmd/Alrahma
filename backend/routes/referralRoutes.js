import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  getMyReferrals,
  trackReferral,
  convertReferral,
} from '../controllers/referralController.js';

const router = express.Router();

// Student: view own referral stats + link
router.get('/me', protect, getMyReferrals);

// Record a new referral for the logged-in caller's own account (the referee
// is always derived from the session — see the SECURITY note in the
// controller). Requires auth: previously public, allowing any anonymous
// caller to attribute an arbitrary user's account to any referral code.
router.post('/track', protect, trackReferral);

// Admin: mark referral as converted. Previously missing adminOnly despite
// its own documented "Admin / Internal" access level — any authenticated
// user could mark any referral as converted.
router.patch('/:id/convert', protect, adminOnly, convertReferral);

export default router;
