import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import { isSupabaseBackend } from '../config/dataBackend.js';
import { loadAdminById, hasVerifiedMfaFactor, getAdminPermissions } from '../data/supabase/loadAdmin.js';
import { SUPABASE_AT_COOKIE, isVerifiedAal2 } from '../data/supabase/supabaseSessionCookie.js';
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
 * supabase, also attaches req.adminAal ('aal2' | undefined) — computed FRESH
 * on every request by re-verifying the admin_sat cookie's signature against
 * SUPABASE_JWT_SECRET and reading its real `aal` claim directly (see
 * data/supabase/supabaseSessionCookie.js). This is NOT read from admin_at's
 * own `mfaVerified` field under this backend — that field is only ever
 * informational here (mirrors the Mongo-mode token shape) — because a value
 * cached once at login time is exactly the kind of stale, self-asserted
 * signal that could outlive the thing it claims to prove. Mongo mode has no
 * external identity provider to re-check against, so it keeps using
 * decoded.mfaVerified as before — unchanged, still the legitimate source of
 * truth for that backend. data/supabase adapter functions must forward
 * req.adminAal into withUserContext(..., { aal }) for AAL2-gated RLS/RPCs —
 * see data/supabase/client.js's module-level SECURITY RULE.
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

  const supabase = isSupabaseBackend();
  const verifiedAal2 = supabase
    ? isVerifiedAal2(req.cookies?.[SUPABASE_AT_COOKIE], decoded.id)
    : false;

  // MFA enabled but not verified in this token/session
  const mfaVerifiedThisSession = supabase ? verifiedAal2 : !!decoded.mfaVerified;
  if (loaded.mfaEnabled && !mfaVerifiedThisSession) {
    return res.status(403).json({
      message: '2FA verification required',
      code:    'MFA_REQUIRED',
    });
  }

  req.adminUser = loaded.admin;
  req.adminId   = supabase ? loaded.admin.id : loaded.admin._id;
  if (supabase) {
    req.adminAal = verifiedAal2 ? 'aal2' : undefined;
    // req.adminUser here is a plain row from loadAdminById() — it has no
    // .hasPermission() method the way the Mongoose AdminUser document does,
    // so middleware/rbac.js's requirePermissions() reads this flat list
    // instead, under this backend only. Computed once per request rather
    // than per requirePermissions() call.
    req.adminPermissions = await getAdminPermissions(loaded.admin.id, loaded.admin.role);
  }
  next();
}
