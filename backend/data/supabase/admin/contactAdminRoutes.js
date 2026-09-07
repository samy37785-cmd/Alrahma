import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { updateContactStatus, contactStatusValidation } from './contactAdminController.js';

const router = Router();

router.patch('/:id', requirePermissions('contact:write'), contactStatusValidation, asyncHandler(updateContactStatus));

export default router;
