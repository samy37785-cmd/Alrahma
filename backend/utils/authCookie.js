// Shared auth-cookie contract, extracted from controllers/authController.js
// so both the MongoDB and Supabase-adapter auth controllers issue byte-
// identical cookies — DATA_BACKEND must never be able to change what the
// frontend receives.
import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'token';

// `v` (tokenVersion) is embedded so protect() can reject tokens issued before
// a password change without a DB call per-request.
export function signToken(id, role, v = 0) {
  return jwt.sign({ id, role, v }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Cookie lifetime must always match the JWT's real expiry. Rather than
// re-parsing JWT_EXPIRES_IN ourselves, decode the token's own exp/iat claims.
export function cookieMaxAgeFor(token) {
  const { exp, iat } = jwt.decode(token);
  return (exp - iat) * 1000;
}

// httpOnly = JS can't read it (XSS can't steal it); sameSite=lax = the
// browser won't send it on cross-site POSTs (CSRF protection); secure =
// HTTPS-only in production.
export function authCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  };
}

// Issues the auth cookie and returns the public user profile (no token in the body).
export function sendAuth(res, user, status = 200) {
  const token = signToken(user._id, user.role, user.tokenVersion ?? 0);
  res.cookie(AUTH_COOKIE, token, authCookieOptions(cookieMaxAgeFor(token)));
  return res.status(status).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
