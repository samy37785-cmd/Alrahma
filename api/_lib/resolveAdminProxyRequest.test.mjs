import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdminProxyRequest, ADMIN_MOUNT_PREFIX } from './resolveAdminProxyRequest.mjs';

test('resolveAdminProxyRequest: no path param -> bare admin mount prefix, no query', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy'), {
    fullPath: ADMIN_MOUNT_PREFIX,
    query: '',
  });
});

test('resolveAdminProxyRequest: single-segment path, repeated-key serialization', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=enrollments'), {
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

test('resolveAdminProxyRequest: multi-segment path, single slash-joined value (?path=auth/login)', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=auth%2Flogin'), {
    fullPath: '/api/v1/admin/auth/login',
    query: '',
  });
});

test('resolveAdminProxyRequest: deeper nesting (three segments) works the same as two', () => {
  assert.deepEqual(resolveAdminProxyRequest('/api/v1/admin-proxy?path=teachers&path=123&path=schedule'), {
    fullPath: '/api/v1/admin/teachers/123/schedule',
    query: '',
  });
});

test('resolveAdminProxyRequest: other query params are preserved and the routing param is stripped', () => {
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=enrollments&page=2&sort=-createdAt');
  assert.equal(result.fullPath, '/api/v1/admin/enrollments');
  // Order of remaining params is not load-bearing -- just assert both survive.
  assert.ok(result.query.startsWith('?'));
  assert.ok(result.query.includes('page=2'));
  assert.ok(result.query.includes('sort=-createdAt'));
  assert.ok(!result.query.includes('path='));
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
  const result = resolveAdminProxyRequest('/api/v1/admin-proxy?path=..&path=..&path=health');
  assert.equal(result.fullPath, '/api/v1/admin/../../health');
});
