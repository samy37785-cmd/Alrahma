import crypto from 'crypto';

/**
 * HMAC verification for the signed Vercel → Render admin proxy.
 *
 * Why this exists: /api/v1/admin/* is reached through a Vercel Function
 * (see api/v1/admin-proxy.mjs, reached via the two /api/v1/admin* rewrites
 * in vercel.json) rather than the plain external rewrite used by every
 * other /api/* route. That function is the one place that
 * can observe the real browser client IP (via Vercel's own edge-set
 * x-forwarded-for — a value external clients cannot inject when talking
 * to a Vercel Function directly). It signs that IP, alongside the
 * request's method/path/body, so this backend can trust it WITHOUT
 * widening `trust proxy` (which would let anyone hitting the raw Render
 * host spoof X-Forwarded-For — see docs/admin-proxy-signing-runbook.md).
 *
 * This module is deliberately independent of backend/config/encryption.js
 * — ADMIN_PROXY_SIGNING_SECRET is its own secret, never reused, so that
 * rotating one never touches the other.
 */

const HEX_SECRET_RE = /^[0-9a-fA-F]{32,}$/; // >= 16 bytes; no fixed upper bound

// Short-lived on purpose: this is a per-request signature, not a session
// token. 30s comfortably covers Vercel-to-Render network latency plus
// reasonable clock drift, while keeping a captured signature useless
// almost immediately (replay-resistance, not just origin-authentication).
export const MAX_SKEW_MS = 30_000;

export const SIGNATURE_HEADER  = 'x-admin-proxy-signature';
export const TIMESTAMP_HEADER  = 'x-admin-proxy-timestamp';
export const CLIENT_IP_HEADER  = 'x-admin-proxy-ip';

/**
 * Returns the validated secret as a Buffer, or null if unset. Throws only
 * if the var is SET but malformed (a present-but-invalid secret is a
 * configuration error, not "signing disabled") — mirrors
 * config/encryption.js's parseKey() so a misconfigured deploy fails loud
 * at startup rather than silently accepting forged headers.
 */
export function getSigningSecret() {
  const hex = process.env.ADMIN_PROXY_SIGNING_SECRET;
  if (!hex) return null;
  if (!HEX_SECRET_RE.test(hex)) {
    throw new Error('ADMIN_PROXY_SIGNING_SECRET must be a hex string of at least 32 characters (16 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function hashBody(buf) {
  const bytes = buf && buf.length ? buf : Buffer.alloc(0);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalString({ method, path, query, clientIp, timestamp, bodyHash }) {
  // Order and delimiter are part of the contract with api/_lib/adminProxySigning.mjs
  // on the Vercel side — changing this shape requires updating both ends together.
  // query is the raw query string INCLUDING its leading '?' when present, or ''
  // when absent — binding it here means a request cannot be replayed with a
  // different query (e.g. GET /enrollments?page=1 rewritten to ?page=2) under
  // an otherwise-valid signature.
  return `${method.toUpperCase()}\n${path}\n${query}\n${clientIp}\n${timestamp}\n${bodyHash}`;
}

export function computeSignature({ secret, method, path, query, clientIp, timestamp, bodyHash }) {
  const message = canonicalString({ method, path, query, clientIp, timestamp, bodyHash });
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a signed admin-proxy request. Never throws for an untrusted
 * request — every failure path returns { ok: false, reason } with a short
 * reason CODE only (never the offending IP/signature/body/secret), so
 * callers can log the reason safely.
 *
 * @param {object} params
 * @param {Record<string,string>} params.headers  lower-cased request headers
 * @param {string} params.method
 * @param {string} params.path      pathname only (no query string)
 * @param {string} [params.query]   raw query string including leading '?', or '' — defaults to ''
 * @param {Buffer} params.rawBody
 * @param {number} [params.now]     injectable for tests; defaults to Date.now()
 */
export function verifyAdminProxySignature({ headers, method, path, query = '', rawBody, now = Date.now() }) {
  let secret;
  try {
    secret = getSigningSecret();
  } catch {
    // Malformed secret behaves the same as "unavailable" for verification
    // purposes — validateEnv() is what surfaces the configuration error
    // loudly at startup, this function just fails closed either way.
    return { ok: false, reason: 'secret_unavailable' };
  }
  if (!secret) return { ok: false, reason: 'secret_unavailable' };

  const clientIp  = headers[CLIENT_IP_HEADER];
  const timestamp = headers[TIMESTAMP_HEADER];
  const signature = headers[SIGNATURE_HEADER];
  if (!clientIp || !timestamp || !signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (Math.abs(now - ts) > MAX_SKEW_MS) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  const bodyHash  = hashBody(rawBody);
  const expected  = computeSignature({ secret, method, path, query, clientIp, timestamp, bodyHash });

  if (!timingSafeHexEqual(signature, expected)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, clientIp };
}
