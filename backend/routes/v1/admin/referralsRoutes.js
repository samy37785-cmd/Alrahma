import { Router } from 'express';
import { convertReferral } from '../../../controllers/referralController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// A caller's own referral stats (GET /api/referrals/me) and tracking
// (POST /api/referrals/track) stay on the legacy router — only the admin
// mutation moved here.
router.patch('/:id/convert', requirePermissions('referrals:write'), asyncHandler(convertReferral));

export default router;
