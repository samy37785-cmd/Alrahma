import logger from '../config/logger.js';

const SKIP_PATHS = new Set(['/', '/health']);

export function requestLogger(req, res, next) {
  if (SKIP_PATHS.has(req.path)) return next();

  const started = Date.now();

  res.on('finish', () => {
    const ms     = Date.now() - started;
    const status = res.statusCode;
    const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.originalUrl}`, {
      status,
      ms,
      ip:     req.ip,
      userId: req.user?._id?.toString?.() ?? null,
    });
  });

  next();
}
