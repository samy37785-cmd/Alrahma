import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyCertificates } from '../controllers/certificateController.js';

const router = Router();

// Student: my certificates
router.get('/mine', protect, getMyCertificates);


// Admin mutations (issue/revoke) now live at /api/v1/admin/certificates
// (MFA + RBAC + audit-logged — see routes/v1/admin/certificatesRoutes.js).

export default router;
