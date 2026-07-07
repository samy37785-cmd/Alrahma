import { test } from 'node:test';
import assert from 'node:assert/strict';

// T21 (security audit): ipWhitelist used to fail OPEN (allow every request)
// whenever ADMIN_IP_WHITELIST was unset, in every environment including
// production. These tests prove the corrected behavior:
//   - dev/test + unset  -> allow all (unchanged, non-regressed default)
//   - production + unset -> deny all (fail closed, the actual fix)
//   - production + set   -> normal whitelist matching still works
//
// _whitelist is parsed once at module evaluation from process.env, so each
// scenario needs a fresh module instance reflecting the env at that moment.
// A cache-busting query string forces Node's ESM loader to re-evaluate the
// module instead of returning the already-cached one.
async function freshIpWhitelist() {
  const mod = await import(`../middleware/ipWhitelist.js?t=${Date.now()}-${Math.random()}`);
  return mod.ipWhitelist;
}

function makeReq(ip) {
  return { ip, socket: { remoteAddress: ip } };
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

test('ipWhitelist: dev/test + ADMIN_IP_WHITELIST unset allows all IPs (unchanged default)', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevList = process.env.ADMIN_IP_WHITELIST;
  delete process.env.ADMIN_IP_WHITELIST;
  process.env.NODE_ENV = 'test';
  try {
    const ipWhitelist = await freshIpWhitelist();
    const req = makeReq('203.0.113.7');
    const res = makeRes();
    let nextCalled = false;
    ipWhitelist(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevList !== undefined) process.env.ADMIN_IP_WHITELIST = prevList;
  }
});

test('ipWhitelist: production + ADMIN_IP_WHITELIST unset denies all IPs (fail closed)', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevList = process.env.ADMIN_IP_WHITELIST;
  delete process.env.ADMIN_IP_WHITELIST;
  process.env.NODE_ENV = 'production';
  try {
    const ipWhitelist = await freshIpWhitelist();
    const req = makeReq('203.0.113.7');
    const res = makeRes();
    let nextCalled = false;
    ipWhitelist(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevList !== undefined) process.env.ADMIN_IP_WHITELIST = prevList;
  }
});

test('ipWhitelist: production + ADMIN_IP_WHITELIST set still matches normally (allowed IP passes)', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevList = process.env.ADMIN_IP_WHITELIST;
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_IP_WHITELIST = '203.0.113.7,10.0.0.0/8';
  try {
    const ipWhitelist = await freshIpWhitelist();
    const req = makeReq('203.0.113.7');
    const res = makeRes();
    let nextCalled = false;
    ipWhitelist(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevList === undefined) delete process.env.ADMIN_IP_WHITELIST;
    else process.env.ADMIN_IP_WHITELIST = prevList;
  }
});

test('ipWhitelist: production + ADMIN_IP_WHITELIST set rejects a non-matching IP', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevList = process.env.ADMIN_IP_WHITELIST;
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_IP_WHITELIST = '203.0.113.7,10.0.0.0/8';
  try {
    const ipWhitelist = await freshIpWhitelist();
    const req = makeReq('198.51.100.9');
    const res = makeRes();
    let nextCalled = false;
    ipWhitelist(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevList === undefined) delete process.env.ADMIN_IP_WHITELIST;
    else process.env.ADMIN_IP_WHITELIST = prevList;
  }
});
