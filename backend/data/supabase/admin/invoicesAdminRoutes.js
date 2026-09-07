import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { listInvoices } from './invoicesAdminController.js';

const router = Router();

router.get('/', requirePermissions('payments:read'), asyncHandler(listInvoices));

export default router;
