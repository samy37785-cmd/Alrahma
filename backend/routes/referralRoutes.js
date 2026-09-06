import express from 'express';
import { protect } from '../middleware/auth.js';
import { getMyReferrals, trackReferral } from '../controllers/referralController.js';

const router = express.Router();

// Student: view own referral stats + link
router.get('/me', protect, getMyReferrals);

// Record a new referral for the logged-in caller's own account (the referee
// is always derived from the session — see the SECURITY note in the
// controller). Requires auth: previously public, allowing any anonymous
// caller to attribute an arbitrary user's account to any referral code.
router.post('/track', protect, trackReferral);

// Admin mutation (mark converted) now lives at /api/v1/admin/referrals
// (MFA + RBAC + audit-logged — see routes/v1/admin/referralsRoutes.js).

export default router;
