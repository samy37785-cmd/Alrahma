import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import trialsHandler from './trials-proxy.mjs';
import enrollmentsHandler from './enrollments-proxy.mjs';
import { buildPublicSignedHeaders } from '../_lib/publicProxySigning.mjs';
import { verifyPublicProxySignature } from '../../backend/config/publicProxySigning.js';

/**
 * The trial/booking form proxies (see docs/public-proxy-signing-runbook.md).
 * global.fetch is stubbed in every test: no network call, no real form is
 * ever sent.
 */

const SECRET_HEX = 'b'.repeat(64); // test-only

function mockRequest({ url, method = 'POST', headers = {}, body = Buffer.alloc(0) }) {
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
    setHeader(key, value) { headers.set(key.toLowerCase(), value); },
    getHeaders() { return headers; },
    end(body) { res._body = body; },
  };
  return res;
}

async function withFetch(responseFactory, fn) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return responseFactory(url, init);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

async function withSecret(value, fn) {
  const prev = process.env.PUBLIC_PROXY_SIGNING_SECRET;
  if (value === undefined) delete process.env.PUBLIC_PROXY_SIGNING_SECRET;
  else process.env.PUBLIC_PROXY_SIGNING_SECRET = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_PROXY_SIGNING_SECRET;
    else process.env.PUBLIC_PROXY_SIGNING_SECRET = prev;
  }
}

const SPOOFED = {
  'x-public-proxy-ip': '1.2.3.4',
  'x-public-proxy-timestamp': '1',
  'x-public-proxy-signature': 'forged',
  'x-admin-proxy-ip': '5.6.7.8',
  'x-admin-proxy-timestamp': '1',
  'x-admin-proxy-signature': 'forged',
};

for (const [name, handler, target] of [
  ['trials', trialsHandler, '/api/trials'],
  ['enrollments', enrollmentsHandler, '/api/enrollments'],
]) {
  test(`${name} proxy: fixed target, query dropped, raw body, and a signature the backend verifies`, async () => {
    const body = Buffer.from(JSON.stringify({ name: 'Test', email: 'test@example.com' }));
    const upstreamHeaders = new Headers({ 'content-type': 'application/json; charset=utf-8' });
    upstreamHeaders.append('set-cookie', 'csrf_token=abc; Path=/');
    upstreamHeaders.append('set-cookie', 'other=def; Path=/');

    await withSecret(SECRET_HEX, () => withFetch(
      () => new Response(JSON.stringify({ ok: true }), { status: 201, headers: upstreamHeaders }),
      async (calls) => {
        const res = mockResponse();
        await handler(mockRequest({
          // A caller-added query must not change where the request goes.
          url: `/api/v1/${name}-proxy?path=v1/admin/users&x=1`,
          headers: {
            host: 'al-rahmaacademy.com',
            connection: 'keep-alive',
            'content-length': String(body.length),
            'content-type': 'application/json',
            'x-csrf-token': 'tok',
            cookie: 'csrf_token=tok',
            'x-forwarded-for': '203.0.113.9, 70.41.3.18',
            ...SPOOFED,
          },
          body,
        }), res);

        assert.equal(calls.length, 1);
        const [{ url, init }] = calls;
        assert.equal(url, `https://academy-backend-cxso.onrender.com${target}`);
        assert.equal(init.method, 'POST');
        assert.deepEqual(Buffer.from(init.body), body);

        const fwd = init.headers;
        // CSRF cookie and header pass through; hop-by-hop headers do not.
        assert.equal(fwd.get('x-csrf-token'), 'tok');
        assert.equal(fwd.get('cookie'), 'csrf_token=tok');
        for (const h of ['host', 'connection', 'content-length']) assert.equal(fwd.has(h), false, h);
        // The caller's copies of the reserved headers never reach Render.
        assert.equal(fwd.get('x-public-proxy-ip'), '203.0.113.9');
        assert.notEqual(fwd.get('x-public-proxy-signature'), 'forged');
        for (const h of ['x-admin-proxy-ip', 'x-admin-proxy-timestamp', 'x-admin-proxy-signature']) assert.equal(fwd.has(h), false, h);

        // Cross-check against the backend's own verifier.
        const verified = verifyPublicProxySignature({
          headers: Object.fromEntries(fwd.entries()),
          method: 'POST',
          path: target,
          query: '',
          rawBody: body,
        });
        assert.deepEqual(verified, { ok: true, clientIp: '203.0.113.9' });

        assert.equal(res.statusCode, 201);
        assert.deepEqual(res.getHeaders().get('set-cookie'), ['csrf_token=abc; Path=/', 'other=def; Path=/']);
        assert.equal(res.getHeaders().get('content-type'), 'application/json; charset=utf-8');
      },
    ));
  });
}

test('without the secret: forwarded unsigned, and spoofed proxy headers still dropped', async () => {
  await withSecret(undefined, () => withFetch(() => new Response('{}', { status: 400 }), async (calls) => {
    const res = mockResponse();
    await trialsHandler(mockRequest({
      url: '/api/v1/trials-proxy',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...SPOOFED },
      body: Buffer.from('{}'),
    }), res);
    const fwd = calls[0].init.headers;
    for (const h of Object.keys(SPOOFED)) assert.equal(fwd.has(h), false, h);
    assert.equal(res.statusCode, 400);
  }));
});

test('an unreachable backend gives a plain 502 with no details', async () => {
  await withSecret(SECRET_HEX, () => withFetch(() => { throw new Error('connect ECONNREFUSED 10.0.0.1:443'); }, async () => {
    const res = mockResponse();
    await enrollmentsHandler(mockRequest({ url: '/api/v1/enrollments-proxy', headers: { 'x-forwarded-for': '203.0.113.9' }, body: Buffer.from('{}') }), res);
    assert.equal(res.statusCode, 502);
    assert.equal(res._body, JSON.stringify({ message: 'Upstream unavailable' }));
  }));
});

test('buildPublicSignedHeaders: nothing without a valid secret or a client IP', () => {
  const args = { method: 'POST', path: '/api/trials', clientIp: '203.0.113.9', rawBody: Buffer.from('{}') };
  assert.equal(buildPublicSignedHeaders({ ...args, secretHex: undefined }), null);
  assert.equal(buildPublicSignedHeaders({ ...args, secretHex: 'short' }), null);
  assert.equal(buildPublicSignedHeaders({ ...args, secretHex: SECRET_HEX, clientIp: '' }), null);
  assert.ok(buildPublicSignedHeaders({ ...args, secretHex: SECRET_HEX }));
});
