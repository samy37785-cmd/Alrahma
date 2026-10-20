import { Router } from 'express';
import { getTrials, updateTrialStatus } from '../../../controllers/trialController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The Trials tab of the admin console. It used to read GET /api/trials on a
// password-only `role: 'admin'` account (AR-04). A trial request is a lead,
// like a booking, so it takes the same permission as the Bookings tab.
router.get('/', requirePermissions('enrollments:read'), asyncHandler(getTrials));
// Following up a lead is the same kind of work as moving a booking through
// its statuses, so it takes the Bookings tab's write permission.
router.patch('/:id/status', requirePermissions('enrollments:write'), updateTrialStatus);

export default router;
