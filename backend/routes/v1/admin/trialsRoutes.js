import { Router } from 'express';
import { getTrials } from '../../../controllers/trialController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The Trials tab of the admin console. It used to read GET /api/trials on a
// password-only `role: 'admin'` account (AR-04). A trial request is a lead,
// like a booking, so it takes the same permission as the Bookings tab.
router.get('/', requirePermissions('enrollments:read'), asyncHandler(getTrials));

export default router;
