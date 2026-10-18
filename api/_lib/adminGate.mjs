/**
 * Hidden admin console.
 *
 * When ADMIN_PAGE_KEY is set on Vercel (at least MIN_KEY_LENGTH characters),
 * the admin pages (/admin, /admin/login, also under a language prefix) and
 * the admin API through this domain (/api/v1/admin/*, the signed proxy)
 * answer exactly like a page or API route that does not exist, unless the
 * browser carries the admin_gate cookie. The owner gets that cookie by
 * opening the secret link once in each browser:
 *
 *   https://al-rahmaacademy.com/admin-access/<ADMIN_PAGE_KEY>
 *
 * which sets the cookie and redirects to /admin/login.
 *
 * This only hides the console. Signing in still needs the admin password and
 * the TOTP code, and the backend keeps its own MFA, IP allowlist and RBAC.
 *
 * ADMIN_PAGE_KEY unset or too short: nothing is hidden, exactly as before,
 * so deploying this before the variable exists changes nothing. The cookie
 * holds an HMAC of a fixed label under the key, never the key itself, so
 * changing the key signs every browser out of the hidden console.
 *
 * Pure Web APIs only (crypto.subtle, Request, Response, URL): the same code
 * runs in the Edge middleware (/middleware.js) and the Node proxy function
 * (api/v1/admin-proxy.mjs), and in the backend test suite.
 */

export const ADMIN_GATE_COOKIE = 'admin_gate';
export const ADMIN_ACCESS_PREFIX = '/admin-access/';
export const MIN_KEY_LENGTH = 32;
export const GATE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // 180 days

// Any path that exists nowhere: rewriting to it serves the site's own 404
// page, so a hidden page looks the same as a missing one.
export const NOT_FOUND_PATH = '/__not-found__';

// The page paths vercel.json serves the SPA shell for, with or without a
// language prefix and a trailing slash. Vercel matches page paths
// case-sensitively (/ADMIN/LOGIN is already a 404), so this is too.
const HIDDEN_PAGE_RE = /^\/(?:(?:ar|fr|it|es|de)\/)?admin(?:\/|$)/;

const encoder = new TextEncoder();

export function gateEnabled(key) {
  return typeof key === 'string' && key.length >= MIN_KEY_LENGTH;
}

export function isHiddenPage(pathname) {
  return HIDDEN_PAGE_RE.test(pathname);
}

async function hmacHex(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time for equal lengths; both sides are always 64-char hex here.
function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function gateCookieValue(key) {
  return hmacHex(key, 'al-rahma admin gate v1');
}

export function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function hasGateCookie(cookieHeader, key) {
  const value = readCookie(cookieHeader, ADMIN_GATE_COOKIE);
  return Boolean(value) && sameString(value, await gateCookieValue(key));
}

// Both sides are hashed first, so the comparison time says nothing about
// the key's length or how much of a guess was right.
async function keyMatches(candidate, key) {
  return sameString(await hmacHex(candidate, 'key check'), await hmacHex(key, 'key check'));
}

/**
 * What to do with a request for a page path:
 *   { action: 'pass' }                         serve it as usual
 *   { action: 'not-found' }                    answer like a missing page
 *   { action: 'grant', setCookie, location }   right secret link: set the
 *                                              cookie, go to the login page
 */
export async function decidePage({ pathname, cookieHeader, key }) {
  if (!gateEnabled(key)) return { action: 'pass' };

  if (pathname.startsWith(ADMIN_ACCESS_PREFIX)) {
    let candidate = pathname.slice(ADMIN_ACCESS_PREFIX.length).replace(/\/$/, '');
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return { action: 'not-found' };
    }
    if (!candidate || !(await keyMatches(candidate, key))) return { action: 'not-found' };
    return {
      action: 'grant',
      location: '/admin/login',
      setCookie: `${ADMIN_GATE_COOKIE}=${await gateCookieValue(key)}; Path=/; Max-Age=${GATE_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
    };
  }

  if (isHiddenPage(pathname) && !(await hasGateCookie(cookieHeader, key))) {
    return { action: 'not-found' };
  }
  return { action: 'pass' };
}

// The two responses Vercel Routing Middleware understands, as built by
// next() and rewrite() in @vercel/functions/middleware (inlined: each is one
// header, not worth a dependency).
export function middlewareNext() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

export function middlewareRewrite(destination) {
  return new Response(null, { headers: { 'x-middleware-rewrite': String(destination) } });
}

/** The Edge middleware's whole job, given the request and ADMIN_PAGE_KEY. */
export async function adminPageResponse(request, key) {
  const url = new URL(request.url);
  let decision;
  try {
    decision = await decidePage({ pathname: url.pathname, cookieHeader: request.headers.get('cookie'), key });
  } catch {
    // Never show a hidden page because something failed.
    decision = gateEnabled(key) ? { action: 'not-found' } : { action: 'pass' };
  }

  if (decision.action === 'grant') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: decision.location,
        'Set-Cookie': decision.setCookie,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (decision.action === 'not-found') return middlewareRewrite(new URL(NOT_FOUND_PATH, url));
  return middlewareNext();
}
