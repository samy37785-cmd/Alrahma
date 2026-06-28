/**
 * Role-Based Access Control middleware for admin routes.
 * Both helpers assume verifyAccessToken has already run (req.adminUser is set).
 */

/**
 * requirePermissions(...perms)
 * Passes if the authenticated admin holds ALL listed permissions.
 */
export function requirePermissions(...perms) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.adminUser.hasPermission(...perms)) {
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
