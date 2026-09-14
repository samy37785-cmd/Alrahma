import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import logger from '../config/logger.js';
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
});

// Review follow-up: an earlier version of identifyAdminForLogout() below
// trusted an expired-but-signature-valid admin_at UNCONDITIONALLY, for
// however long its signature stayed valid — effectively forever, since
// this codebase never rotates ADMIN_JWT_ACCESS_SECRET on its own. That
// meant a JWT an admin's browser discarded weeks or months ago (recovered
// from a disk image, an old log line, browser history, wherever) could
// still be replayed against /logout to revoke every one of that admin's
// CURRENT sessions, indefinitely into the future — using nothing but a
// credential that should have been worthless the moment it expired. A
// short, bounded grace window keeps the real, legitimate case this exists
// for (admin_at quietly lapsing while an admin's tab sits idle for a few
// minutes before they click logout — see identifyAdminForLogout()'s own
// comment) working, while refusing to trust anything older than that for
// an action (revoke every session) this destructive. Chosen at 2 minutes
// past admin_at's own 15-minute `exp`: generous enough for real network/
// processing latency and a bit of clock skew, nowhere near long enough for
// a genuinely stale, previously-discarded token to still work.
const LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS = 2 * 60;

/**
 * Review follow-up: /logout used to sit behind verifyAccessToken like every
 * other protected route, which is correct for privileged actions but wrong
 * for logout specifically — once admin_at (15 min) lapsed, verifyAccessToken
 * returned a flat 401 before the request ever reached the controller, so
 * there was no way left to trigger a real server-side logout at all. An
 * admin_rt-based revoke (see controllers/adminAuthController.js's logout())
 * existed the whole time but was unreachable behind this gate.
 *
 * This middleware never rejects the request — logout must always be
 * reachable. It resolves req.adminId/req.adminUser best-effort, including
 * from a token whose signature is still valid but whose `exp` has already
 * passed (`ignoreExpiration: true` below) — but ONLY within
 * LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS of that `exp` (see its own comment for
 * why an unbounded version of this is a real vulnerability, not just a
 * theoretical one). Leaves req.adminId/req.adminUser unset (never a 401)
 * when the cookie is missing, malformed, signed with the wrong secret,
 * belongs to a pre-auth (`stage`) token that was never a completed session,
 * or is expired well past the grace window — the route's own admin_rt-based
 * identity (now reachable here too, see utils/adminAuthTokens.js's
 * refreshCookieOptions()) or a plain nothing-to-revoke/clear-cookies-anyway
 * no-op takes over in that case.
 */
export const identifyAdminForLogout = asyncHandler(async function identifyAdminForLogout(req, res, next) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return next();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name !== 'TokenExpiredError') return next(); // invalid/malformed/wrong secret: proceed anonymously
    try {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
    } catch {
      return next();
    }
    // Bound how long "expired" is tolerated for logout identification — see
    // LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS's own comment. `exp` is a standard
    // JWT claim (seconds since epoch); jwt.verify() still validates/decodes
    // it normally with ignoreExpiration — that option only skips the
    // rejection, not the claim itself.
    if (typeof decoded.exp === 'number' && Date.now() / 1000 - decoded.exp > LOGOUT_EXPIRED_TOKEN_GRACE_SECONDS) {
      return next();
    }
  }

  if (decoded.stage) return next(); // pre-auth (MFA-incomplete) token never identifies a real session

  // Review follow-up: this used to call loadAdminForBackend() unguarded —
  // fine for verifyAccessToken() above (a genuine DB/lookup failure SHOULD
  // 500 an ordinary protected route via asyncHandler's next(err)), but wrong
  // here. identifyAdminForLogout() exists specifically so /logout stays
  // reachable no matter what (see this function's own opening comment); an
  // AdminUser.findById()/loadAdminById() throw (Mongo unreachable, a
  // dropped connection mid-request, Postgres unreachable) used to propagate
  // straight through asyncHandler to the central error handler, which
  // responded before the request ever reached the logout controller at
  // all — an admin hitting logout during exactly the kind of outage that
  // makes "am I still logged in" matter most would get a 500 and keep every
  // cookie in their browser. This lookup is now best-effort: any failure is
  // logged and treated the same as "no admin found" (req.adminId/
  // req.adminUser simply stay unset), and the request always reaches the
  // controller, which clears this app's own cookies unconditionally
  // (controllers/adminAuthController.js and data/supabase/
  // adminAuthController.js's logout() both do this in a `finally`) and, for
  // the Mongo path, still identifies the session by admin_rt when admin_id
  // lookup fails here. This does not widen what any OTHER route accepts —
  // verifyAccessToken() (used by every route this middleware is not) is
  // untouched and still fails closed on a lookup error.
  let loaded;
  try {
    loaded = await loadAdminForBackend(decoded.id);
  } catch (err) {
    logger.error('identifyAdminForLogout: admin lookup failed — proceeding without an identified admin so /logout still runs', {
      error: err.message,
    });
    return next();
  }
  if (!loaded) return next();

  req.adminUser = loaded.admin;
  req.adminId   = isSupabaseBackend() ? loaded.admin.id : loaded.admin._id;
  next();
});
