import SystemConfig from '../models/SystemConfig.js';
import { isSupabaseBackend } from '../config/dataBackend.js';
import { withServiceRole } from '../data/supabase/client.js';

// system_config (lib/db/drizzle/0012) is a plain key/value table — the Mongo
// model's AES-encryption option has no counterpart there (see 0012's header
// comment: only plain boolean flags like these two are ever actually used,
// so encryption support was deliberately not replicated).
async function getSystemConfig(key, defaultValue) {
  if (!isSupabaseBackend()) return SystemConfig.get(key, defaultValue);
  return withServiceRole(async (client) => {
    const r = await client.query('SELECT value FROM system_config WHERE key = $1', [key]);
    return r.rows[0]?.value ?? defaultValue;
  });
}

/**
 * maintenanceGuard
 * Blocks all non-super-admin requests when maintenance_mode is "true" in SystemConfig.
 * Super-admins bypass so they can perform maintenance work while the site is locked.
 */
export async function maintenanceGuard(req, res, next) {
  const maintenanceOn = await getSystemConfig('maintenance_mode', 'false');
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

  const frozen = await getSystemConfig('financials_frozen', 'false');
  if (frozen !== 'true') return next();

  if (req.adminUser?.role === 'super-admin') return next();

  return res.status(423).json({
    message: 'Financial operations are currently frozen. Contact the super-admin to lift the freeze.',
    code:    'FINANCIALS_FROZEN',
  });
}
