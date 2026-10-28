import { readRawBody } from './readRawBody.mjs';
import { extractTrustedClientIp, CLIENT_IP_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './adminProxySigning.mjs';
import {
  buildPublicSignedHeaders,
  PUBLIC_CLIENT_IP_HEADER,
  PUBLIC_SIGNATURE_HEADER,
  PUBLIC_TIMESTAMP_HEADER,
} from './publicProxySigning.mjs';

/**
 * Forwards one public form request to a FIXED backend path, signing the real
 * client IP (see publicProxySigning.mjs and
 * docs/public-proxy-signing-runbook.md).
 *
 * Each Function (api/v1/trials-proxy.mjs, api/v1/enrollments-proxy.mjs) is
 * reached by one exact-literal vercel.json rewrite and passes its own
 * hard-coded target, so nothing in the request URL chooses where it goes.
 * The incoming query string is dropped: neither endpoint reads one.
 *
 * Same origin as the general rewrite in vercel.json — keep them in sync.
 */
export const RENDER_BACKEND_ORIGIN = 'https://academy-backend-cxso.onrender.com';

const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);
const STRIPPED_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);
// Only this Function may set these; a caller's own copies never reach Render.
const RESERVED_PROXY_HEADERS = new Set([
  PUBLIC_CLIENT_IP_HEADER, PUBLIC_TIMESTAMP_HEADER, PUBLIC_SIGNATURE_HEADER,
  CLIENT_IP_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER,
]);

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

export async function forwardPublicForm(req, res, targetPath) {
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ message: 'Invalid request body' }));
    return;
  }

  const method = req.method || 'GET';
  const forwardHeaders = buildForwardHeaders(req);
  const signed = buildPublicSignedHeaders({
    secretHex: process.env.PUBLIC_PROXY_SIGNING_SECRET,
    method,
    path: targetPath,
    query: '',
    clientIp: extractTrustedClientIp(req.headers),
    rawBody,
  });
  if (signed) {
    for (const [key, value] of Object.entries(signed)) forwardHeaders.set(key, value);
  }

  const hasBody = method !== 'GET' && method !== 'HEAD' && rawBody.length > 0;

  let upstream;
  try {
    upstream = await fetch(`${RENDER_BACKEND_ORIGIN}${targetPath}`, {
      method,
      headers: forwardHeaders,
      body: hasBody ? rawBody : undefined,
      redirect: 'manual',
    });
  } catch {
    // Nothing about the upstream error, the client IP or the body is
    // returned or logged.
    res.statusCode = 502;
    res.end(JSON.stringify({ message: 'Upstream unavailable' }));
    return;
  }

  res.statusCode = upstream.status;
  // Each Set-Cookie (the CSRF cookie) stays a separate header.
  const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (STRIPPED_RESPONSE_HEADERS.has(lower) || lower === 'set-cookie') continue;
    res.setHeader(key, value);
  }
  if (setCookies.length) res.setHeader('set-cookie', setCookies);

  res.end(Buffer.from(await upstream.arrayBuffer()));
}
