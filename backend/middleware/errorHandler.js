import logger from '../config/logger.js';

export function notFound(req, res, _next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  // res.status(x) (set by the controller before throwing) takes priority;
  // falls back to err.status/err.statusCode (a handful of call sites throw
  // a plain Error with a status property attached instead — e.g.
  // data/supabase/authController.js's documented-gap 501s — which previously
  // fell through to the 500 default below since nothing ever read this
  // property. This was a real, latent bug: those endpoints always returned
  // 500 "Server error" instead of their intended, documented 501.
  const status =
    res.statusCode && res.statusCode !== 200
      ? res.statusCode
      : err.status || err.statusCode || 500;

  logger.error(err.message, {
    status,
    method:    req.method,
    path:      req.originalUrl,
    userId:    req.user?._id?.toString?.() ?? null,
    requestId: req.requestId ?? null,
    stack:     err.stack,
  });

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    const msg = field === 'email'
      ? 'This email is already registered'
      : `A record with that ${field} already exists`;
    return res.status(409).json({ message: msg });
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
