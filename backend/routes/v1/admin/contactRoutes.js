import { Router } from 'express';
import { updateContactStatus, contactStatusValidation } from '../../../controllers/contactController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Public submission (POST /api/contact) and admin listing (GET /api/contact)
// stay on the legacy router — only the admin mutation moved here.
router.patch('/:id', requirePermissions('contact:write'), contactStatusValidation, asyncHandler(updateContactStatus));

export default router;
