import { Router } from 'express';
import { updateContactStatus, contactStatusValidation, getContacts } from '../../../controllers/contactController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Public submission (POST /api/contact) stays on the legacy router.
//
// Auth hardening security batch: the admin listing used to ALSO stay on
// that legacy router (GET /api/contact, protect+adminOnly, zero live
// frontend consumer) — migrated here for the same reason the mutation
// already was. Reuses `contact:write` rather than minting a narrow
// `contact:read` permission for an endpoint with no current UI consumer.
router.get('/',      requirePermissions('contact:write'), asyncHandler(getContacts));
router.patch('/:id', requirePermissions('contact:write'), contactStatusValidation, asyncHandler(updateContactStatus));

export default router;
