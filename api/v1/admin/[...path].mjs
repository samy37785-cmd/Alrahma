import { readRawBody } from '../../_lib/readRawBody.mjs';
import { buildSignedHeaders, extractTrustedClientIp } from '../../_lib/adminProxySigning.mjs';

/**
 * Signed admin proxy: the ONLY thing on the Vercel side allowed to add
 * x-admin-proxy-* headers. See docs/admin-proxy-signing-runbook.md.
 *
 * Why this exists instead of the plain external rewrite every other
 * /api/* route uses (see vercel.json): that rewrite hides the real
 * browser client IP from Render behind Vercel's own outbound edge IP,
 * which broke ADMIN_IP_WHITELIST (see the "Admin IP Allowlist Proxy-Path
 * Diagnosis" audit this fix follows up on). This function is a Vercel
 * Function under /api/v1/admin/*, which the filesystem-routing layer
 * matches BEFORE vercel.json's rewrites are even considered — so it
 * "wins" for this one path automatically, with zero change to the
 * general /api/:path* rewrite that still serves every other route.
 *
 * Same origin the general rewrite already points at — keep these two in
 * sync if the backend's Render URL ever changes.
 */
const RENDER_BACKEND_ORIGIN = 'https://academy-backend-cxso.onrender.com';

// Render mounts the admin router at this prefix (backend/app.js:
// app.use('/api/v1/admin', adminRoutes)). Express's req.path INSIDE that
// router is the pathname with this prefix already stripped — so the
// signature must cover that same stripped path, not the full request URL,
// or verifyAdminProxySignature() will always see a "different path" and
// reject every request. The outgoing fetch() URL still uses the FULL path
// (this constant below) since that's what actually selects the route.
const ADMIN_MOUNT_PREFIX = '/api/v1/admin';

// Node.js Function (not Edge): needs Node's full `fetch`/streams plus the
// ability to read the untouched raw request body for hashing.
export const config = { api: { bodyParser: false } };

// Headers that must never be copied verbatim between hops.
const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);
const STRIPPED_RESPONSE_HEADERS  = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);
// Never forward these from the incoming request even if a caller sent
// them directly — this function is the only legitimate source of them.
const RESERVED_PROXY_HEADERS = new Set(['x-admin-proxy-ip', 'x-admin-proxy-timestamp', 'x-admin-proxy-signature']);

function buildTargetUrl(req) {
  // req.url on a Vercel Node.js Function carries the full incoming
  // pathname + query string as the browser sent it (e.g.
  // "/api/v1/admin/enrollments?page=2") — this function is reached only
  // via the /api/v1/admin/* filesystem route, so that prefix is always
  // already present.
  return `${RENDER_BACKEND_ORIGIN}${req.url}`;
}

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
  const fullPath = req.url.split('?')[0];
  // Matches Express's req.path inside the mounted admin router (see
  // ADMIN_MOUNT_PREFIX above) — this is the path value that gets signed
  // and later re-checked by verifyAdminProxySignature() on the Render side.
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
    method, path, clientIp, rawBody,
  });
  if (signedHeaders) {
    for (const [key, value] of Object.entries(signedHeaders)) forwardHeaders.set(key, value);
  }

  const hasBody = method !== 'GET' && method !== 'HEAD' && rawBody.length > 0;

  let upstream;
  try {
    upstream = await fetch(buildTargetUrl(req), {
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
