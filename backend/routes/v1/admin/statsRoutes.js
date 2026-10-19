import { Router } from 'express';
import { getOverviewStats } from '../../../controllers/adminOverviewController.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The Overview tab's figures. Any MFA-verified admin may call it; each
// section inside is computed only for an admin who holds that section's
// read permission (see controllers/adminOverviewController.js).
router.get('/overview', asyncHandler(getOverviewStats));

export default router;
