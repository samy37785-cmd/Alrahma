import jwt from 'jsonwebtoken';

export const ACCESS_TOKEN_COOKIE  = 'admin_at';
export const REFRESH_TOKEN_COOKIE = 'admin_rt';

// Access token: short-lived (15 min), scoped to /api/v1/admin path
export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   15 * 60 * 1000,
    path:     '/api/v1/admin',
  };
}

// Refresh token: longer-lived (7 days), path-restricted to the admin auth
// subtree (login/mfa/refresh/logout) — NOT the whole /api/v1/admin API.
// Review follow-up: this used to be scoped to /api/v1/admin/auth/refresh
// only, meaning a real browser NEVER sent it on a request to /auth/logout —
// which in turn meant an admin whose short-lived admin_at (15 min) had
// already expired had no way left to reach a working logout at all (see
// routes/v1/admin/authRoutes.js's /logout route and this cookie's own
// consumers in controllers/adminAuthController.js's logout()). Widening the
// Path to cover /auth (not just /auth/refresh) is what actually closes
// that gap: admin_rt now also reaches /auth/logout, where it can identify
// and revoke its own session's family without needing a still-valid
// admin_at at all. Deliberately stops at /auth, not /api/v1/admin — this
// token must never be sent on requests to any other admin route.
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     '/api/v1/admin/auth',
  };
}

// Review follow-up (Path-migration): refreshCookieOptions() above used to
// scope admin_rt to this exact, narrower path. A real browser that
// authenticated before this change is still holding a cookie stored under
// THIS path — the server changing what it sets going forward does nothing
// to a cookie a browser already has; only an explicit clearing Set-Cookie
// with THIS SAME path removes it. Left unaddressed, that stale cookie would
// coexist forever alongside the new, wider-Path one: both would be sent
// together on every request to /auth/refresh (the one place their Paths
// overlap), and which same-named cookie a server-side parser exposes when
// two arrive together is unspecified/implementation-dependent — exactly the
// kind of shadowing bug that must never be left to chance for a credential
// cookie. clearLegacyRefreshCookie() is called everywhere admin_rt is set
// or cleared (login's MFA-completion steps, refresh, logout) so every
// legacy cookie gets proactively wiped out the very next time its holder
// touches any admin-auth endpoint, regardless of whether that legacy cookie
// was even sent on this particular request.
export const LEGACY_REFRESH_TOKEN_COOKIE_PATH = '/api/v1/admin/auth/refresh';

export function clearLegacyRefreshCookie(res) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: LEGACY_REFRESH_TOKEN_COOKIE_PATH });
}

export function signAccessToken(adminId, role, mfaVerified = false) {
  return jwt.sign(
    { id: String(adminId), role, mfaVerified },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}
