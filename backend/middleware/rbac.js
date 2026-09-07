import { isSupabaseBackend } from '../config/dataBackend.js';

/**
 * Role-Based Access Control middleware for admin routes.
 * Both helpers assume verifyAccessToken has already run (req.adminUser is set).
 */

// Mongo's req.adminUser is a Mongoose AdminUser document with its own
// hasPermission() method (role + individual grants baked into the schema).
// Supabase mode has no such document — verifyAccessToken() instead attaches
// a flat req.adminPermissions array (role_permissions + user_extra_permissions,
// or the literal '*' for super-admin) computed via getAdminPermissions(). Both
// paths express the exact same "holds ALL of these permissions" check, just
// against a different data shape.
function hasAllPermissions(req, perms) {
  if (isSupabaseBackend()) {
    const granted = req.adminPermissions ?? [];
    if (granted.includes('*')) return true;
    return perms.every((p) => granted.includes(p));
  }
  return req.adminUser.hasPermission(...perms);
}

/**
 * requirePermissions(...perms)
 * Passes if the authenticated admin holds ALL listed permissions.
 */
export function requirePermissions(...perms) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!hasAllPermissions(req, perms)) {
      return res.status(403).json({
        message:  'Insufficient permissions',
        required: perms,
      });
    }
    next();
  };
}

/**
 * requireAdminRole(...roles)
 * Passes if the authenticated admin's role is one of the listed roles.
 * For coarse guards (e.g. super-admin only endpoints).
 */
export function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.adminUser.role)) {
      return res.status(403).json({
        message:  'Insufficient role',
        required: roles,
      });
    }
    next();
  };
}
