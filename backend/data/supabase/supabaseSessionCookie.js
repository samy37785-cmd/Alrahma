// Carries the LIVE, GoTrue-issued Supabase access token forward as its own
// cookie, separate from this backend's own signed admin_at/admin_rt tokens
// (see utils/adminAuthTokens.js). This exists for exactly one purpose: so
// that AAL2 proof for admin actions is read, per-request, from a signature-
// verified Supabase JWT's real `aal` claim — not cached inside our own app
// JWT at login time (which is what the Mongo-mode `mfaVerified` flag still
// is, and remains, for that backend only; see middleware/adminAuth.js).
//
// A GoTrue access token's signature is verified two ways, selected purely by
// which environment variables are set — never by trusting anything in the
// token itself:
//   - SUPABASE_JWT_SECRET set: legacy HS256 path (unchanged from before this
//     migration) — the project still uses a shared JWT secret.
//   - SUPABASE_JWT_SECRET unset: JWKS path — the project has moved to
//     asymmetric "JWT Signing Keys" (ES256/RS256). The public key set is
//     fetched from the project's own well-known JWKS endpoint
//     (SUPABASE_URL/auth/v1/.well-known/jwks.json) using jose's
//     createRemoteJWKSet, which selects the right key by the token's `kid`
//     header and caches/refreshes it internally — no manual JWT parsing.
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';

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

// Cached per SUPABASE_URL so the real HTTP JWKS fetch (itself cached/
// rate-limited internally by jose across kid lookups) happens at most once
// per distinct URL in this process, not on every request.
let cachedJwks = null;
let cachedJwksUrl = null;

function getRemoteJwks(supabaseUrl) {
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  if (!cachedJwks || cachedJwksUrl !== jwksUrl) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedJwksUrl = jwksUrl;
  }
  return cachedJwks;
}

function verifyLegacyHs256(rawToken, secret) {
  try {
    return jwt.verify(rawToken, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

async function verifyViaJwks(rawToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const { payload } = await jwtVerify(rawToken, getRemoteJwks(supabaseUrl), {
      // Supabase JWT Signing Keys projects sign with ES256 by default;
      // RS256 is also a supported asymmetric option. HS256 is deliberately
      // excluded here — this branch only runs when SUPABASE_JWT_SECRET is
      // unset, and admitting HS256 here would let a token whose header
      // merely claims HS256 be checked against a "secret" that doesn't
      // exist, which is the classic algorithm-confusion pitfall.
      algorithms: ['ES256', 'RS256'],
      issuer: `${supabaseUrl}/auth/v1`,
    });
    return payload;
  } catch {
    return null;
  }
}

// Verifies the raw Supabase access token's signature and returns its claims,
// or null if the token is missing, malformed, expired, signed with a
// different/unknown key, or carries the wrong issuer. Callers must
// additionally check `claims.sub === expectedId` and `claims.aal === 'aal2'`
// themselves — this function only proves the token is authentic and
// unexpired, not who it belongs to or its AAL. Any verification failure —
// JWKS unreachable, unknown kid, bad signature, wrong issuer, expired token —
// resolves to null here, never throws past this function, so callers always
// fail closed.
export async function verifySupabaseToken(rawToken) {
  if (!rawToken) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) return verifyLegacyHs256(rawToken, secret);
  return verifyViaJwks(rawToken);
}

// The one predicate every AAL2-gated admin code path should call: true only
// if `rawToken` is an authentic, unexpired Supabase access token, issued to
// exactly `expectedUserId`, carrying a real `aal: "aal2"` claim from GoTrue.
export async function isVerifiedAal2(rawToken, expectedUserId) {
  const claims = await verifySupabaseToken(rawToken);
  if (!claims) return false;
  return claims.sub === String(expectedUserId) && claims.aal === 'aal2';
}
