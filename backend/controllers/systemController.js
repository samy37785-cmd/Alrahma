import SystemConfig   from '../models/SystemConfig.js';
import SystemAuditLog from '../models/SystemAuditLog.js';
import AdminUser      from '../models/AdminUser.js';
import { anonymizeIp } from '../config/encryption.js';
import { body, query, validationResult } from 'express-validator';

// ── Helpers ──────────────────────────────────────────────────────────────────
function validationErrors(req, res) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    res.status(422).json({ errors: errs.array() });
    return true;
  }
  return false;
}

async function writeAuditLog(req, action, before, after, severity = 'warning') {
  await SystemAuditLog.create({
    adminId:    req.adminId,
    adminEmail: req.adminUser.email,
    action,
    resource:   'SystemConfig',
    resourceId: null,
    before,
    after,
    severity,
    userAgent:  req.headers['user-agent'] ?? null,
    ipAnon:     anonymizeIp(req.ip ?? ''),
  });
}

// ── GET /api/v1/admin/system/status ──────────────────────────────────────────
export async function getSystemStatus(req, res) {
  const [maintenanceMode, financialsFrozen] = await Promise.all([
    SystemConfig.get('maintenance_mode', 'false'),
    SystemConfig.get('financials_frozen', 'false'),
  ]);

  return res.json({
    maintenanceMode:  maintenanceMode === 'true',
    financialsFrozen: financialsFrozen === 'true',
    timestamp:        new Date().toISOString(),
  });
}

// ── POST /api/v1/admin/system/maintenance ────────────────────────────────────
export const toggleMaintenanceModeValidation = [
  body('enable').isBoolean().withMessage('enable must be a boolean'),
];

export async function toggleMaintenanceMode(req, res) {
  if (validationErrors(req, res)) return;

  const { enable } = req.body;
  const before = await SystemConfig.get('maintenance_mode', 'false');

  await SystemConfig.set('maintenance_mode', String(enable), {
    updatedBy:   req.adminId,
    description: 'System maintenance mode flag',
  });

  await writeAuditLog(
    req,
    enable ? 'system.maintenance_enabled' : 'system.maintenance_disabled',
    { maintenance_mode: before },
    { maintenance_mode: String(enable) },
    'critical'
  );

  return res.json({
    message:         `Maintenance mode ${enable ? 'enabled' : 'disabled'}`,
    maintenanceMode: enable,
  });
}

// ── POST /api/v1/admin/system/financial-freeze ───────────────────────────────
export const toggleFinancialFreezeValidation = [
  body('enable').isBoolean().withMessage('enable must be a boolean'),
];

export async function toggleFinancialFreeze(req, res) {
  if (validationErrors(req, res)) return;

  const { enable } = req.body;
  const before = await SystemConfig.get('financials_frozen', 'false');

  await SystemConfig.set('financials_frozen', String(enable), {
    updatedBy:   req.adminId,
    description: 'Financial operations freeze flag',
  });

  await writeAuditLog(
    req,
    enable ? 'system.financials_frozen' : 'system.financials_unfrozen',
    { financials_frozen: before },
    { financials_frozen: String(enable) },
    'critical'
  );

  return res.json({
    message:          `Financial operations ${enable ? 'frozen' : 'unfrozen'}`,
    financialsFrozen: enable,
  });
}

// ── GET /api/v1/admin/system/audit-log ───────────────────────────────────────
export const getAuditLogValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('severity').optional().isIn(['info', 'warning', 'critical']),
  query('resource').optional().isString(),
  query('adminId').optional().isMongoId(),
];

export async function getAuditLog(req, res) {
  if (validationErrors(req, res)) return;

  const page  = Math.max(1, parseInt(req.query.page  ?? 1,  10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? 50, 10)));
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.resource) filter.resource = req.query.resource;
  if (req.query.adminId)  filter.adminId  = req.query.adminId;

  // Date range filtering
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
  }

  const [data, total] = await Promise.all([
    SystemAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    SystemAuditLog.countDocuments(filter),
  ]);

  return res.json({ data, total, page, pages: Math.ceil(total / limit) });
}

// ── DELETE /api/v1/admin/system/audit-log ────────────────────────────────────
/**
 * GDPR Article 17 purge: removes audit logs older than N days.
 * Default: 365 days. Minimum enforced: 90 days (legal minimum retention).
 * Super-admin only (enforced in route via requireAdminRole).
 */
export const purgeOldAuditLogsValidation = [
  body('olderThanDays')
    .optional()
    .isInt({ min: 90 })
    .withMessage('olderThanDays must be an integer ≥ 90'),
];

export async function purgeOldAuditLogs(req, res) {
  if (validationErrors(req, res)) return;

  const days   = parseInt(req.body.olderThanDays ?? 365, 10);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await SystemAuditLog.deleteMany({ createdAt: { $lt: cutoff } });

  // Write an audit entry for the purge itself (must use critical severity)
  await SystemAuditLog.create({
    adminId:    req.adminId,
    adminEmail: req.adminUser.email,
    action:     'system.audit_purge',
    resource:   'SystemAuditLog',
    resourceId: null,
    before:     null,
    after:      { purgedCount: result.deletedCount, olderThanDays: days, cutoff },
    severity:   'critical',
    userAgent:  req.headers['user-agent'] ?? null,
    ipAnon:     anonymizeIp(req.ip ?? ''),
    metadata:   { purgedCount: result.deletedCount },
  });

  return res.json({
    message:      `Purged ${result.deletedCount} audit log entries older than ${days} days`,
    purgedCount:  result.deletedCount,
    cutoff:       cutoff.toISOString(),
  });
}

// ── GET /api/v1/admin/system/admins ──────────────────────────────────────────
/**
 * Lists all admin accounts. Super-admin only.
 */
export async function listAdmins(req, res) {
  const admins = await AdminUser.find()
    .select('-password -_mfaSecret -_mfaPendingSecret')
    .sort({ createdAt: -1 });
  return res.json({ data: admins, total: admins.length });
}

// ── POST /api/v1/admin/system/admins ─────────────────────────────────────────
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

export async function createAdmin(req, res) {
  if (validationErrors(req, res)) return;

  const { name, email, password, role } = req.body;

  const existing = await AdminUser.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: 'An admin with this email already exists' });
  }

  const admin = await AdminUser.create({ name, email, password, role });

  await SystemAuditLog.create({
    adminId:    req.adminId,
    adminEmail: req.adminUser.email,
    action:     'system.admin_created',
    resource:   'AdminUser',
    resourceId: String(admin._id),
    before:     null,
    after:      { name: admin.name, email: admin.email, role: admin.role },
    severity:   'critical',
    userAgent:  req.headers['user-agent'] ?? null,
    ipAnon:     anonymizeIp(req.ip ?? ''),
  });

  return res.status(201).json({
    id:    String(admin._id),
    name:  admin.name,
    email: admin.email,
    role:  admin.role,
  });
}
