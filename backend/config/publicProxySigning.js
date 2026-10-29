import crypto from 'crypto';
import { computeSignature, hashBody } from './adminProxySigning.js';

/**
 * HMAC verification for the signed Vercel → Render hop of the two public form
 * endpoints (api/v1/trials-proxy.mjs and api/v1/enrollments-proxy.mjs, reached
 * by the exact-literal /api/trials and /api/enrollments rewrites in
 * vercel.json). See docs/public-proxy-signing-runbook.md.
 *
 * Why: every other /api/* call reaches Render through Vercel's external
 * rewrite, so req.ip is Vercel's outbound address and all visitors share one
 * rate-limit budget. A valid signature lets the limiters key on the visitor's
 * real IP without widening `trust proxy` (which would let anyone calling the
 * raw Render host forge X-Forwarded-For).
 *
 * Same canonical string and HMAC as the admin proxy (computeSignature), with
 * its own headers and its own secret, FORM_PROXY_SIGNING_SECRET: never
 * ADMIN_PROXY_SIGNING_SECRET, so neither proxy's signature is accepted by the
 * other. The Vercel half is api/_lib/publicProxySigning.mjs; change both
 * together.
 */

export const PUBLIC_SIGNATURE_HEADER = 'x-public-proxy-signature';
export const PUBLIC_TIMESTAMP_HEADER = 'x-public-proxy-timestamp';
export const PUBLIC_CLIENT_IP_HEADER = 'x-public-proxy-ip';
export const PUBLIC_PROXY_HEADERS = [PUBLIC_CLIENT_IP_HEADER, PUBLIC_TIMESTAMP_HEADER, PUBLIC_SIGNATURE_HEADER];

// Wider than the admin proxy's 30 s: Render's free instance can take most of
// a minute to wake, and the Function signs before that wait. A replay inside
// the window needs the Vercel→Render TLS traffic and can only repeat the same
// body for the same visitor.
export const PUBLIC_MAX_SKEW_MS = 120_000;

const HEX_SECRET_RE = /^[0-9a-fA-F]{32,}$/;

function getPublicSigningSecret() {
  const hex = process.env.FORM_PROXY_SIGNING_SECRET;
  return hex && HEX_SECRET_RE.test(hex) ? Buffer.from(hex, 'hex') : null;
}

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Never throws. Returns { ok: true, clientIp } only for a fully valid
 * signature; otherwise { ok: false, reason } with a short reason code (never
 * the IP, signature, body or secret), safe to log.
 */
export function verifyPublicProxySignature({ headers, method, path, query = '', rawBody, now = Date.now() }) {
  const secret = getPublicSigningSecret();
  if (!secret) return { ok: false, reason: 'secret_unavailable' };

  const clientIp = headers[PUBLIC_CLIENT_IP_HEADER];
  const timestamp = headers[PUBLIC_TIMESTAMP_HEADER];
  const signature = headers[PUBLIC_SIGNATURE_HEADER];
  if (!clientIp || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs(now - ts) > PUBLIC_MAX_SKEW_MS) return { ok: false, reason: 'timestamp_out_of_range' };

  const expected = computeSignature({ secret, method, path, query, clientIp, timestamp, bodyHash: hashBody(rawBody) });
  if (!timingSafeHexEqual(signature, expected)) return { ok: false, reason: 'signature_mismatch' };

  return { ok: true, clientIp };
}
