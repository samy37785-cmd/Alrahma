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
 */
export function isPathTraversalAttempt(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true; // malformed percent-encoding — reject rather than guess
  }
  return decoded.split('/').includes('..');
}
