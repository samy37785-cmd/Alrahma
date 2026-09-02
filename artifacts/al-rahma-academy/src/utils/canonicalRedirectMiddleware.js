import { computeCanonicalRedirect } from './canonicalRedirectDecision.js';

/**
 * The actual Vite/Node HTTP middleware used by both configureServer and
 * configurePreviewServer in vite.config.ts. Extracted so a test can exercise
 * the real statusCode/Location/end()/next() wiring directly, not just the
 * pure decision function it delegates to (see canonicalRedirectDecision.js).
 */
export function canonicalRedirectMiddleware(req, res, next) {
  if (!req.url) return next();

  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    // Malformed URL — fail safe by passing through rather than throwing.
    return next();
  }

  const canonical = computeCanonicalRedirect({
    method: req.method,
    pathname: url.pathname,
    search: url.search,
  });
  if (!canonical) return next();

  res.statusCode = 308;
  res.setHeader('Location', canonical.pathname + canonical.search);
  res.end();
}
