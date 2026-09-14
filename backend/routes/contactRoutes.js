import { Router } from 'express';
import { submitContact, contactValidation } from '../controllers/contactController.js';

const router = Router();

// Public — anyone can submit a contact message
router.post('/', contactValidation, submitContact);

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly) is removed. It had zero live frontend
// consumer (confirmed by grep across src/api and src/components) — the
// admin mutation (status update) already lived at /api/v1/admin/contact
// (MFA + RBAC + audit-logged — see routes/v1/admin/contactRoutes.js),
// which now also carries the listing (GET /) for the same reason.

export default router;
