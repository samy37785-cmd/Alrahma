import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getMyCertificates, listCertificates } from '../controllers/certificateController.js';

const router = Router();

// Student: my certificates
router.get('/mine', protect, getMyCertificates);

router.get('/', protect, adminOnly, listCertificates);

// Admin mutations (issue/revoke) now live at /api/v1/admin/certificates
// (MFA + RBAC + audit-logged — see routes/v1/admin/certificatesRoutes.js).

export default router;
