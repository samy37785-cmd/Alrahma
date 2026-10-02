import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import handler from './admin-proxy.mjs';
import { verifyAdminProxySignature } from '../../backend/config/adminProxySigning.js';

/**
 * No real network call is ever made -- global.fetch is stubbed for every
 * test in this file and restored after. These tests exercise the full
 * handler (resolveAdminProxyRequest -> traversal/collision checks ->
 * HMAC signing -> outgoing fetch -> response relay) without a real Render
 * origin, a real login, or any network I/O.
 */

const VALID_SECRET_HEX = 'a'.repeat(64); // 32 bytes, well-formed hex

function mockRequest({ url, method = 'GET', headers = {}, body = Buffer.alloc(0) }) {
  const stream = body.length ? Readable.from([body]) : Readable.from([]);
  stream.url = url;
  stream.method = method;
  stream.headers = headers;
  return stream;
}

function mockResponse() {
  const headers = new Map();
  const res = {
    statusCode: 200,
    _body: null,
    _ended: false,
    setHeader(key, value) {
      headers.set(key.toLowerCase(), value);
    },
    getHeaders() {
      return headers;
    },
    end(body) {
      res._body = body;
      res._ended = true;
    },
  };
  return res;
}

function stubFetch(responseFactory) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return responseFactory(url, init);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test('admin-proxy handler: multi-segment POST -- method, target URL, raw body, and independently-verifiable HMAC are all correct', async () => {
  process.env.ADMIN_PROXY_SIGNING_SECRET = VALID_SECRET_HEX;
  const rawBodyBytes = Buffer.from(JSON.stringify({ email: 'admin@example.com', password: 'does-not-matter-here' }));

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('content-type', 'application/json; charset=utf-8');
  upstreamHeaders.append('set-cookie', 'admin_session=abc; HttpOnly; Path=/');
  upstreamHeaders.append('set-cookie', 'csrf=def; Path=/');
  const fetchStub = stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200, headers: upstreamHeaders }));

  try {
    const req = mockRequest({
      // The real shape produced by the ":subpath(.*)" rewrite for
      // POST /api/v1/admin/auth/login.
      url: '/api/v1/admin-proxy?path=auth%2Flogin&subpath=auth%2Flogin',
      method: 'POST',
      headers: {
        host: 'al-rahmaacademy.com',
        connection: 'keep-alive',
        'content-length': String(rawBodyBytes.length),
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.9, 70.41.3.18',
        // A caller spoofing the reserved proxy headers directly -- these
        // must never reach Render; only this function's own freshly
        // computed values may.
        'x-admin-proxy-ip': '1.2.3.4',
        'x-admin-proxy-timestamp': '1',
        'x-admin-proxy-signature': 'forged',
      },
      body: rawBodyBytes,
    });
    const res = mockResponse();

    await handler(req, res);

    assert.equal(fetchStub.calls.length, 1, 'expected exactly one upstream fetch call');
    const [{ url: targetUrl, init }] = fetchStub.calls;

    // Target URL: method, path, and query are all exactly right.
    assert.equal(targetUrl, 'https://academy-backend-cxso.onrender.com/api/v1/admin/auth/login');
    assert.equal(init.method, 'POST');

    // Raw body forwarded byte-for-byte, not re-serialized.
    assert.ok(Buffer.isBuffer(init.body) || init.body instanceof Uint8Array);
    assert.deepEqual(Buffer.from(init.body), rawBodyBytes);

    // Reserved headers from the client are never forwarded; only this
    // function's own computed ones (and they carry the real values).
    const forwarded = init.headers;
    assert.equal(forwarded.get('x-admin-proxy-ip'), '203.0.113.9'); // from x-forwarded-for, not the spoofed '1.2.3.4'
    assert.notEqual(forwarded.get('x-admin-proxy-timestamp'), '1');
    assert.notEqual(forwarded.get('x-admin-proxy-signature'), 'forged');
    // Hop-by-hop headers stripped.
    assert.equal(forwarded.has('host'), false);
    assert.equal(forwarded.has('connection'), false);
    assert.equal(forwarded.has('content-length'), false);

    // The signature this function computed must verify successfully
    // against the backend's OWN, independent implementation --
    // cross-verification, not just "a header was set".
    const verifyResult = verifyAdminProxySignature({
      headers: {
        'x-admin-proxy-ip': forwarded.get('x-admin-proxy-ip'),
        'x-admin-proxy-timestamp': forwarded.get('x-admin-proxy-timestamp'),
        'x-admin-proxy-signature': forwarded.get('x-admin-proxy-signature'),
      },
      method: 'POST',
      path: '/auth/login', // ADMIN_MOUNT_PREFIX stripped, matching Express's req.path
      query: '',
      rawBody: rawBodyBytes,
    });
    assert.deepEqual(verifyResult, { ok: true, clientIp: '203.0.113.9' });

    // Response relay: status, content-type, and EVERY Set-Cookie preserved
    // as distinct headers (never comma-merged).
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeaders().get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(res.getHeaders().get('set-cookie'), [
      'admin_session=abc; HttpOnly; Path=/',
      'csrf=def; Path=/',
    ]);
    assert.equal(res._ended, true);
    assert.equal(Buffer.from(res._body).toString('utf8'), JSON.stringify({ ok: true }));
  } finally {
    fetchStub.restore();
    delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  }
});

test('admin-proxy handler: a path-traversal attempt never reaches fetch()', async () => {
  const fetchStub = stubFetch(() => {
    throw new Error('fetch must not be called for a traversal attempt');
  });
  try {
    const req = mockRequest({
      url: '/api/v1/admin-proxy?path=..%2F..%2Fhealth&subpath=..%2F..%2Fhealth',
      method: 'GET',
      headers: {},
    });
    const res = mockResponse();

    await handler(req, res);

    assert.equal(fetchStub.calls.length, 0);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res._body).message, 'Invalid path');
  } finally {
    fetchStub.restore();
  }
});

test('admin-proxy handler: a query-routing collision (forged "path" with no matching "subpath") never reaches fetch()', async () => {
  const fetchStub = stubFetch(() => {
    throw new Error('fetch must not be called for an ambiguous routing query');
  });
  try {
    // The live-reproduced attack: the bare /api/v1/admin exact-literal
    // rule forwards a client's own "path" query param completely
    // unopposed. Must be rejected before any upstream call.
    const req = mockRequest({
      url: '/api/v1/admin-proxy?path=some-other-admin-route',
      method: 'GET',
      headers: {},
    });
    const res = mockResponse();

    await handler(req, res);

    assert.equal(fetchStub.calls.length, 0);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res._body).message, 'Invalid request routing');
  } finally {
    fetchStub.restore();
  }
});

test('admin-proxy handler: a query-routing collision ("path" and "subpath" disagree) never reaches fetch()', async () => {
  const fetchStub = stubFetch(() => {
    throw new Error('fetch must not be called for an ambiguous routing query');
  });
  try {
    const req = mockRequest({
      url: '/api/v1/admin-proxy?path=client-a&subpath=client-b',
      method: 'GET',
      headers: {},
    });
    const res = mockResponse();

    await handler(req, res);

    assert.equal(fetchStub.calls.length, 0);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res._body).message, 'Invalid request routing');
  } finally {
    fetchStub.restore();
  }
});

test('admin-proxy handler: bare GET (no routing query at all) forwards to the bare admin path, unsigned when the secret is unset', async () => {
  delete process.env.ADMIN_PROXY_SIGNING_SECRET;
  const fetchStub = stubFetch(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  try {
    const req = mockRequest({ url: '/api/v1/admin-proxy', method: 'GET', headers: {} });
    const res = mockResponse();

    await handler(req, res);

    assert.equal(fetchStub.calls.length, 1);
    const [{ url: targetUrl, init }] = fetchStub.calls;
    assert.equal(targetUrl, 'https://academy-backend-cxso.onrender.com/api/v1/admin');
    assert.equal(init.headers.has('x-admin-proxy-signature'), false);
  } finally {
    fetchStub.restore();
  }
});
