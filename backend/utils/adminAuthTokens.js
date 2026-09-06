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

// Refresh token: longer-lived (7 days), path-restricted to the refresh endpoint only
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     '/api/v1/admin/auth/refresh',
  };
}

export function signAccessToken(adminId, role, mfaVerified = false) {
  return jwt.sign(
    { id: String(adminId), role, mfaVerified },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}
