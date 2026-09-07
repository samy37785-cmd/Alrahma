import { Router } from 'express';
import { requireAdminRole, requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import {
  getSystemStatus,
  toggleMaintenanceMode,
  toggleFinancialFreeze,
  getAuditLog,
  purgeOldAuditLogs,
  listAdmins,
  createAdmin,
} from './systemAdminController.js';
import { toggleMaintenanceModeValidation, toggleFinancialFreezeValidation, getAuditLogValidation, purgeOldAuditLogsValidation, createAdminValidation } from '../../../controllers/systemController.js';
import { handleValidationErrors } from '../../../utils/validationHelper.js';

const router = Router();

function withValidation(rules, handler) {
  return [...rules, asyncHandler(async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;
    return handler(req, res, next);
  })];
}

router.get('/status', asyncHandler(getSystemStatus));

router.post('/maintenance', requireAdminRole('super-admin'), ...withValidation(toggleMaintenanceModeValidation, toggleMaintenanceMode));
router.post('/financial-freeze', requireAdminRole('super-admin'), ...withValidation(toggleFinancialFreezeValidation, toggleFinancialFreeze));

router.get('/audit-log', requirePermissions('audit:read'), ...withValidation(getAuditLogValidation, getAuditLog));
router.delete('/audit-log', requireAdminRole('super-admin'), ...withValidation(purgeOldAuditLogsValidation, purgeOldAuditLogs));

router.get('/admins', requireAdminRole('super-admin'), asyncHandler(listAdmins));
router.post('/admins', requireAdminRole('super-admin'), ...withValidation(createAdminValidation, createAdmin));

export default router;
