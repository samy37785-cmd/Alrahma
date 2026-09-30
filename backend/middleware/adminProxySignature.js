import { verifyAdminProxySignature } from '../config/adminProxySigning.js';
import logger from '../config/logger.js';

/**
 * Verifies the signed Vercel-proxy headers (if present) and, only on a
 * fully valid signature, exposes the authenticated client IP as
 * req.trustedAdminClientIp for ipWhitelist.js to prefer over req.ip.
 *
 * Deliberately does NOT block the request itself — it only ever sets or
 * leaves unset a single trusted field. ipWhitelist.js (mounted right after
 * this) remains the sole place that allows/denies. This keeps the two
 * concerns isolated: this middleware answers "which IP do we trust for
 * this request", ipWhitelist answers "is that IP allowed".
 *
 * Unsigned or forged x-admin-proxy-* headers are never useful: any
 * verification failure — including ADMIN_PROXY_SIGNING_SECRET simply
 * being unset — leaves req.trustedAdminClientIp unset, so ipWhitelist
 * falls through to req.ip exactly as it did before this feature existed.
 */
export function adminProxySignature(req, res, next) {
  const result = verifyAdminProxySignature({
    headers: req.headers,
    method:  req.method,
    path:    req.path,
    rawBody: req.rawBody,
  });

  if (result.ok) {
    req.trustedAdminClientIp = result.clientIp;
  } else if (result.reason !== 'secret_unavailable') {
    // Only log when signing is actually configured but verification still
    // failed — an unconfigured secret is the expected, unremarkable state
    // before the runbook's rollout is complete, not worth a log line per
    // request. Reason code only: never the IP, timestamp, signature, body,
    // or secret.
    logger.warn('Admin proxy signature verification failed', { reason: result.reason });
  }

  next();
}
