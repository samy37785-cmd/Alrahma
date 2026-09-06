import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import { isSupabaseBackend } from '../config/dataBackend.js';
import { loadAdminById, hasVerifiedMfaFactor } from '../data/supabase/loadAdmin.js';
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

// The admin_at JWT itself (secret, shape, expiry) is identical under both
// backends — only how an admin is looked up and how "MFA enabled" is
// determined differs (see data/supabase/loadAdmin.js's module comment for
// the full mapping). This mirrors the same shared-middleware/branch-on-
// backend pattern middleware/auth.js already uses for the customer-facing
// protect().
async function loadAdminForBackend(id) {
  if (isSupabaseBackend()) {
    const admin = await loadAdminById(id);
    if (!admin) return null;
    return { admin, mfaEnabled: await hasVerifiedMfaFactor(id) };
  }
  const admin = await AdminUser.findById(id);
  if (!admin || !admin.isActive) return null;
  return { admin, mfaEnabled: admin.mfaEnabled };
}

/**
 * Verifies the admin access token cookie.
 * Rejects pre-auth tokens (stage field present).
 * Rejects tokens where MFA is enabled but not verified.
 * Attaches req.adminUser + req.adminId on success. Under DATA_BACKEND=
 * supabase, also attaches req.adminAal ('aal2' | undefined) — the genuine,
 * GoTrue-verified assurance-level claim that data/supabase adapter functions
 * must forward into withUserContext(..., { aal }) for AAL2-gated RLS/RPCs.
 * See data/supabase/client.js's module-level SECURITY RULE for why no other
 * code path may ever set that claim.
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

  const loaded = await loadAdminForBackend(decoded.id);
  if (!loaded) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  // MFA enabled but not verified in this token
  if (loaded.mfaEnabled && !decoded.mfaVerified) {
    return res.status(403).json({
      message: '2FA verification required',
      code:    'MFA_REQUIRED',
    });
  }

  req.adminUser = loaded.admin;
  req.adminId   = isSupabaseBackend() ? loaded.admin.id : loaded.admin._id;
  if (isSupabaseBackend()) {
    req.adminAal = decoded.mfaVerified ? 'aal2' : undefined;
  }
  next();
}
