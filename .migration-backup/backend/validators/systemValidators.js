import { body, query } from 'express-validator';

// POST /api/v1/admin/system/maintenance
export const toggleMaintenanceModeValidation = [
  body('enable').isBoolean().withMessage('enable must be a boolean'),
];

// POST /api/v1/admin/system/financial-freeze
export const toggleFinancialFreezeValidation = [
  body('enable').isBoolean().withMessage('enable must be a boolean'),
];

// GET /api/v1/admin/system/audit-log
export const getAuditLogValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('severity').optional().isIn(['info', 'warning', 'critical']),
  query('resource').optional().isString(),
  query('adminId').optional().isMongoId(),
];

// POST /api/v1/admin/system/audit-log/purge — GDPR Article 17 purge.
// Minimum enforced: 90 days (legal minimum retention).
export const purgeOldAuditLogsValidation = [
  body('olderThanDays')
    .optional()
    .isInt({ min: 90 })
    .withMessage('olderThanDays must be an integer ≥ 90'),
];

// POST /api/v1/admin/system/admins
export const createAdminValidation = [
  body('name').isString().trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isString()
    .isLength({ min: 12, max: 72 })
    .withMessage('Password must be 12–72 characters'),
  body('role')
    .optional()
    .isIn(['super-admin', 'admin', 'editor', 'viewer'])
    .withMessage('Invalid role'),
];
