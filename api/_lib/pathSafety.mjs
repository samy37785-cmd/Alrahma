/**
 * Rejects a `..` path segment (raw or percent-encoded) in the incoming
 * request path before it is ever concatenated into the outgoing Render
 * URL. WHATWG URL parsing normalizes `..` segments away, which is exactly
 * the problem: fetch(`${ORIGIN}${req.url}`) would silently resolve a
 * crafted `/api/v1/admin/../../health` (or a percent-encoded equivalent)
 * to a completely different path on the SAME fixed origin. The origin
 * itself is a hardcoded constant (never derived from user input), so this
 * can never become a true open proxy to an arbitrary host — but it could
 * still let a request reach an unintended route on Render. Fail closed
 * rather than rely on Vercel's own edge routing to have already ruled
 * this out.
 *
 * Splitting on '/' alone is not enough, because the URL parser that fetch()
 * uses rewrites more than it shows: it treats '\' as '/' and silently drops
 * tabs and newlines, so `..\..\api\trials` or `.<TAB>./x` became `..`
 * segments only AFTER this check had passed. A decoded '?' or '#' would
 * also turn into a real query string or fragment upstream. So any
 * backslash, control character, '?' or '#' is rejected outright, as are
 * '.' and '..' segments.
 */
// C0 controls and DEL: the URL parser strips tab/LF/CR, the rest has no
// place in an admin API path. (Matching control characters is the point.)
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS = /[\\?#\u0000-\u001f\u007f]/;

export function isPathTraversalAttempt(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true; // malformed percent-encoding — reject rather than guess
  }
  if (UNSAFE_PATH_CHARS.test(decoded)) return true;
  return decoded.split('/').some((segment) => segment === '..' || segment === '.');
}
