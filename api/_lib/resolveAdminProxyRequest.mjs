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
// vercel.json rewrite instead: `/api/v1/admin/:path*` -> `/api/v1/admin-proxy`
// (no :path placeholder in the destination). Per Vercel's own documented
// behavior for this shape of rewrite (see the /resize/:width/:height ->
// /api/sharp example at https://vercel.com/docs/routing/rewrites, which
// becomes /api/sharp?width=800&height=600), the captured segments are
// flattened onto the destination's query string instead of its path. This
// function undoes that flattening so the rest of the handler can keep
// operating on a real /api/v1/admin/... path exactly as before.
export const ADMIN_MOUNT_PREFIX = '/api/v1/admin';

const ROUTING_PARAM = 'path';

/**
 * @param {string} rawUrl - req.url as Vercel delivers it to the Function,
 *   e.g. "/api/v1/admin-proxy?path=auth%2Flogin" or
 *   "/api/v1/admin-proxy?path=auth&path=login&page=2". Handles both
 *   plausible serializations of a multi-segment capture (a single
 *   slash-joined value, or one repeated `path=` per segment) since this is
 *   not pinned down by Vercel's own docs -- confirmed empirically against a
 *   real Preview deployment (see this file's test and the PR description).
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
