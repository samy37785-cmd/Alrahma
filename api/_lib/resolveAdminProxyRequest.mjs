// Reconstructs the real /api/v1/admin/* path + query string from the
// request api/v1/admin-proxy.mjs actually receives.
//
// Why this exists: Vercel's zero-config catch-all file convention
// (api/v1/admin/[...path].mjs) only matched requests with exactly ONE path
// segment after /api/v1/admin/ in production — /api/v1/admin/enrollments
// reached the function, but /api/v1/admin/auth/login (two segments) got a
// platform-level 404 before the function ever ran. See
// docs/admin-proxy-signing-runbook.md for the full diagnosis, including
// two earlier fix attempts (Vercel's named catch-all parameter syntax, and
// a bare anchored regex-capture rule) that each reproduced the bug or
// matched nothing at all when verified live, despite being Vercel's own
// documented syntax and matching correctly as plain JS RegExp locally.
//
// The working fix routes every /api/v1/admin/* request through two
// vercel.json rewrites using the one syntax family proven correct for
// multi-segment matching in this exact project (the same family the
// general Render rewrite already uses):
//   { "source": "/api/v1/admin", "destination": "/api/v1/admin-proxy" }
//   { "source": "/api/v1/admin/:subpath(.*)", "destination": "/api/v1/admin-proxy?path=:subpath" }
// Confirmed live (see the PR description) that the resulting request this
// function receives carries the captured value under TWO query keys, not
// one: "path" (from the literal "path=:subpath" text in the destination)
// AND "subpath" (Vercel auto-appends every named capture under its own
// parameter name as well, regardless of whether it was also referenced
// elsewhere in the destination template — the same behavior as their
// documented /resize/:width/:height -> /api/sharp example, which becomes
// /api/sharp?width=800&height=800). Both are stripped before anything
// else uses the query string, so Render never sees either as a leftover,
// unexplained param.
export const ADMIN_MOUNT_PREFIX = '/api/v1/admin';

// "path": the literal query key this file's own vercel.json rule writes.
// "subpath": Vercel's own auto-appended copy, under the rewrite's named
// parameter (:subpath) — present whether or not :subpath is also used
// elsewhere in the destination. Both carry the identical captured value;
// only one is read (first one found with content), both are stripped.
const PRIMARY_ROUTING_PARAM = 'path';
const AUTO_APPENDED_ROUTING_PARAM = 'subpath';

/**
 * @param {string} rawUrl - req.url as Vercel delivers it to the Function,
 *   e.g. "/api/v1/admin-proxy?path=auth%2Flogin&subpath=auth%2Flogin" (the
 *   real format the vercel.json named-parameter rewrite produces for
 *   /api/v1/admin/auth/login) or "/api/v1/admin-proxy" (the bare
 *   /api/v1/admin case, routed by the separate exact-literal rule with no
 *   query param at all).
 * @returns {{ fullPath: string, query: string }} fullPath always starts
 *   with ADMIN_MOUNT_PREFIX; query is '' or starts with '?'. Any other
 *   original query parameters (e.g. ?page=2) are preserved.
 */
export function resolveAdminProxyRequest(rawUrl) {
  const url = new URL(rawUrl, 'http://internal.invalid');

  // Both keys carry the identical captured value when both are present
  // (see the comment above) -- read from whichever one is actually there
  // rather than concatenating, which would duplicate every segment.
  const primaryValues = url.searchParams.getAll(PRIMARY_ROUTING_PARAM);
  const rawValues = primaryValues.length > 0 ? primaryValues : url.searchParams.getAll(AUTO_APPENDED_ROUTING_PARAM);
  url.searchParams.delete(PRIMARY_ROUTING_PARAM);
  url.searchParams.delete(AUTO_APPENDED_ROUTING_PARAM);

  const segments = rawValues
    .flatMap((value) => value.split('/'))
    .filter((segment) => segment.length > 0);

  const fullPath = segments.length > 0 ? `${ADMIN_MOUNT_PREFIX}/${segments.join('/')}` : ADMIN_MOUNT_PREFIX;

  const remaining = url.searchParams.toString();
  const query = remaining ? `?${remaining}` : '';

  return { fullPath, query };
}
