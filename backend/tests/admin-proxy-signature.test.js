import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  computeSignature,
  verifyAdminProxySignature,
  hashBody,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  CLIENT_IP_HEADER,
  MAX_SKEW_MS,
} from '../config/adminProxySigning.js';
import { adminProxySignature } from '../middleware/adminProxySignature.js';

const SECRET_HEX = crypto.randomBytes(32).toString('hex'); // test-only, never a real secret

// Always async (and always awaited by callers) so the finally-restore can
// never run before fn's own assertions have finished.
async function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function sign({ secretHex = SECRET_HEX, method = 'GET', path = '/enrollments', query = '', clientIp = '203.0.113.9', timestamp = Date.now(), body = Buffer.alloc(0) }) {
  const secret = Buffer.from(secretHex, 'hex');
  const bodyHash = hashBody(body);
  const signature = computeSignature({ secret, method, path, query, clientIp, timestamp, bodyHash });
  return {
    headers: {
      [CLIENT_IP_HEADER]: clientIp,
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: signature,
    },
    method, path, query, clientIp, timestamp, body,
    // adminProxySignature.js derives query from req.url (mount-relative,
    // like req.path but with the query string still attached) — this is
    // what any req object fed to the middleware directly must carry.
    url: path + query,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

// ── verifyAdminProxySignature (pure) ────────────────────────────────────────

test('verifyAdminProxySignature: valid HMAC succeeds and returns the signed clientIp', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({});
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.deepEqual(result, { ok: true, clientIp: req.clientIp });
  });
});

test('verifyAdminProxySignature: valid HMAC with a real query string succeeds', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ path: '/enrollments', query: '?page=2&limit=50' });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.deepEqual(result, { ok: true, clientIp: req.clientIp });
  });
});

test('verifyAdminProxySignature: a forged signature fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({});
    req.headers[SIGNATURE_HEADER] = crypto.randomBytes(32).toString('hex'); // garbage, same length
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a changed clientIp after signing fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({});
    req.headers[CLIENT_IP_HEADER] = '198.51.100.50'; // different from what was signed
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a changed method fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ method: 'GET' });
    const result = verifyAdminProxySignature({ headers: req.headers, method: 'POST', path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a changed path fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ path: '/enrollments' });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: '/users', query: req.query, rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a changed query string fails (e.g. page=1 rewritten to page=2)', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ path: '/enrollments', query: '?page=1' });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: '?page=2', rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a query string added to a request signed with none fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ path: '/enrollments', query: '' });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: '?admin_only=true', rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: a changed body fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = sign({ body: Buffer.from(JSON.stringify({ status: 'active' })) });
    const tamperedBody = Buffer.from(JSON.stringify({ status: 'cancelled' }));
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: tamperedBody, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('verifyAdminProxySignature: an expired timestamp fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const ts = Date.now() - (MAX_SKEW_MS + 5_000);
    const req = sign({ timestamp: ts });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: Date.now() });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timestamp_out_of_range');
  });
});

test('verifyAdminProxySignature: a future timestamp fails', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const ts = Date.now() + (MAX_SKEW_MS + 5_000);
    const req = sign({ timestamp: ts });
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: Date.now() });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timestamp_out_of_range');
  });
});

test('verifyAdminProxySignature: a forged header sent directly with no secret configured never succeeds', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: undefined }, () => {
    const req = sign({ secretHex: crypto.randomBytes(32).toString('hex') }); // attacker's own made-up secret
    const result = verifyAdminProxySignature({ headers: req.headers, method: req.method, path: req.path, query: req.query, rawBody: req.body, now: req.timestamp });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'secret_unavailable');
  });
});

test('verifyAdminProxySignature: absent secret never opens access, regardless of headers presented', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: undefined }, () => {
    const result = verifyAdminProxySignature({
      headers: { [CLIENT_IP_HEADER]: '203.0.113.9', [TIMESTAMP_HEADER]: String(Date.now()), [SIGNATURE_HEADER]: 'a'.repeat(64) },
      method: 'GET', path: '/enrollments', rawBody: Buffer.alloc(0),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'secret_unavailable');
  });
});

test('verifyAdminProxySignature: missing headers fail without a secret error', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const result = verifyAdminProxySignature({ headers: {}, method: 'GET', path: '/enrollments', rawBody: Buffer.alloc(0) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_headers');
  });
});

// ── adminProxySignature middleware ──────────────────────────────────────────
// The middleware derives `query` from req.url itself (mount-relative, same
// as req.path but with the query string still attached — see
// middleware/adminProxySignature.js), so every req object below carries a
// `url` matching its `path` (+ query when present), not just `path`.

test('adminProxySignature: sets req.trustedAdminClientIp on a valid signature', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const signed = sign({ clientIp: '203.0.113.9' });
    const req = { headers: signed.headers, method: signed.method, path: signed.path, url: signed.url, rawBody: signed.body };
    let nextCalled = false;
    adminProxySignature(req, makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.trustedAdminClientIp, '203.0.113.9');
  });
});

test('adminProxySignature: sets req.trustedAdminClientIp on a valid signature that includes a query string', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const signed = sign({ clientIp: '203.0.113.9', path: '/enrollments', query: '?page=2' });
    const req = { headers: signed.headers, method: signed.method, path: signed.path, url: signed.url, rawBody: signed.body };
    let nextCalled = false;
    adminProxySignature(req, makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.trustedAdminClientIp, '203.0.113.9');
  });
});

test('adminProxySignature: a request whose query string was tampered with in transit is never trusted', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const signed = sign({ clientIp: '203.0.113.9', path: '/enrollments', query: '?page=1' });
    // Simulates the signed headers arriving unchanged but the URL itself
    // having been altered after signing.
    const req = { headers: signed.headers, method: signed.method, path: signed.path, url: '/enrollments?page=2', rawBody: signed.body };
    let nextCalled = false;
    adminProxySignature(req, makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true); // middleware never blocks by itself
    assert.equal(req.trustedAdminClientIp, undefined);
  });
});

test('adminProxySignature: a forged x-admin-proxy-ip header never sets trustedAdminClientIp', async () => {
  await withEnv({ ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, () => {
    const req = {
      headers: {
        [CLIENT_IP_HEADER]: '203.0.113.9', // an IP an attacker wants to be seen as
        [TIMESTAMP_HEADER]: String(Date.now()),
        [SIGNATURE_HEADER]: crypto.randomBytes(32).toString('hex'), // not a real signature
      },
      method: 'GET', path: '/enrollments', url: '/enrollments', rawBody: Buffer.alloc(0),
    };
    let nextCalled = false;
    adminProxySignature(req, makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true); // middleware never blocks by itself
    assert.equal(req.trustedAdminClientIp, undefined);
  });
});

// ── Integration: adminProxySignature -> ipWhitelist chain ──────────────────
// ipWhitelist parses ADMIN_IP_WHITELIST once at module load, so these
// scenarios re-import it fresh, exactly like the existing ip-whitelist.test.js.
async function freshIpWhitelist() {
  const mod = await import(`../middleware/ipWhitelist.js?t=${Date.now()}-${Math.random()}`);
  return mod.ipWhitelist;
}

function runChain(middlewares, req, res) {
  let i = -1;
  function next() {
    i += 1;
    if (i < middlewares.length) middlewares[i](req, res, next);
  }
  next();
}

test('integration: a signed request lets an otherwise-unlisted req.ip through, using the verified IP instead', async () => {
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const signed = sign({ clientIp: '203.0.113.9' }); // allowed IP, signed
    // req.ip is Vercel's own edge IP here — deliberately NOT in the allowlist,
    // reproducing the exact proxy-hop mismatch this feature fixes.
    const req = { headers: signed.headers, method: signed.method, path: signed.path, url: signed.url, rawBody: signed.body, ip: '192.0.2.1', socket: { remoteAddress: '192.0.2.1' } };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 200);
  });
});

test('integration: a request replayed with a different query string does not bypass the allowlist for the real req.ip', async () => {
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const signed = sign({ clientIp: '203.0.113.9', path: '/enrollments', query: '?page=1' });
    const req = {
      headers: signed.headers, method: signed.method, path: signed.path, url: '/enrollments?page=999', rawBody: signed.body,
      ip: '198.51.100.50', socket: { remoteAddress: '198.51.100.50' }, // real, disallowed IP — must NOT be overridden
    };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 403);
  });
});

test('integration: a forged x-admin-proxy-ip header does not bypass the allowlist for the real req.ip', async () => {
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const req = {
      headers: {
        [CLIENT_IP_HEADER]: '203.0.113.9', // claims the allowed IP
        [TIMESTAMP_HEADER]: String(Date.now()),
        [SIGNATURE_HEADER]: crypto.randomBytes(32).toString('hex'), // forged
      },
      method: 'GET', path: '/enrollments', url: '/enrollments', rawBody: Buffer.alloc(0),
      ip: '198.51.100.50', socket: { remoteAddress: '198.51.100.50' }, // real, disallowed IP
    };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 403);
  });
});

test('integration: a forged header sent directly to Render (no Vercel hop at all) still fails closed', async () => {
  // Simulates hitting academy-backend-cxso.onrender.com directly, bypassing
  // the Vercel Function entirely — req.ip here IS the real, direct TCP peer
  // (trust proxy stays at 1, unaffected by this feature either way).
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const req = {
      headers: {
        [CLIENT_IP_HEADER]: '203.0.113.9',
        [TIMESTAMP_HEADER]: String(Date.now()),
        [SIGNATURE_HEADER]: crypto.randomBytes(32).toString('hex'), // no real secret to forge this with
      },
      method: 'GET', path: '/enrollments', url: '/enrollments', rawBody: Buffer.alloc(0),
      ip: '198.51.100.50', socket: { remoteAddress: '198.51.100.50' },
    };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(req.trustedAdminClientIp, undefined);
  });
});

test('integration: an unset signing secret never opens access via forged headers (falls back to req.ip)', async () => {
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: undefined }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const req = {
      headers: {
        [CLIENT_IP_HEADER]: '203.0.113.9',
        [TIMESTAMP_HEADER]: String(Date.now()),
        [SIGNATURE_HEADER]: 'a'.repeat(64),
      },
      method: 'GET', path: '/enrollments', url: '/enrollments', rawBody: Buffer.alloc(0),
      ip: '198.51.100.50', socket: { remoteAddress: '198.51.100.50' },
    };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 403);
  });
});

test('integration: the allowlist still rejects a validly-signed IP that is simply not listed', async () => {
  await withEnv({ NODE_ENV: 'production', ADMIN_IP_WHITELIST: '203.0.113.9', ADMIN_PROXY_SIGNING_SECRET: SECRET_HEX }, async () => {
    const freshWhitelist = await freshIpWhitelist();
    const signed = sign({ clientIp: '198.51.100.50' }); // genuinely signed, but not in the allowlist
    const req = { headers: signed.headers, method: signed.method, path: signed.path, url: signed.url, rawBody: signed.body, ip: '192.0.2.1', socket: { remoteAddress: '192.0.2.1' } };
    const res = makeRes();
    runChain([adminProxySignature, freshWhitelist], req, res);
    assert.equal(res.statusCode, 403);
  });
});
