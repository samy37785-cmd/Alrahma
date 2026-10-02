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
// /api/sharp?width=800&height=800).
//
// SECURITY — query-routing collision (found in a later security pass):
// "path"/"subpath" are ordinary query keys, indistinguishable at this
// point from a value a client put there directly. Confirmed live against
// a real Preview deployment (see the PR description) that:
//   - When a client appends its OWN "path"/"subpath" to a URL that also
//     matches the ":subpath(.*)" rewrite (e.g.
//     "/api/v1/admin/auth/login?path=client-value"), Vercel's own rewrite
//     value silently overwrites the client's — the client's value never
//     survives to this function. This rule is self-defending.
//   - BUT a client calling the bare "/api/v1/admin?path=client-value" (the
//     exact-literal rule, whose destination sets no query at all) arrives
//     here with "path=client-value" completely unopposed — nothing
//     overwrites it. Confirmed: this let a request to the bare admin URL
//     be silently re-routed to an arbitrary "/api/v1/admin/<anything>"
//     chosen entirely by the client. The same is true of a request aimed
//     directly at this function's own public URL
//     ("/api/v1/admin-proxy?path=...") with an invented value for either
//     key, or with "path" and "subpath" set to two DIFFERENT values.
// Fail-closed fix: the only two shapes ever actually produced by the two
// rewrite rules are (a) neither key present (bare case) or (b) BOTH keys
// present with the EXACT SAME single value (subpath case, Vercel's own
// behavior above makes this the only value a client can cause to survive
// here). Anything else — either key repeated, either key present alone,
// or the two keys disagreeing — cannot have come from a legitimate
// rewrite and is rejected (throws AdminProxyRoutingError; the caller
// turns that into an HTTP 400) rather than guessed at by e.g. preferring
// one key's first value over the other's.
export const ADMIN_MOUNT_PREFIX = '/api/v1/admin';

// "path": the literal query key this file's own vercel.json rule writes.
// "subpath": Vercel's own auto-appended copy, under the rewrite's named
// parameter (:subpath) — present whether or not :subpath is also used
// elsewhere in the destination. A legitimate request carries both, with
// an identical value (see the SECURITY comment above).
const PRIMARY_ROUTING_PARAM = 'path';
const AUTO_APPENDED_ROUTING_PARAM = 'subpath';

/** Thrown by resolveAdminProxyRequest() for a query shape that cannot have
 * come from the two legitimate vercel.json rewrite rules. Callers must
 * treat this as a 400, never as "ignore the query and guess a path". */
export class AdminProxyRoutingError extends Error {}

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
 * @throws {AdminProxyRoutingError} if "path"/"subpath" don't form one of
 *   the two shapes a legitimate rewrite can actually produce.
 */
export function resolveAdminProxyRequest(rawUrl) {
  const url = new URL(rawUrl, 'http://internal.invalid');

  const pathValues = url.searchParams.getAll(PRIMARY_ROUTING_PARAM);
  const subpathValues = url.searchParams.getAll(AUTO_APPENDED_ROUTING_PARAM);

  let rawValue;
  if (pathValues.length === 0 && subpathValues.length === 0) {
    rawValue = ''; // bare case: the exact-literal rule, no subpath
  } else if (pathValues.length === 1 && subpathValues.length === 1 && pathValues[0] === subpathValues[0]) {
    rawValue = pathValues[0]; // subpath case: both keys agree, as proven live
  } else {
    // Repeated key, only one of the two present, or the two disagreeing —
    // none of these can come from either rewrite rule as actually observed.
    throw new AdminProxyRoutingError('Unexpected admin proxy routing query shape');
  }

  url.searchParams.delete(PRIMARY_ROUTING_PARAM);
  url.searchParams.delete(AUTO_APPENDED_ROUTING_PARAM);

  const segments = rawValue.split('/').filter((segment) => segment.length > 0);
  const fullPath = segments.length > 0 ? `${ADMIN_MOUNT_PREFIX}/${segments.join('/')}` : ADMIN_MOUNT_PREFIX;

  const remaining = url.searchParams.toString();
  const query = remaining ? `?${remaining}` : '';

  return { fullPath, query };
}
