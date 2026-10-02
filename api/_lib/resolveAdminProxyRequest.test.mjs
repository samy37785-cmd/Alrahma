import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdminProxyRequest, ADMIN_MOUNT_PREFIX, AdminProxyRoutingError } from './resolveAdminProxyRequest.mjs';

test('resolveAdminProxyRequest: no routing param at all -> bare admin mount prefix, no query (the exact-literal rewrite rule case)', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy'), {
    fullPath: ADMIN_MOUNT_PREFIX,
    query: '',
  });
});

test('resolveAdminProxyRequest: the real vercel.json format -- both "path" and "subpath" carry the same value', () => {
  // Confirmed empirically against a real Preview deployment: Vercel's
  // named-parameter rewrite ("/api/v1/admin/:subpath(.*)" ->
  // "/api/v1/admin-proxy?path=:subpath") produces BOTH query keys --
  // "path" from the literal destination text, and "subpath" auto-appended
  // by Vercel under the parameter's own name regardless. Both must be
  // consumed and stripped; neither may leak through to Render.
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=auth%2Flogin&subpath=auth%2Flogin');
  assert.equal(result.fullPath, '/api/v1/admin/auth/login');
  assert.equal(result.query, '');
});

test('resolveAdminProxyRequest: deeper nesting (three segments) works the same as two', () => {
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=teachers%2F123%2Fschedule&subpath=teachers%2F123%2Fschedule');
  assert.equal(result.fullPath, '/api/v1/admin/teachers/123/schedule');
  assert.equal(result.query, '');
});

test('resolveAdminProxyRequest: other query params are preserved, both routing params are stripped', () => {
  const result = resolveAdminProxyRequest(
    '/api/v1/admin-proxy?path=enrollments&subpath=enrollments&page=2&sort=-createdAt'
  );
  assert.equal(result.fullPath, '/api/v1/admin/enrollments');
  // Order of remaining params is not load-bearing -- just assert both survive.
  assert.ok(result.query.startsWith('?'));
  assert.ok(result.query.includes('page=2'));
  assert.ok(result.query.includes('sort=-createdAt'));
  assert.ok(!result.query.includes('path='));
  assert.ok(!result.query.includes('subpath='));
});

test('resolveAdminProxyRequest: zero-segment request with other query params keeps them', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?debug=1'), {
    fullPath: ADMIN_MOUNT_PREFIX,
    query: '?debug=1',
  });
});

test('resolveAdminProxyRequest: both keys present but empty (legitimate trailing-slash capture) -> bare path', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=&subpath='), {
    fullPath: ADMIN_MOUNT_PREFIX,
    query: '',
  });
});

test('resolveAdminProxyRequest: a raw ".." segment survives reconstruction unsanitized (caller must still check it)', () => {
  // This function only reconstructs the path -- it is NOT a safety check.
  // isPathTraversalAttempt() (pathSafety.mjs) is still responsible for
  // rejecting this; this test just guards that reconstruction itself
  // doesn't silently swallow or mis-handle a ".." segment. Both keys must
  // still agree, exactly as any other legitimate request would arrive.
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=..%2F..%2Fhealth&subpath=..%2F..%2Fhealth');
  assert.equal(result.fullPath, '/api/v1/admin/../../health');
});

// --- Query-routing collision: fail-closed behavior -----------------------
//
// Confirmed live against a real Preview deployment (see the PR
// description) that a client appending its own "path"/"subpath" to a URL
// matching the ":subpath(.*)" rewrite never survives -- Vercel's own
// captured value silently overwrites it, so legitimate traffic always
// arrives here as either "neither key" or "both keys, identical value".
// Anything else is therefore evidence of either a direct, non-rewritten
// call to this function's own public URL, or some other rewrite shape
// this function has never been proven to receive -- reject it rather than
// guess which value (if any) is the "real" one.

test('resolveAdminProxyRequest: "path" alone, no "subpath" -- rejected (this is exactly what the bare /api/v1/admin exact-literal rule lets a client forge)', () => {
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?path=enrollments'),
    AdminProxyRoutingError
  );
});

test('resolveAdminProxyRequest: "subpath" alone, no "path" -- rejected', () => {
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?subpath=enrollments'),
    AdminProxyRoutingError
  );
});

test('resolveAdminProxyRequest: "path" and "subpath" both present but disagreeing -- rejected', () => {
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?path=client-a&subpath=client-b'),
    AdminProxyRoutingError
  );
});

test('resolveAdminProxyRequest: repeated "path" key -- rejected, never treated as multiple segments', () => {
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?path=auth&path=login&subpath=auth'),
    AdminProxyRoutingError
  );
});

test('resolveAdminProxyRequest: repeated "subpath" key, "path" absent -- rejected', () => {
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?subpath=auth&subpath=login'),
    AdminProxyRoutingError
  );
});

test('resolveAdminProxyRequest: the live-reproduced attack -- bare /api/v1/admin + a client-forged "path" -- rejected, not silently routed to the forged path', () => {
  // This exact request (GET /api/v1/admin?path=MARKD) was verified live:
  // without this check, Render received "GET /api/v1/admin/MARKD" --
  // i.e. the client fully controlled the destination sub-path by hitting
  // the supposedly-fixed bare endpoint.
  assert.throws(
    () => resolveAdminProxyRequest('/api/v1/admin-proxy?path=MARKD'),
    AdminProxyRoutingError
  );
});
