// Reconstructs the real /api/v1/admin/* path + query string from the
// request api/v1/admin-proxy.mjs actually receives.
//
// Why this exists: Vercel's zero-config catch-all file convention
// (api/v1/admin/[...path].mjs) only matched requests with exactly ONE path
// segment after /api/v1/admin/ in production — /api/v1/admin/enrollments
// reached the function, but /api/v1/admin/auth/login (two segments) got a
// platform-level 404 before the function ever ran. See
// docs/admin-proxy-signing-runbook.md for the full diagnosis.
//
// The fix routes every /api/v1/admin/* request through an explicit
// vercel.json rewrite instead: `^/api/v1/admin(/.*|)$` ->
// `/api/v1/admin-proxy?path=$1`, a raw regex capture group (Vercel's own
// documented rewrite syntax -- see the /articles/(\d{4})/(\d{2})/(.+) ->
// /archive?year=$1&month=$2&slug=$3 example at
// https://vercel.com/docs/routing/rewrites). A first attempt using
// Vercel's named catch-all parameter syntax ("/api/v1/admin/:path*")
// reproduced the EXACT same one-segment-only limitation this fix is for,
// confirmed live against a real Preview deployment -- the regex-capture
// form is a structurally different code path in Vercel's router and was
// confirmed working for every required depth (see the PR description).
// The captured subpath ($1, including its leading "/" when present, or ""
// for the bare /api/v1/admin case) lands in the destination's query
// string instead of its path. This function undoes that flattening so the
// rest of the handler can keep operating on a real /api/v1/admin/... path
// exactly as before.
export const ADMIN_MOUNT_PREFIX = '/api/v1/admin';

const ROUTING_PARAM = 'path';

/**
 * @param {string} rawUrl - req.url as Vercel delivers it to the Function,
 *   e.g. "/api/v1/admin-proxy?path=%2Fauth%2Flogin&page=2" (the real format
 *   the vercel.json regex-capture rewrite produces) or
 *   "/api/v1/admin-proxy?path=auth&path=login" (handled too, defensively,
 *   in case the exact serialization ever changes).
 * @returns {{ fullPath: string, query: string }} fullPath always starts
 *   with ADMIN_MOUNT_PREFIX; query is '' or starts with '?'. Any other
 *   original query parameters (e.g. ?page=2) are preserved.
 */
export function resolveAdminProxyRequest(rawUrl) {
  const url = new URL(rawUrl, 'http://internal.invalid');

  const segments = url.searchParams
    .getAll(ROUTING_PARAM)
    .flatMap((value) => value.split('/'))
    .filter((segment) => segment.length > 0);
  url.searchParams.delete(ROUTING_PARAM);

  const fullPath = segments.length > 0 ? `${ADMIN_MOUNT_PREFIX}/${segments.join('/')}` : ADMIN_MOUNT_PREFIX;

  const remaining = url.searchParams.toString();
  const query = remaining ? `?${remaining}` : '';

  return { fullPath, query };
}
