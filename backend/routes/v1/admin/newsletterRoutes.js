import { Router } from 'express';
import { listSubscribers } from '../../../controllers/subscriberController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The Newsletter tab of the admin console. It used to read GET /api/newsletter
// on a password-only `role: 'admin'` account (AR-04). Subscribers are email
// addresses, so it takes the same permission as the Users tab.
router.get('/', requirePermissions('users:read'), asyncHandler(listSubscribers));

export default router;
