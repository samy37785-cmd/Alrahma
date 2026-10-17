// DATA_BACKEND=supabase admin sub-routers for the Trials and Newsletter tabs.
// Same paths and permissions as routes/v1/admin/trialsRoutes.js and
// newsletterRoutes.js. Both reads used to run on a password-only
// `role: 'admin'` account under /api/trials and /api/newsletter (AR-04).
import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { getTrials } from '../trialController.js';
import { listSubscribers } from '../subscriberController.js';

export const trialsRouter = Router();
trialsRouter.get('/', requirePermissions('enrollments:read'), asyncHandler(getTrials));

export const newsletterRouter = Router();
newsletterRouter.get('/', requirePermissions('users:read'), asyncHandler(listSubscribers));
