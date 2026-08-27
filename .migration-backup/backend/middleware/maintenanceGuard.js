import SystemConfig from '../models/SystemConfig.js';

/**
 * maintenanceGuard
 * Blocks all non-super-admin requests when maintenance_mode is "true" in SystemConfig.
 * Super-admins bypass so they can perform maintenance work while the site is locked.
 */
export async function maintenanceGuard(req, res, next) {
  const maintenanceOn = await SystemConfig.get('maintenance_mode', 'false');
  if (maintenanceOn !== 'true') return next();

  // Super-admin bypasses maintenance mode
  if (req.adminUser?.role === 'super-admin') return next();

  return res.status(503).json({
    message: 'The system is currently under maintenance. Please try again later.',
    code:    'MAINTENANCE_MODE',
  });
}

/**
 * financialGuard
 * Blocks financial write operations when financials_frozen is "true" in SystemConfig.
 * Only super-admin can proceed (e.g., to issue emergency refunds).
 */
export async function financialGuard(req, res, next) {
  // Only freeze mutating requests (GET audits are fine)
  if (req.method === 'GET') return next();

  const frozen = await SystemConfig.get('financials_frozen', 'false');
  if (frozen !== 'true') return next();

  if (req.adminUser?.role === 'super-admin') return next();

  return res.status(423).json({
    message: 'Financial operations are currently frozen. Contact the super-admin to lift the freeze.',
    code:    'FINANCIALS_FROZEN',
  });
}
