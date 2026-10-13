import logger from '../config/logger.js';
import { anonymizeIp } from '../config/encryption.js';

const SKIP_PATHS = new Set(['/', '/health', '/ready']);

export const pathOnly = (url) => String(url ?? '').split('?')[0];

export function requestLogger(req, res, next) {
  if (SKIP_PATHS.has(req.path)) return next();

  const started = Date.now();

  res.on('finish', () => {
    const ms     = Date.now() - started;
    const status = res.statusCode;
    const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    // Audit AR-15: no full IP, no X-Forwarded-For chain, and no query string
    // (it can carry an email or a one-time token, e.g. a password reset link).
    logger[level](`${req.method} ${pathOnly(req.originalUrl)}`, {
      status,
      ms,
      ip:        anonymizeIp(req.ip ?? ''),
      userId:    req.user?._id?.toString?.() ?? null,
      requestId: req.requestId ?? null,
    });
  });

  next();
}
