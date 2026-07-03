import crypto from 'node:crypto';

/**
 * Assigns a unique request ID to every inbound HTTP request.
 *
 * - If the caller already sends an `x-request-id` header (e.g. from a
 *   gateway, load balancer, or Vercel's edge), that value is reused so the
 *   same ID flows end-to-end through all log entries.
 * - Otherwise a fresh 16-hex-char ID is generated.
 *
 * The ID is attached to:
 *   req.requestId       → available to controllers and downstream middleware
 *   res header          → echoed back so clients can correlate requests
 *
 * requestLogger reads req.requestId and includes it in every log line,
 * making it trivial to grep all entries for a single request.
 */
export function correlationId(req, res, next) {
  const existing = req.headers['x-request-id'];
  const id = (existing && typeof existing === 'string' && existing.length <= 64)
    ? existing
    : crypto.randomBytes(8).toString('hex');

  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
