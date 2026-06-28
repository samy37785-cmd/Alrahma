import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';
import {
  getSystemStatus,
  toggleMaintenanceMode,   toggleMaintenanceModeValidation,
  toggleFinancialFreeze,   toggleFinancialFreezeValidation,
  getAuditLog,             getAuditLogValidation,
  purgeOldAuditLogs,       purgeOldAuditLogsValidation,
  listAdmins,
  createAdmin,             createAdminValidation,
} from '../../../controllers/systemController.js';

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
