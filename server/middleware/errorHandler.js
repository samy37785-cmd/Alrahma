// 404 handler for unknown routes.
export function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

// Central error handler — catches errors thrown anywhere in the app.
export function errorHandler(err, req, res, next) {
  console.error('💥', err.message);

  // Mongoose duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    return res.status(409).json({ message: 'This email is already registered' });
  }
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(status).json({ message: err.message || 'Server error' });
}
