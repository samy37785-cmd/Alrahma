import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import app from '../app.js';
import logger from '../config/logger.js';
import { computeSignature, hashBody, CLIENT_IP_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER } from '../config/adminProxySigning.js';
import {
  verifyPublicProxySignature,
  PUBLIC_CLIENT_IP_HEADER,
  PUBLIC_TIMESTAMP_HEADER,
  PUBLIC_SIGNATURE_HEADER,
  PUBLIC_MAX_SKEW_MS,
} from '../config/publicProxySigning.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// The trial/booking form proxy (api/v1/trials-proxy.mjs,
// api/v1/enrollments-proxy.mjs) signs the visitor's IP. This file proves, on
// the real app, that only a fully valid signature makes the limiters count
// per visitor, and that everything else keys on req.ip exactly as before.
// Requests carry an empty-object body, which the trial validation rejects
// (400): nothing is stored and no email is sent, but each one still counts
// toward the trial limiter.

const SECRET_HEX = crypto.randomBytes(32).toString('hex'); // test-only
const BODY = '{}';

before(async () => {
  process.env.PUBLIC_PROXY_SIGNING_SECRET = SECRET_HEX;
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => {
  delete process.env.PUBLIC_PROXY_SIGNING_SECRET;
  await teardownTestDb();
});

function signFor(clientIp, { secretHex = SECRET_HEX, body = BODY, timestamp = Date.now(), path = '/api/trials' } = {}) {
  const signature = computeSignature({
    secret: Buffer.from(secretHex, 'hex'),
    method: 'POST',
    path,
    query: '',
    clientIp,
    timestamp,
    bodyHash: hashBody(Buffer.from(body)),
  });
  return {
    [PUBLIC_CLIENT_IP_HEADER]: clientIp,
    [PUBLIC_TIMESTAMP_HEADER]: String(timestamp),
    [PUBLIC_SIGNATURE_HEADER]: signature,
  };
}

// `vercel` is the address Render sees as req.ip (trust proxy = 1 keys on the
// right-most X-Forwarded-For entry); each test uses its own.
async function postTrial({ vercel, headers = {}, body = BODY }) {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/trials')
    .set(csrf)
    .set('X-Forwarded-For', vercel)
    .set(headers)
    .set('Content-Type', 'application/json')
    .send(body);
  assert.equal(res.status, 400, `expected the validation 400, got ${res.status}`);
  return { remaining: Number(res.headers['ratelimit-remaining']), limit: Number(res.headers['ratelimit-limit']) };
}

test('with the secret set, each signed visitor behind one Vercel address gets their own budget', async () => {
  const vercel = '198.51.100.11';
  const a1 = await postTrial({ vercel, headers: signFor('203.0.113.1') });
  const b1 = await postTrial({ vercel, headers: signFor('203.0.113.2') });
  const a2 = await postTrial({ vercel, headers: signFor('203.0.113.1') });
  assert.equal(a1.remaining, a1.limit - 1);
  assert.equal(b1.remaining, b1.limit - 1, 'visitor B must not spend visitor A\'s budget');
  assert.equal(a2.remaining, a1.limit - 2);
  // The shared Vercel address itself was never charged.
  const unsigned = await postTrial({ vercel });
  assert.equal(unsigned.remaining, unsigned.limit - 1);
});

test('unsigned requests key on req.ip, as before', async () => {
  const vercel = '198.51.100.12';
  const first = await postTrial({ vercel });
  const second = await postTrial({ vercel });
  assert.equal(second.remaining, first.remaining - 1);
});

for (const [i, [name, makeHeaders, makeBody]] of [
  ['a forged signature', () => ({ ...signFor('203.0.113.20'), [PUBLIC_SIGNATURE_HEADER]: 'ab'.repeat(32) }), () => BODY],
  ['a body changed after signing', () => signFor('203.0.113.21'), () => '{"name":"x"}'],
  ['a stale timestamp', () => signFor('203.0.113.22', { timestamp: Date.now() - PUBLIC_MAX_SKEW_MS - 5_000 }), () => BODY],
  ['a signature for another path', () => signFor('203.0.113.23', { path: '/api/enrollments' }), () => BODY],
  ['a signature made with another secret', () => signFor('203.0.113.24', { secretHex: 'c'.repeat(64) }), () => BODY],
].entries()) {
  test(`${name} is not trusted: the request keys on req.ip, and only a reason code is logged`, async (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    const vercel = `198.51.100.${40 + i}`;
    const first = await postTrial({ vercel, headers: makeHeaders(), body: makeBody() });
    const second = await postTrial({ vercel });
    assert.equal(second.remaining, first.remaining - 1, 'both requests must share the req.ip bucket');
    const calls = warn.mock.calls.filter((c) => c.arguments[0] === 'Public proxy signature verification failed');
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0].arguments[1]), ['reason']);
    assert.ok(!JSON.stringify(calls[0].arguments).includes('203.0.113'));
  });
}

test('the admin proxy\'s headers are not accepted as a public signature', async () => {
  const vercel = '198.51.100.60';
  const pub = signFor('203.0.113.30');
  const first = await postTrial({
    vercel,
    headers: {
      [CLIENT_IP_HEADER]: pub[PUBLIC_CLIENT_IP_HEADER],
      [TIMESTAMP_HEADER]: pub[PUBLIC_TIMESTAMP_HEADER],
      [SIGNATURE_HEADER]: pub[PUBLIC_SIGNATURE_HEADER],
    },
  });
  const second = await postTrial({ vercel });
  assert.equal(second.remaining, first.remaining - 1);
});

test('without the secret nothing is trusted, even a correctly signed request, and nothing is logged', async (t) => {
  const warn = t.mock.method(logger, 'warn', () => {});
  const saved = process.env.PUBLIC_PROXY_SIGNING_SECRET;
  delete process.env.PUBLIC_PROXY_SIGNING_SECRET;
  try {
    const vercel = '198.51.100.61';
    const first = await postTrial({ vercel, headers: signFor('203.0.113.31') });
    const second = await postTrial({ vercel, headers: signFor('203.0.113.32') });
    assert.equal(second.remaining, first.remaining - 1);
    assert.equal(warn.mock.calls.filter((c) => c.arguments[0] === 'Public proxy signature verification failed').length, 0);
  } finally {
    process.env.PUBLIC_PROXY_SIGNING_SECRET = saved;
  }
});

test('verifyPublicProxySignature: a malformed secret counts as unset', () => {
  const saved = process.env.PUBLIC_PROXY_SIGNING_SECRET;
  process.env.PUBLIC_PROXY_SIGNING_SECRET = 'not-hex';
  try {
    const result = verifyPublicProxySignature({ headers: signFor('203.0.113.40'), method: 'POST', path: '/api/trials', rawBody: Buffer.from(BODY) });
    assert.deepEqual(result, { ok: false, reason: 'secret_unavailable' });
  } finally {
    process.env.PUBLIC_PROXY_SIGNING_SECRET = saved;
  }
});

test('verifyPublicProxySignature: a valid signature returns the signed IP', () => {
  const result = verifyPublicProxySignature({ headers: signFor('203.0.113.41'), method: 'POST', path: '/api/trials', rawBody: Buffer.from(BODY) });
  assert.deepEqual(result, { ok: true, clientIp: '203.0.113.41' });
});
