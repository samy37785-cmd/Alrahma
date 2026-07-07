import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
} from '../utils/adminAuthTokens.js';

export {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
};

/**
 * Verifies the admin access token cookie.
 * Rejects pre-auth tokens (stage field present).
 * Rejects tokens where MFA is enabled but not verified.
 * Attaches req.adminUser + req.adminId on success.
 */
export async function verifyAccessToken(req, res, next) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return res.status(401).json({ message: 'Access token missing' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid access token' });
  }

  // Pre-auth tokens (MFA stages) carry a 'stage' field; block them from protected routes
  if (decoded.stage) {
    return res.status(403).json({
      message: 'Complete 2FA verification before accessing this resource',
      code:    'MFA_REQUIRED',
    });
  }

  const admin = await AdminUser.findById(decoded.id);
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  // MFA enabled but not verified in this token
  if (admin.mfaEnabled && !decoded.mfaVerified) {
    return res.status(403).json({
      message: '2FA verification required',
      code:    'MFA_REQUIRED',
    });
  }

  req.adminUser = admin;
  req.adminId   = admin._id;
  next();
}
