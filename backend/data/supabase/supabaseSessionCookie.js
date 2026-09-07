// Carries the LIVE, GoTrue-issued Supabase access token forward as its own
// cookie, separate from this backend's own signed admin_at/admin_rt tokens
// (see utils/adminAuthTokens.js). This exists for exactly one purpose: so
// that AAL2 proof for admin actions is read, per-request, from a signature-
// verified Supabase JWT's real `aal` claim — not cached inside our own app
// JWT at login time (which is what the Mongo-mode `mfaVerified` flag still
// is, and remains, for that backend only; see middleware/adminAuth.js).
//
// A GoTrue access token's signature is verified here with the project's own
// JWT secret (HS256 — the default for self-hosted/local Supabase and most
// existing projects). If a given Supabase project has been switched to
// asymmetric JWT signing keys (ES256/RS256, newer "JWT Signing Keys"
// projects), this HS256 verification would need to be replaced with a JWKS
// lookup — flagged here explicitly rather than silently mismatching.
import jwt from 'jsonwebtoken';

export const SUPABASE_AT_COOKIE = 'admin_sat';

export function supabaseAtCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
    path: '/api/v1/admin',
  };
}

// Verifies the raw Supabase access token's signature and returns its claims,
// or null if the token is missing, malformed, expired, or signed with a
// different key. Callers must additionally check `claims.sub === expectedId`
// and `claims.aal === 'aal2'` themselves — this function only proves the
// token is authentic and unexpired, not who it belongs to or its AAL.
export function verifySupabaseToken(rawToken) {
  if (!rawToken) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(rawToken, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

// The one predicate every AAL2-gated admin code path should call: true only
// if `rawToken` is an authentic, unexpired Supabase access token, issued to
// exactly `expectedUserId`, carrying a real `aal: "aal2"` claim from GoTrue.
export function isVerifiedAal2(rawToken, expectedUserId) {
  const claims = verifySupabaseToken(rawToken);
  if (!claims) return false;
  return claims.sub === String(expectedUserId) && claims.aal === 'aal2';
}
