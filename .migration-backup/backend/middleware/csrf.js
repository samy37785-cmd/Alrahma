import crypto from 'node:crypto';
import env from '../config/env.js';

const SAFE_METHODS  = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE   = 'csrf_token';
const CSRF_HEADER   = 'x-csrf-token';
const TOKEN_BYTES   = 32;
const MAX_AGE_SEC   = 60 * 60 * 24; // 24 h

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * issueCsrfToken — attaches a non-httpOnly CSRF cookie on every safe request
 * so the browser SPA can read it and echo it back on mutating requests.
 */
export function issueCsrfToken(req, res, next) {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure:   env.NODE_ENV === 'production',
      maxAge:   MAX_AGE_SEC * 1000,
    });
  }
  next();
}

/**
 * verifyCsrfToken — blocks mutating requests that don't carry a matching
 * CSRF token in the X-CSRF-Token header.
 *
 * Exemptions:
 *   • GET / HEAD / OPTIONS (safe methods)
 *   • Stripe webhook (requires raw body; already auth'd by HMAC signature)
 *   • Vercel cron (authenticated by CRON_SECRET)
 */
export function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path.startsWith('/api/payments/stripe/webhook')) return next();
  if (req.path.startsWith('/api/payments/paypal/webhook')) return next();
  if (req.path.startsWith('/api/cron/')) return next();

  const cookieToken  = req.cookies[CSRF_COOKIE];
  const headerToken  = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ message: 'CSRF token missing' });
  }

  const cookieBuf = Buffer.from(cookieToken, 'hex');
  const headerBuf = Buffer.from(headerToken, 'hex');

  if (
    cookieBuf.length !== TOKEN_BYTES ||
    headerBuf.length !== TOKEN_BYTES ||
    !crypto.timingSafeEqual(cookieBuf, headerBuf)
  ) {
    return res.status(403).json({ message: 'CSRF token invalid' });
  }

  next();
}

export const CSRF_COOKIE_NAME  = CSRF_COOKIE;
export const CSRF_HEADER_NAME  = CSRF_HEADER;
