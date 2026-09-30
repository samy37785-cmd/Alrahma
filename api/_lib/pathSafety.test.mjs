import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPathTraversalAttempt } from './pathSafety.mjs';

test('isPathTraversalAttempt: normal admin paths are not flagged', () => {
  assert.equal(isPathTraversalAttempt('/api/v1/admin/enrollments'), false);
  assert.equal(isPathTraversalAttempt('/api/v1/admin/enrollments/abc-123'), false);
  assert.equal(isPathTraversalAttempt('/api/v1/admin'), false);
});

test('isPathTraversalAttempt: a raw ".." segment is flagged', () => {
  assert.equal(isPathTraversalAttempt('/api/v1/admin/../../health'), true);
  assert.equal(isPathTraversalAttempt('/api/v1/admin/enrollments/..'), true);
});

test('isPathTraversalAttempt: a percent-encoded ".." segment is flagged after decoding', () => {
  assert.equal(isPathTraversalAttempt('/api/v1/admin/%2e%2e/%2e%2e/health'), true);
  assert.equal(isPathTraversalAttempt('/api/v1/admin/%2E%2E/health'), true);
});

test('isPathTraversalAttempt: malformed percent-encoding fails closed (rejected)', () => {
  assert.equal(isPathTraversalAttempt('/api/v1/admin/%'), true);
});

test('isPathTraversalAttempt: a legitimate segment that merely contains dots is not flagged', () => {
  assert.equal(isPathTraversalAttempt('/api/v1/admin/blog/my..post'), false);
  assert.equal(isPathTraversalAttempt('/api/v1/admin/system/v1.2.3'), false);
});
