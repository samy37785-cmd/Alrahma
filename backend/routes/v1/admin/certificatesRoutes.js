import { Router } from 'express';
import { issueCertificate, revokeCertificate, listCertificates } from '../../../controllers/certificateController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Student's own certificates (GET /api/certificates/mine) stay on the
// legacy router (real self-service, correctly scoped to req.user._id).
//
// Auth hardening security batch: the admin listing used to ALSO stay on
// that legacy router (GET /api/certificates, protect+adminOnly) with a
// real active consumer — AdminProgressModal.jsx's listCertificates(userId)
// — reachable with nothing but a regular User session whose `role` field
// said 'admin'. It is migrated here now, behind the real hardened admin
// stack; routes/certificateRoutes.js's own GET / was removed.
router.get('/',       requirePermissions('certificates:read'),  asyncHandler(listCertificates));
router.post('/',      requirePermissions('certificates:write'), asyncHandler(issueCertificate));
router.delete('/:id', requirePermissions('certificates:write'), asyncHandler(revokeCertificate));

export default router;
