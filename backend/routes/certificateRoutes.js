import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyCertificates } from '../controllers/certificateController.js';

const router = Router();

// Student: my certificates
router.get('/mine', protect, getMyCertificates);

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly) is removed — AdminProgressModal.jsx (the real,
// MFA-gated admin SPA) is its only consumer and now calls
// GET /api/v1/admin/certificates instead (see routes/v1/admin/
// certificatesRoutes.js). Admin mutations (issue/revoke) already lived
// there (MFA + RBAC + audit-logged).

export default router;
