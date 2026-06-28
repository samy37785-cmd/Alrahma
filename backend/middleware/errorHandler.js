import logger from '../config/logger.js';

export function notFound(req, res, _next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  logger.error(err.message, {
    status,
    method: req.method,
    path:   req.originalUrl,
    userId: req.user?._id?.toString?.() ?? null,
    stack:  err.stack,
  });

  if (err.code === 11000) {
    return res.status(409).json({ message: 'This email is already registered' });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  const leakSafe = status >= 500 && process.env.NODE_ENV === 'production';
  res.status(status).json({
    message: leakSafe ? 'Server error — please try again.' : (err.message || 'Server error'),
  });
}
