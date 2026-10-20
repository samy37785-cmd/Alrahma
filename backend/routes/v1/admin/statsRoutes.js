import { Router } from 'express';
import { getOverviewStats } from '../../../controllers/adminOverviewController.js';
import { getServiceStatus } from '../../../controllers/serviceStatusController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The Overview tab's figures. Any MFA-verified admin may call it; each
// section inside is computed only for an admin who holds that section's
// read permission (see controllers/adminOverviewController.js).
router.get('/overview', asyncHandler(getOverviewStats));
// The Overview tab's Service status card: this server's commit, a database
// ping and a comparison with main on GitHub. An operations view, so it takes
// the audit log's read permission (super-admin, admin and viewer; an editor
// gets 403).
router.get('/service-status', requirePermissions('audit:read'), asyncHandler(getServiceStatus));

export default router;
