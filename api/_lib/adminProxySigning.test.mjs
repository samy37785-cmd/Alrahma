import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  isValidSigningSecret,
  hashBody,
  computeSignature,
  buildSignedHeaders,
  extractTrustedClientIp,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  CLIENT_IP_HEADER,
} from './adminProxySigning.mjs';

// Cross-implementation contract test: this repo intentionally has TWO
// independent implementations of the same HMAC scheme (this one, bundled
// into the Vercel Function; backend/config/adminProxySigning.js, run by
// Render). They must interoperate — this is the test that would catch the
// two silently drifting apart.
import { verifyAdminProxySignature } from '../../backend/config/adminProxySigning.js';

const SECRET_HEX = crypto.randomBytes(32).toString('hex'); // test-only

test('isValidSigningSecret: accepts a 32+ hex-char string, rejects short/non-hex/missing', () => {
  assert.equal(isValidSigningSecret(SECRET_HEX), true);
  assert.equal(isValidSigningSecret('too-short'), false);
  assert.equal(isValidSigningSecret('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), false); // not hex
  assert.equal(isValidSigningSecret(undefined), false);
  assert.equal(isValidSigningSecret(''), false);
});

test('hashBody: empty and non-empty buffers hash as expected sha256', () => {
  assert.equal(hashBody(Buffer.alloc(0)), crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  assert.equal(hashBody(undefined), crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  const buf = Buffer.from('{"status":"active"}');
  assert.equal(hashBody(buf), crypto.createHash('sha256').update(buf).digest('hex'));
});

test('computeSignature: deterministic HMAC-SHA256 over the canonical string (no query)', () => {
  const secretBuf = Buffer.from(SECRET_HEX, 'hex');
  const params = { method: 'GET', path: '/api/v1/admin/enrollments', query: '', clientIp: '203.0.113.9', timestamp: 1234567890, bodyHash: hashBody(Buffer.alloc(0)) };
  const expected = crypto.createHmac('sha256', secretBuf)
    .update(`GET\n/api/v1/admin/enrollments\n\n203.0.113.9\n1234567890\n${params.bodyHash}`)
    .digest('hex');
  assert.equal(computeSignature(secretBuf, params), expected);
});

test('computeSignature: a non-empty query string is bound into the signature', () => {
  const secretBuf = Buffer.from(SECRET_HEX, 'hex');
  const params = { method: 'GET', path: '/enrollments', query: '?page=2', clientIp: '203.0.113.9', timestamp: 1234567890, bodyHash: hashBody(Buffer.alloc(0)) };
  const expected = crypto.createHmac('sha256', secretBuf)
    .update(`GET\n/enrollments\n?page=2\n203.0.113.9\n1234567890\n${params.bodyHash}`)
    .digest('hex');
  assert.equal(computeSignature(secretBuf, params), expected);
  // And changing only the query must change the signature.
  const withDifferentQuery = computeSignature(secretBuf, { ...params, query: '?page=3' });
  assert.notEqual(withDifferentQuery, expected);
});

test('buildSignedHeaders: returns null when the secret is missing or invalid (unsigned pass-through mode)', () => {
  assert.equal(buildSignedHeaders({ secretHex: undefined, method: 'GET', path: '/api/v1/admin/enrollments', clientIp: '203.0.113.9', rawBody: Buffer.alloc(0) }), null);
  assert.equal(buildSignedHeaders({ secretHex: 'not-hex', method: 'GET', path: '/api/v1/admin/enrollments', clientIp: '203.0.113.9', rawBody: Buffer.alloc(0) }), null);
});

test('buildSignedHeaders: returns exactly the three signed headers when the secret is valid', () => {
  const headers = buildSignedHeaders({ secretHex: SECRET_HEX, method: 'POST', path: '/api/v1/admin/enrollments/abc', clientIp: '203.0.113.9', rawBody: Buffer.from('{}') });
  assert.ok(headers);
  assert.equal(Object.keys(headers).sort().join(','), [CLIENT_IP_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER].sort().join(','));
  assert.equal(headers[CLIENT_IP_HEADER], '203.0.113.9');
  assert.match(headers[SIGNATURE_HEADER], /^[0-9a-f]{64}$/);
});

test('cross-implementation: a request signed here verifies successfully against the Render-side implementation', () => {
  process.env.ADMIN_PROXY_SIGNING_SECRET = SECRET_HEX;
  try {
    const method  = 'PUT';
    // Path AS Express's req.path sees it inside the mounted admin router —
    // i.e. with /api/v1/admin already stripped (see ADMIN_MOUNT_PREFIX in
    // api/_lib/resolveAdminProxyRequest.mjs, consumed by
    // api/v1/admin-proxy.mjs). This is the exact value both ends must
    // agree on for the signature to verify.
    const path    = '/enrollments/abc123';
    const clientIp = '203.0.113.9';
    const rawBody  = Buffer.from(JSON.stringify({ status: 'active' }));

    const headers = buildSignedHeaders({ secretHex: SECRET_HEX, method, path, clientIp, rawBody });
    const result = verifyAdminProxySignature({ headers, method, path, rawBody });

    assert.deepEqual(result, { ok: true, clientIp });
  } finally {
    delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  }
});

test('cross-implementation: tampering the body after Vercel signs it is caught by the Render-side verifier', () => {
  process.env.ADMIN_PROXY_SIGNING_SECRET = SECRET_HEX;
  try {
    const method   = 'PUT';
    const path     = '/enrollments/abc123';
    const clientIp = '203.0.113.9';
    const original  = Buffer.from(JSON.stringify({ status: 'active' }));
    const tampered  = Buffer.from(JSON.stringify({ status: 'cancelled' }));

    const headers = buildSignedHeaders({ secretHex: SECRET_HEX, method, path, clientIp, rawBody: original });
    const result = verifyAdminProxySignature({ headers, method, path, rawBody: tampered });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  } finally {
    delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  }
});

test('cross-implementation: a request signed here with a query string verifies successfully against the Render-side implementation', () => {
  process.env.ADMIN_PROXY_SIGNING_SECRET = SECRET_HEX;
  try {
    const method   = 'GET';
    const path     = '/enrollments';
    const query    = '?page=2&limit=50';
    const clientIp = '203.0.113.9';
    const rawBody  = Buffer.alloc(0);

    const headers = buildSignedHeaders({ secretHex: SECRET_HEX, method, path, query, clientIp, rawBody });
    const result = verifyAdminProxySignature({ headers, method, path, query, rawBody });

    assert.deepEqual(result, { ok: true, clientIp });
  } finally {
    delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  }
});

test('cross-implementation: a query string rewritten in transit is caught by the Render-side verifier', () => {
  process.env.ADMIN_PROXY_SIGNING_SECRET = SECRET_HEX;
  try {
    const method   = 'GET';
    const path     = '/enrollments';
    const clientIp = '203.0.113.9';
    const rawBody  = Buffer.alloc(0);

    const headers = buildSignedHeaders({ secretHex: SECRET_HEX, method, path, query: '?page=1', clientIp, rawBody });
    // Render observes a different query string than what Vercel signed.
    const result = verifyAdminProxySignature({ headers, method, path, query: '?page=2', rawBody });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  } finally {
    delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  }
});

test('extractTrustedClientIp: takes the first x-forwarded-for entry, trimmed', () => {
  assert.equal(extractTrustedClientIp({ 'x-forwarded-for': '203.0.113.9, 198.51.100.1' }), '203.0.113.9');
  assert.equal(extractTrustedClientIp({ 'x-forwarded-for': ' 203.0.113.9 ' }), '203.0.113.9');
  assert.equal(extractTrustedClientIp({}), '');
});
