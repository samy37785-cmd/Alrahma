import { readRawBody } from '../_lib/readRawBody.mjs';
import { buildSignedHeaders, extractTrustedClientIp } from '../_lib/adminProxySigning.mjs';
import { isPathTraversalAttempt } from '../_lib/pathSafety.mjs';
import { resolveAdminProxyRequest, ADMIN_MOUNT_PREFIX } from '../_lib/resolveAdminProxyRequest.mjs';

/**
 * Signed admin proxy: the ONLY thing on the Vercel side allowed to add
 * x-admin-proxy-* headers. See docs/admin-proxy-signing-runbook.md.
 *
 * Why this exists instead of the plain external rewrite every other
 * /api/* route uses (see vercel.json): that rewrite hides the real
 * browser client IP from Render behind Vercel's own outbound edge IP,
 * which broke ADMIN_IP_WHITELIST (see the "Admin IP Allowlist Proxy-Path
 * Diagnosis" audit this fix follows up on).
 *
 * How it's reached: this file used to live at api/v1/admin/[...path].mjs,
 * relying on Vercel's zero-config catch-all file convention to match every
 * depth under /api/v1/admin/*. In production that convention only matched
 * requests with exactly ONE path segment after the prefix -- a request like
 * /api/v1/admin/auth/login (two segments) got a platform-level 404 before
 * this function ever ran, which is what silently broke admin login. This
 * file is now a plain, non-dynamic Function, reached via an explicit
 * vercel.json rewrite using a raw regex capture group
 * ("^/api/v1/admin(/.*|)$" -> "/api/v1/admin-proxy?path=$1") that works for
 * any depth; resolveAdminProxyRequest() (api/_lib/) undoes Vercel's
 * flattening of the captured subpath back into a real
 * /api/v1/admin/... path before anything below uses it. See
 * docs/admin-proxy-signing-runbook.md for the full diagnosis and the
 * general /api/:path* rewrite that still serves every other route
 * unchanged.
 *
 * Same origin the general rewrite already points at — keep these two in
 * sync if the backend's Render URL ever changes.
 */
const RENDER_BACKEND_ORIGIN = 'https://academy-backend-cxso.onrender.com';

// Node.js Function (not Edge): needs Node's full `fetch`/streams plus the
// ability to read the untouched raw request body for hashing.
export const config = { api: { bodyParser: false } };

// Headers that must never be copied verbatim between hops.
const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);
const STRIPPED_RESPONSE_HEADERS  = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);
// Never forward these from the incoming request even if a caller sent
// them directly — this function is the only legitimate source of them.
const RESERVED_PROXY_HEADERS = new Set(['x-admin-proxy-ip', 'x-admin-proxy-timestamp', 'x-admin-proxy-signature']);

function buildForwardHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(lower) || RESERVED_PROXY_HEADERS.has(lower)) continue;
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

export default async function handler(req, res) {
  // Undo Vercel's flattening of the rewrite-captured segments back into a
  // real /api/v1/admin/... path + query string. Everything below operates
  // on these exactly as the old filesystem-routed function did on
  // req.url directly.
  const { fullPath, query } = resolveAdminProxyRequest(req.url);

  // Checked before anything else — including reading the body — so a
  // traversal attempt never reaches fetch()'s URL construction at all.
  if (isPathTraversalAttempt(fullPath)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ message: 'Invalid path' }));
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ message: 'Invalid request body' }));
    return;
  }

  const method   = req.method || 'GET';
  const clientIp = extractTrustedClientIp(req.headers);
  // Matches Express's req.path inside the mounted admin router (backend/
  // app.js: app.use('/api/v1/admin', adminRoutes)) — this is the path
  // value that gets signed and later re-checked by
  // verifyAdminProxySignature() on the Render side.
  const path = fullPath.startsWith(ADMIN_MOUNT_PREFIX)
    ? (fullPath.slice(ADMIN_MOUNT_PREFIX.length) || '/')
    : fullPath;

  const forwardHeaders = buildForwardHeaders(req);

  // Signing is best-effort and additive: an unset/invalid
  // ADMIN_PROXY_SIGNING_SECRET on the Vercel side simply means no
  // x-admin-proxy-* headers are added at all, i.e. plain pass-through,
  // identical to the general rewrite's current behavior. See
  // docs/admin-proxy-signing-runbook.md for the rollout order.
  const signedHeaders = buildSignedHeaders({
    secretHex: process.env.ADMIN_PROXY_SIGNING_SECRET,
    method, path, query, clientIp, rawBody,
  });
  if (signedHeaders) {
    for (const [key, value] of Object.entries(signedHeaders)) forwardHeaders.set(key, value);
  }

  const hasBody = method !== 'GET' && method !== 'HEAD' && rawBody.length > 0;

  let upstream;
  try {
    upstream = await fetch(`${RENDER_BACKEND_ORIGIN}${fullPath}${query}`, {
      method,
      headers: forwardHeaders,
      body: hasBody ? rawBody : undefined,
      redirect: 'manual',
    });
  } catch {
    // Never leak upstream error details (could include internal
    // hostnames/stack traces) to the caller, and never log the client IP,
    // body, signature, or secret here.
    res.statusCode = 502;
    res.end(JSON.stringify({ message: 'Upstream unavailable' }));
    return;
  }

  res.statusCode = upstream.status;

  // Set-Cookie must be relayed as multiple distinct headers, never merged
  // into one comma-joined string (which would corrupt the admin session
  // cookie) — getSetCookie() (Node 18.14+/20+) preserves that.
  const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];

  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (STRIPPED_RESPONSE_HEADERS.has(lower) || lower === 'set-cookie') continue;
    res.setHeader(key, value);
  }
  if (setCookies.length) res.setHeader('set-cookie', setCookies);

  const bodyBuffer = Buffer.from(await upstream.arrayBuffer());
  res.end(bodyBuffer);
}
