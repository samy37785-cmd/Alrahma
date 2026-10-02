import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdminProxyRequest, ADMIN_MOUNT_PREFIX } from './resolveAdminProxyRequest.mjs';

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

test('resolveAdminProxyRequest: "path" alone (defensive -- in case Vercel ever stops auto-appending "subpath")', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=enrollments'), {
    fullPath: '/api/v1/admin/enrollments',
    query: '',
  });
});

test('resolveAdminProxyRequest: "subpath" alone (defensive -- in case "path" is ever absent)', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?subpath=enrollments'), {
    fullPath: '/api/v1/admin/enrollments',
    query: '',
  });
});

test('resolveAdminProxyRequest: multi-segment path, repeated-key serialization (?path=auth&path=login)', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=auth&path=login'), {
    fullPath: '/api/v1/admin/auth/login',
    query: '',
  });
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

test('resolveAdminProxyRequest: an empty path segment value does not produce a double slash', () => {
  // Defensive: a stray empty `path=` param should never survive into fullPath.
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path='), {
    fullPath: ADMIN_MOUNT_PREFIX,
    query: '',
  });
});

test('resolveAdminProxyRequest: a raw ".." segment survives reconstruction unsanitized (caller must still check it)', () => {
  // This function only reconstructs the path -- it is NOT a safety check.
  // isPathTraversalAttempt() (pathSafety.mjs) is still responsible for
  // rejecting this; this test just guards that reconstruction itself
  // doesn't silently swallow or mis-handle a ".." segment.
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=..%2F..%2Fhealth');
  assert.equal(result.fullPath, '/api/v1/admin/../../health');
});
