import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import { isSupabaseBackend } from '../config/dataBackend.js';
import { loadAdminById, hasVerifiedMfaFactor, getAdminPermissions } from '../data/supabase/loadAdmin.js';
import { SUPABASE_AT_COOKIE, isVerifiedAal2 } from '../data/supabase/supabaseSessionCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
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
 * on every request by re-verifying the admin_sat cookie's signature (against
 * SUPABASE_JWT_SECRET if set, otherwise via the project's JWKS endpoint) and
 * reading its real `aal` claim directly (see
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
 *
 * Wrapped in asyncHandler: this is async Express 4 middleware, and Express
 * 4 does NOT forward a rejected promise from middleware to the error
 * handler on its own — an uncaught throw here (e.g. a database error from
 * loadAdminForBackend) would otherwise hang the request forever (neither
 * next() nor a response ever called) instead of failing with a real error
 * status. Found by actually running an admin-router HTTP request against
 * the local rehearsal harness for the first time (Al-Rahma Final
 * Corrections Part A) — a real permission gap in that harness (see
 * lib/db/test/local-harness.mjs) made loadAdminById() throw, and the
 * request hung silently rather than surfacing the error.
 */
export const verifyAccessToken = asyncHandler(async function verifyAccessToken(req, res, next) {
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
    ? await isVerifiedAal2(req.cookies?.[SUPABASE_AT_COOKIE], decoded.id)
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
});

// How long after its expiry an access token still identifies the admin for
// logout: the refresh token's own lifetime (refreshCookieOptions), since a
// session can be resumed for that long.
const LOGOUT_GRACE_SECONDS = 7 * 24 * 60 * 60;

/**
 * For POST /auth/logout only. Logout has to work after the 15-minute access
 * token has expired: the refresh cookie is path-scoped to /auth/refresh, so
 * the access token is the only thing that names the admin on this request,
 * and verifyAccessToken would answer 401 and leave the 7-day refresh family
 * alive. A token with a valid signature is therefore accepted here even
 * when expired (within LOGOUT_GRACE_SECONDS), because logging out only ever
 * takes access away. Never rejects: with no usable token, logout still
 * clears the cookies.
 */
export const identifyAdminForLogout = asyncHandler(async function identifyAdminForLogout(req, res, next) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (token) {
    let decoded = null;
    try {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    } catch {
      decoded = null;
    }
    const expiredTooLongAgo = decoded?.exp && Date.now() / 1000 - decoded.exp > LOGOUT_GRACE_SECONDS;
    if (decoded && !decoded.stage && !expiredTooLongAgo) {
      const loaded = await loadAdminForBackend(decoded.id);
      if (loaded) {
        req.adminUser = loaded.admin;
        req.adminId   = isSupabaseBackend() ? loaded.admin.id : loaded.admin._id;
      }
    }
  }
  next();
});
