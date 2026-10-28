import { computeSignature, hashBody, isValidSigningSecret } from './adminProxySigning.mjs';

/**
 * Vercel-side half of the signed Vercel → Render hop for the two public form
 * endpoints (POST /api/trials, POST /api/enrollments). See
 * docs/public-proxy-signing-runbook.md.
 *
 * Why: through the plain vercel.json external rewrite, Render sees Vercel's
 * outbound address as req.ip, so every visitor shares one rate-limit budget.
 * The form proxy Functions sign the real client IP (from Vercel's own
 * edge-set x-forwarded-for) so the backend can key its limiters per visitor
 * without widening `trust proxy`.
 *
 * Same canonical string and HMAC as the admin proxy (computeSignature), but
 * its own headers and its own secret, PUBLIC_PROXY_SIGNING_SECRET — never
 * the admin one, so neither can stand in for the other. The backend half is
 * backend/config/publicProxySigning.js; change both together.
 */

export const PUBLIC_SIGNATURE_HEADER = 'x-public-proxy-signature';
export const PUBLIC_TIMESTAMP_HEADER = 'x-public-proxy-timestamp';
export const PUBLIC_CLIENT_IP_HEADER = 'x-public-proxy-ip';

/**
 * Returns the three x-public-proxy-* headers, or null (add nothing) when
 * secretHex is missing/invalid. Null means "forward unsigned", never an
 * error: the backend then keys on req.ip exactly as before.
 */
export function buildPublicSignedHeaders({ secretHex, method, path, query = '', clientIp, rawBody }) {
  if (!isValidSigningSecret(secretHex) || !clientIp) return null;
  const secretBuf = Buffer.from(secretHex, 'hex');
  const timestamp = Date.now();
  const signature = computeSignature(secretBuf, { method, path, query, clientIp, timestamp, bodyHash: hashBody(rawBody) });
  return {
    [PUBLIC_CLIENT_IP_HEADER]: clientIp,
    [PUBLIC_TIMESTAMP_HEADER]: String(timestamp),
    [PUBLIC_SIGNATURE_HEADER]: signature,
  };
}
