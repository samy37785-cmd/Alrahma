import { Router } from 'express';
import { issueCertificate, revokeCertificate } from '../../../controllers/certificateController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Student's own certificates (GET /api/certificates/mine) and admin listing
// (GET /api/certificates) stay on the legacy router — only the admin
// mutations moved here.
router.post('/',      requirePermissions('certificates:write'), asyncHandler(issueCertificate));
router.delete('/:id', requirePermissions('certificates:write'), asyncHandler(revokeCertificate));

export default router;
