import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import {
  getSystemStatus,
  toggleMaintenanceMode,
  toggleFinancialFreeze,
  getAuditLog,
  purgeOldAuditLogs,
  listAdmins,
  createAdmin,
} from '../../../controllers/systemController.js';
import {
  toggleMaintenanceModeValidation,
  toggleFinancialFreezeValidation,
  getAuditLogValidation,
  purgeOldAuditLogsValidation,
  createAdminValidation,
} from '../../../validators/systemValidators.js';

const router = Router();

// System status — any authenticated admin can read
router.get('/status',              asyncHandler(getSystemStatus));

// Maintenance mode toggle — super-admin only
router.post(
  '/maintenance',
  requireAdminRole('super-admin'),
  toggleMaintenanceModeValidation,
  asyncHandler(toggleMaintenanceMode)
);

// Financial freeze toggle — super-admin only
router.post(
  '/financial-freeze',
  requireAdminRole('super-admin'),
  toggleFinancialFreezeValidation,
  asyncHandler(toggleFinancialFreeze)
);

// Audit log read — requires audit:read permission
router.get(
  '/audit-log',
  requirePermissions('audit:read'),
  getAuditLogValidation,
  asyncHandler(getAuditLog)
);

// Audit log GDPR purge — super-admin only
router.delete(
  '/audit-log',
  requireAdminRole('super-admin'),
  purgeOldAuditLogsValidation,
  asyncHandler(purgeOldAuditLogs)
);

// Admin account management — super-admin only
router.get(
  '/admins',
  requireAdminRole('super-admin'),
  asyncHandler(listAdmins)
);

router.post(
  '/admins',
  requireAdminRole('super-admin'),
  createAdminValidation,
  asyncHandler(createAdmin)
);

export default router;
