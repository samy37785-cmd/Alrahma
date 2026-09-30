import crypto from 'node:crypto';

/**
 * Vercel-side half of the signed Vercel → Render admin proxy handshake.
 *
 * Deliberately NOT imported from backend/config/adminProxySigning.js: this
 * file ships inside a Vercel Function's own bundle (a different deploy
 * pipeline, different runtime, different package.json/dependency graph
 * than the Render service), so it re-implements the same small, pure
 * canonical-string + HMAC scheme independently rather than reaching across
 * that boundary. The two sides are the two ends of one handshake by
 * construction — if you change the canonical string shape here, you MUST
 * make the identical change in backend/config/adminProxySigning.js, or
 * every signed request will fail verification.
 */

export const SIGNATURE_HEADER = 'x-admin-proxy-signature';
export const TIMESTAMP_HEADER = 'x-admin-proxy-timestamp';
export const CLIENT_IP_HEADER = 'x-admin-proxy-ip';

const HEX_SECRET_RE = /^[0-9a-fA-F]{32,}$/;

export function isValidSigningSecret(hex) {
  return typeof hex === 'string' && HEX_SECRET_RE.test(hex);
}

export function hashBody(buf) {
  const bytes = buf && buf.length ? buf : Buffer.alloc(0);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalString({ method, path, clientIp, timestamp, bodyHash }) {
  return `${method.toUpperCase()}\n${path}\n${clientIp}\n${timestamp}\n${bodyHash}`;
}

/**
 * @param {Buffer} secretBuf
 */
export function computeSignature(secretBuf, { method, path, clientIp, timestamp, bodyHash }) {
  const message = canonicalString({ method, path, clientIp, timestamp, bodyHash });
  return crypto.createHmac('sha256', secretBuf).update(message).digest('hex');
}

/**
 * Builds the three x-admin-proxy-* headers for an outgoing request to
 * Render. Returns null (add nothing) when secretHex is missing/invalid —
 * callers must treat that as "proxy plainly, unsigned", never as an error,
 * so the admin API keeps working exactly as before this feature exists
 * until the secret is deployed on both sides.
 */
export function buildSignedHeaders({ secretHex, method, path, clientIp, rawBody }) {
  if (!isValidSigningSecret(secretHex)) return null;
  const secretBuf = Buffer.from(secretHex, 'hex');
  const timestamp = Date.now();
  const bodyHash  = hashBody(rawBody);
  const signature = computeSignature(secretBuf, { method, path, clientIp, timestamp, bodyHash });
  return {
    [CLIENT_IP_HEADER]: clientIp,
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: signature,
  };
}

/**
 * Extracts the real client IP the way this Vercel Function trusts it: the
 * first entry of x-forwarded-for, which Vercel's own edge sets from the
 * actual TLS-terminated connection for a request landing directly on a
 * Vercel Function (this function IS that single trusted hop facing the
 * browser — there is no further untrusted proxy between the browser and
 * this code). See docs/admin-proxy-signing-runbook.md.
 */
export function extractTrustedClientIp(headers) {
  const xff = headers['x-forwarded-for'];
  if (!xff) return '';
  return String(xff).split(',')[0].trim();
}
