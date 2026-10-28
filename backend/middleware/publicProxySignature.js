import { verifyPublicProxySignature, PUBLIC_PROXY_HEADERS } from '../config/publicProxySigning.js';
import logger from '../config/logger.js';

/**
 * Only on a fully valid x-public-proxy-* signature, exposes the visitor's IP
 * as req.trustedClientIp, which the limiters in config/rateLimit.js prefer
 * over req.ip. Never blocks a request: anything else (no headers, the secret
 * unset, a forged or stale signature) leaves req.trustedClientIp unset and
 * the limiters key on req.ip exactly as before. See
 * docs/public-proxy-signing-runbook.md.
 *
 * Mounted after express.json (it hashes req.rawBody) and before apiLimiter.
 */
export function publicProxySignature(req, _res, next) {
  // Most requests never came through the form proxy: nothing to check.
  if (!PUBLIC_PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) return next();

  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const result = verifyPublicProxySignature({
    headers: req.headers,
    method: req.method,
    path: req.path,
    query,
    rawBody: req.rawBody,
  });

  if (result.ok) {
    req.trustedClientIp = result.clientIp;
  } else if (result.reason !== 'secret_unavailable') {
    // Reason code only: never the IP, timestamp, signature, body or secret.
    logger.warn('Public proxy signature verification failed', { reason: result.reason });
  }
  next();
}
