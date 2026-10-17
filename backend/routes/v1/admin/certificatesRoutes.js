import { Router } from 'express';
import { issueCertificate, revokeCertificate, listCertificates } from '../../../controllers/certificateController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The student's own certificates stay at GET /api/certificates/mine. The
// admin listing moved here from GET /api/certificates (AR-04).
router.get('/',       requirePermissions('users:read'),         asyncHandler(listCertificates));
router.post('/',      requirePermissions('certificates:write'), asyncHandler(issueCertificate));
router.delete('/:id', requirePermissions('certificates:write'), asyncHandler(revokeCertificate));

export default router;
