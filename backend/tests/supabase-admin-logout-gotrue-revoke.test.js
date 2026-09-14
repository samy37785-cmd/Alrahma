import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { pathToFileURL } from 'url';

import { SUPABASE_AT_COOKIE } from '../data/supabase/supabaseSessionCookie.js';
import { REFRESH_TOKEN_COOKIE } from '../utils/adminAuthTokens.js';
import logger from '../config/logger.js';

// Companion to supabase-admin-logout-cookie-path.test.js: that file proves
// admin_sat (not admin_rt) is what actually reaches POST /logout in a real
// browser. This file proves the fixed logout() handler
// (data/supabase/adminAuthController.js) actually USES that fact — it
// revokes the live GoTrue session via admin_sat, through a real HTTP call
// shape (a monkeypatched global.fetch capturing the request GoTrue would
// receive) — AND, per review follow-up, that a failed upstream revocation
// (non-2xx response, or a real network failure) is never silently
// swallowed: cookies are always cleared locally regardless, but the
// response body flags it (`upstreamRevocationFailed: true`), it is logged,
// and — when the caller's admin identity is known — audited as a
// `severity: 'warning'` admin_audit_log row, so it is genuinely observable
// rather than only "best-effort and forgotten."
//
// No real Supabase/GoTrue project or Postgres is ever contacted:
// SUPABASE_URL points at a fake host and global.fetch never reaches the
// network; adminAuditLog.js's auditAdminAuthEvent() (which would otherwise
// open a real Postgres connection via withServiceRole) is intercepted via
// node:test's experimental module-mock support (see backend/package.json's
// `test` script for the --experimental-test-module-mocks flag this needs).
const auditLogUrl = pathToFileURL(path.resolve('data/supabase/adminAuditLog.js')).href;
const authClientsUrl = pathToFileURL(path.resolve('data/supabase/authClients.js')).href;

let logout;
let realFetch;
let fetchImpl;
let auditImpl;
// Round 5: null (the default) means "call straight through to the real
// implementation" for both — every test in this file except the one
// dedicated defense-in-depth test below exercises the REAL
// revokeGoTrueSession()/exchangeRefreshTokenForAccessToken() against the
// mocked global.fetch. Only that one test overrides revokeGoTrueSessionImpl
// to force a genuinely unexpected synchronous throw from a point neither
// helper's own internal try/catch can absorb — proving logout()'s own outer
// try/catch/finally (adminAuthController.js) is what keeps cookies clearing
// in that case, not a coincidence of how the two helpers happen to be
// implemented today.
let revokeGoTrueSessionImpl = null;
const fetchCalls = [];
const auditCalls = [];

before(async () => {
  process.env.SUPABASE_URL = 'http://fake-gotrue.invalid';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key-for-logout-unit-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

  realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts });
    return fetchImpl(url, opts);
  };

  const realAuditLogModule = await import(auditLogUrl);
  mock.module(auditLogUrl, {
    exports: {
      ...realAuditLogModule,
      // Indirected through auditImpl (reset in beforeEach, like fetchImpl
      // above) so individual tests can make the audit write itself throw —
      // proving a Postgres/audit-log failure never blocks the local cookie
      // clearing below it (review follow-up).
      auditAdminAuthEvent: async (args) => auditImpl(args),
    },
  });

  const realAuthClientsModule = await import(authClientsUrl);
  mock.module(authClientsUrl, {
    exports: {
      ...realAuthClientsModule,
      revokeGoTrueSession: async (...args) => {
        if (revokeGoTrueSessionImpl) return revokeGoTrueSessionImpl(...args);
        return realAuthClientsModule.revokeGoTrueSession(...args);
      },
    },
  });

  ({ logout } = await import('../data/supabase/adminAuthController.js'));
});

after(() => {
  global.fetch = realFetch;
  mock.reset();
});

beforeEach(() => {
  fetchCalls.length = 0;
  auditCalls.length = 0;
  revokeGoTrueSessionImpl = null;
  // Default: GoTrue accepts the revoke. Individual tests override this to
  // simulate a non-2xx response or a real network failure.
  fetchImpl = async () => ({ ok: true, status: 204 });
  // Default: audit writes succeed and are recorded. Individual tests
  // override this to simulate a failed audit write.
  auditImpl = async (args) => { auditCalls.push(args); };
});

function fakeRes() {
  return {
    _cookiesCleared: [],
    _json: null,
    clearCookie(name, opts) {
      this._cookiesCleared.push({ name, opts });
      return this;
    },
    json(body) {
      this._json = body;
      return this;
    },
  };
}

test('supabase-mode logout() revokes the GoTrue session using admin_sat (real cookie contract), and never depends on admin_rt', async () => {
  // Exactly what a real browser sends to /logout, per the cookie-path test:
  // admin_sat present, admin_rt deliberately ABSENT.
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: null };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 1, 'must call GoTrue exactly once to revoke the live session');
  const [call] = fetchCalls;
  assert.match(call.url, /^http:\/\/fake-gotrue\.invalid\/auth\/v1\/logout\?scope=global$/);
  assert.equal(call.opts.method, 'POST');
  assert.equal(
    call.opts.headers.Authorization,
    'Bearer REAL_GOTRUE_ACCESS_TOKEN',
    'must revoke using the access token that actually arrived (admin_sat), not a refresh token that never does',
  );
  assert.equal(call.opts.headers.apikey, 'test-anon-key-for-logout-unit-test');

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'must not appear at all when revocation succeeded');
  assert.ok(
    res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE),
    'admin_sat must still be cleared client-side regardless',
  );
  assert.equal(auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'), false);
});

test('supabase-mode logout() with NO admin_sat cookie present (e.g. an already-expired pre-auth session) skips the GoTrue call entirely — no crash, no call with an empty token', async () => {
  const req = { cookies: {}, adminUser: null };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 0);
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined);
});

test('supabase-mode logout() with a WORKING admin_sat never touches admin_rt at all — the fallback (see the admin_rt-specific tests further down) only ever triggers when admin_sat is missing or fails', async () => {
  // admin_rt is present here too, but admin_sat succeeds on its own, so
  // there is nothing for the admin_rt fallback to recover from — it must
  // never fire (and never spend an extra round trip) just because admin_rt
  // happens to also be present.
  const req = {
    cookies: { [REFRESH_TOKEN_COOKIE]: 'SOME_REFRESH_TOKEN', [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' },
    adminUser: null,
  };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].opts.headers.Authorization, 'Bearer REAL_GOTRUE_ACCESS_TOKEN');
});

test('a non-2xx response from GoTrue is surfaced explicitly: response body flags it, and it is audited as a warning — cookies are still cleared and the request still returns 200', async () => {
  fetchImpl = async () => ({ ok: false, status: 401 });
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(res._json.message, 'Logged out successfully', 'local logout must still succeed');
  assert.equal(res._json.upstreamRevocationFailed, true);
  assert.ok(res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE), 'cookies are ALWAYS cleared locally');

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'a failed upstream revoke must be audited, not silently discarded');
  assert.equal(failureAudit.severity, 'warning');
  assert.equal(failureAudit.adminId, 'admin-1');
  assert.equal(failureAudit.after.reason, 'non_2xx_response');
  assert.equal(failureAudit.after.status, 401);

  const successAudit = auditCalls.find((a) => a.action === 'auth.logout');
  assert.ok(successAudit, 'the normal auth.logout audit event must still be written');
});

test('a real network failure calling GoTrue (fetch throws) is surfaced the same way — best-effort never means silently ignored', async () => {
  fetchImpl = async () => { throw new Error('ECONNREFUSED: connection refused'); };
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true);

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit);
  assert.equal(failureAudit.after.reason, 'network_error');
});

test('an upstream failure with no known admin identity (adminUser is null) still surfaces upstreamRevocationFailed in the response, without crashing on a missing audit subject', async () => {
  fetchImpl = async () => ({ ok: false, status: 500 });
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: null };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(res._json.upstreamRevocationFailed, true);
  assert.equal(
    auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'),
    false,
    'no admin identity known — nothing to audit against, but must not throw',
  );
});

// Review follow-up: cookies must be cleared locally even when the audit
// write itself fails (Postgres unreachable, RLS error, whatever) — an
// admin must never be stuck looking "logged in" in their own browser just
// because the audit log couldn't be written. The failure must still be
// logged, not silently swallowed.
test('logout() still clears every cookie and returns 200 when the main auth.logout audit write throws', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  auditImpl = async (args) => {
    if (args.action === 'auth.logout') throw new Error('ECONNREFUSED: Postgres unreachable');
    auditCalls.push(args);
  };
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res); // must not throw / reject

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'GoTrue revocation itself succeeded');
  assert.equal(res._cookiesCleared.length, 4, 'admin_at, admin_rt (new Path), admin_sat, and legacy-Path admin_rt must all still be cleared');
  assert.ok(
    errorCalls.some((c) => c.message.includes('audit write failed')),
    'the audit failure must be logged, not silently swallowed',
  );
});

test('logout() still clears every cookie and returns 200 when BOTH the GoTrue revoke fails AND the resulting failure-audit write throws', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  fetchImpl = async () => ({ ok: false, status: 401 });
  auditImpl = async () => { throw new Error('audit table is locked'); };
  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res); // must not throw / reject despite two independent failures

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true);
  assert.equal(res._cookiesCleared.length, 4, 'admin_at, admin_rt (new Path), admin_sat, and legacy-Path admin_rt must all still be cleared');
  assert.ok(
    errorCalls.some((c) => c.message.includes('GoTrue session revocation failed')),
    'the GoTrue failure must still be logged',
  );
  assert.ok(
    errorCalls.some((c) => c.message.includes('failed to audit the GoTrue revoke failure itself')),
    'the audit-write failure for the revoke-failed event must also be logged, not silently swallowed',
  );
});

// Review follow-up: fetch() has no built-in timeout — an unreachable/
// hanging GoTrue host must never be able to hang the whole logout request.
// authClients.js's revokeGoTrueSession() bounds the call with an
// AbortController; ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS lets this test make that
// bound tiny instead of waiting out the real (5s) production default.
test('a GoTrue call that never responds is aborted by the bounded timeout, surfaced as upstreamRevocationFailed, and never hangs logout()', async () => {
  const originalTimeoutEnv = process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
  process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = '50';

  // Mirrors real fetch/undici abort semantics: never resolves on its own,
  // only settles (by rejecting) once the signal this call was given aborts.
  fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  try {
    await logout(req, res); // must resolve on its own — a hang would time out this whole test
  } finally {
    if (originalTimeoutEnv === undefined) delete process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
    else process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = originalTimeoutEnv;
  }

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'a timed-out revoke must surface the same as any other failure');
  assert.ok(res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE), 'cookies are still cleared locally');

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'a timeout must be audited like any other upstream failure');
  assert.equal(failureAudit.after.reason, 'timeout');
});

// Review follow-up: admin_sat shares admin_at's short 15-minute window — by
// the time an idle admin actually clicks logout, it may well already be
// gone. Without a fallback, a real, still-live GoTrue session (and the
// still-valid admin_rt that can silently resurrect it) was left completely
// untouched server-side: cookies were cleared locally, but the admin's
// actual GoTrue session — and anyone else holding a copy of admin_rt —
// stayed fully live. These tests simulate the full admin_rt -> scoped
// refreshSession() -> fresh access token -> revokeGoTrueSession() flow
// against real HTTP call shapes (a monkeypatched global.fetch branching on
// URL, matching what supabase-js's GoTrueClient itself constructs for both
// its /token?grant_type=refresh_token and its own internal calls) — not a
// hand-mocked supabase-js client, so this actually exercises the real
// library code redeeming the refresh token.
function fetchImplByUrl(handlers) {
  return async (url, opts) => {
    const u = String(url);
    for (const [match, handler] of handlers) {
      if (u.includes(match)) return handler(opts);
    }
    throw new Error(`unexpected fetch call in test: ${u}`);
  };
}

test('logout() with NO admin_sat but a valid admin_rt performs a real global GoTrue revocation via a redeemed access token, and never returns the fresh tokens to the client', async () => {
  fetchImpl = fetchImplByUrl([
    ['/token?grant_type=refresh_token', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'FRESH_ACCESS_TOKEN',
        refresh_token: 'FRESH_REFRESH_TOKEN_ROTATED',
        expires_in: 900,
        token_type: 'bearer',
        user: { id: 'admin-1' },
      }),
    })],
    ['/auth/v1/logout', async () => ({ ok: true, status: 204 })],
  ]);

  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes(); // has no .cookie() at all — a call to it would throw, proving fresh tokens are never re-cookied

  await logout(req, res);

  assert.equal(fetchCalls.length, 2, 'must redeem admin_rt for a fresh access token, then revoke with it');
  assert.match(fetchCalls[0].url, /\/token\?grant_type=refresh_token$/);
  assert.match(fetchCalls[1].url, /\/auth\/v1\/logout\?scope=global$/);
  assert.equal(
    fetchCalls[1].opts.headers.Authorization,
    'Bearer FRESH_ACCESS_TOKEN',
    'the revoke must use the FRESH access token redeemed from admin_rt, not admin_rt itself',
  );

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'the fallback revocation succeeded');
  assert.ok(res._cookiesCleared.some((c) => c.name === REFRESH_TOKEN_COOKIE), 'admin_rt is still cleared locally');
});

test('logout() with a present but FAILING admin_sat falls back to admin_rt and self-heals — upstreamRevocationFailed ends up unset', async () => {
  fetchImpl = fetchImplByUrl([
    // The direct admin_sat-based attempt fails (e.g. admin_sat itself
    // already expired server-side, GoTrue rejects it outright)...
    ['/auth/v1/logout', (() => {
      let call = 0;
      return async () => {
        call += 1;
        return call === 1 ? { ok: false, status: 401 } : { ok: true, status: 204 };
      };
    })()],
    // ...so the fallback redeems admin_rt instead, and THAT revoke (the
    // second /auth/v1/logout call above) succeeds.
    ['/token?grant_type=refresh_token', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'FRESH_ACCESS_TOKEN',
        refresh_token: 'FRESH_REFRESH_TOKEN_ROTATED',
        expires_in: 900,
        token_type: 'bearer',
        user: { id: 'admin-1' },
      }),
    })],
  ]);

  const req = {
    cookies: { [SUPABASE_AT_COOKIE]: 'EXPIRED_GOTRUE_ACCESS_TOKEN', [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' },
    adminUser: { id: 'admin-1' },
  };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 3, 'admin_sat attempt, then admin_rt redemption, then the retried revoke');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'the admin_rt fallback recovered — no failure to surface');
  assert.equal(
    auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'),
    false,
    'a fully self-healed revocation is not a failure worth auditing as one',
  );
});

test('logout() with admin_rt present but already dead (GoTrue rejects the refresh) treats it as nothing-left-to-revoke, not a failure — and never calls GoTrue logout at all', async () => {
  fetchImpl = fetchImplByUrl([
    ['/token?grant_type=refresh_token', async () => ({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used', msg: 'Invalid Refresh Token: Already Used' }),
    })],
  ]);

  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'ALREADY_DEAD_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 1, 'only the failed redemption attempt — no GoTrue /logout call with nothing to revoke');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'an already-dead admin_rt is not an upstream failure — there was nothing left to revoke');
  assert.equal(auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'), false);
});

// ── Round 5 review follow-up ────────────────────────────────────────────────
// The admin_rt fallback used to call createScopedAnonClient().auth.
// refreshSession() with no timeout at all, and treated EVERY failure from it
// (network error, timeout, a GoTrue 5xx, an unrecognized response shape) as
// proof the refresh token was "already invalid" — a real upstream outage was
// silently reported as a fully successful logout. The tests below exercise
// exchangeRefreshTokenForAccessToken() (authClients.js) through logout()
// end-to-end for exactly the failure modes that must now be told apart:
// only GoTrue's own EXPLICIT invalid-refresh-token response may be read as
// "nothing left to revoke"; a hang, a network error, and a 5xx must all
// surface as a genuine upstreamRevocationFailed.

test('round 5: admin_rt only, GoTrue never responds to the redemption call — logout still resolves within the bounded timeout, clears cookies, and reports upstreamRevocationFailed: true (not a false "already invalid")', async () => {
  const originalTimeoutEnv = process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
  process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = '50';

  // Mirrors real fetch/undici abort semantics: never resolves on its own,
  // only settles (by rejecting) once the AbortController's signal fires —
  // proving this is a REAL cancelled network request, not a Promise.race()
  // that merely stops waiting while the request keeps running underneath.
  fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  const startedAt = Date.now();
  try {
    await logout(req, res); // must resolve on its own well within the test's own timeout — a hang would fail this test
  } finally {
    if (originalTimeoutEnv === undefined) delete process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
    else process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = originalTimeoutEnv;
  }
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 5000, 'the bounded ~50ms timeout must actually fire — this must not fall through to the 5s production default');
  assert.equal(fetchCalls.length, 1, 'only the redemption attempt — logout never reaches the /auth/v1/logout call with no access token to use');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'a timed-out redemption is a real failure, never "already invalid"');
  assert.ok(res._cookiesCleared.some((c) => c.name === REFRESH_TOKEN_COOKIE), 'admin_rt must still be cleared locally');
  assert.ok(res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE), 'admin_sat must still be cleared locally');

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'a timed-out redemption must be audited like any other upstream failure');
  assert.equal(failureAudit.after.reason, 'timeout');
});

test('round 5: admin_rt only, a real network error during the redemption call surfaces as a genuine failure, not "already invalid"', async () => {
  fetchImpl = async () => { throw new Error('ECONNREFUSED: connection refused'); };
  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'a network error redeeming admin_rt must never be read as "nothing left to revoke"');
  assert.ok(res._cookiesCleared.some((c) => c.name === REFRESH_TOKEN_COOKIE));

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit);
  assert.equal(failureAudit.after.reason, 'network_error');
});

test('round 5: admin_rt only, GoTrue answers with HTTP 503 (a real outage, not an invalid-token response) — surfaces as a genuine failure', async () => {
  fetchImpl = fetchImplByUrl([
    ['/token?grant_type=refresh_token', async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'service_unavailable', error_description: 'GoTrue is temporarily unavailable' }),
    })],
  ]);
  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 1);
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'a 503 from GoTrue is a real outage, never "token already invalid"');
  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit);
  assert.equal(failureAudit.after.reason, 'non_2xx_response');
  assert.equal(failureAudit.after.status, 503);
});

test('round 5: a genuinely unforeseen throw (not one either helper\'s own try/catch would absorb) still leaves every cookie cleared — proves logout()\'s own outer try/catch/finally, not just the helpers\' internal error handling', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  // revokeGoTrueSession() itself never throws in its real implementation
  // (its own try/catch/finally absorbs everything) — this override replaces
  // it entirely with something that DOES throw synchronously, simulating a
  // genuinely unforeseen bug at a point neither authClients.js helper's own
  // error handling is in a position to catch. logout()'s outer try/finally
  // (adminAuthController.js) is the only thing left that can keep cookies
  // clearing here.
  revokeGoTrueSessionImpl = async () => { throw new TypeError("Cannot read properties of undefined (reading 'foo')"); };

  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res); // must not throw / reject despite the unexpected internal error

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true);
  assert.equal(res._cookiesCleared.length, 4, 'admin_at, admin_rt (new Path), admin_sat, and legacy-Path admin_rt must all still be cleared despite the unexpected throw');
  assert.ok(
    errorCalls.some((c) => c.message.includes('unexpected error during GoTrue revocation/audit')),
    'the unexpected failure must be logged via the outer catch, not silently swallowed',
  );

  // Round 5.1 review follow-up: the outer catch used to only log this —
  // silently skipping the audit trail every OTHER documented revoke failure
  // in this function gets. With a known admin identity, an unexpected
  // failure must be just as observable/auditable as a "normal" one.
  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'an unexpected error must be audited too, not just logged — the admin\'s identity is known here');
  assert.equal(failureAudit.severity, 'warning');
  assert.equal(failureAudit.adminId, 'admin-1');
});

// ── Round 5.1 review follow-up ──────────────────────────────────────────────
// Two bugs found in round 5's own fix, both in adminAuthController.js's
// logout():
//
//   1. A failed admin_sat attempt (a real, already-happened revocation
//      failure — e.g. GoTrue was down, or the call timed out) was silently
//      overwritten by success (`{ ok: true }`) whenever the SEPARATE admin_rt
//      fallback then confirmed its own token was already invalid. Both are
//      genuinely true facts, but only the second was kept — reporting a
//      fully successful global logout while the admin_sat-tied GoTrue
//      session was, in fact, never reached at all.
//
//   2. The outer defense-in-depth catch (for a genuinely unforeseen throw)
//      only called logger.error, never auditAdminAuthEvent — an unexpected
//      failure with a known admin identity was less observable than every
//      other documented failure mode in this same function.
//
// The tests below (still using the same monkeypatched global.fetch /
// mock.module'd authClients.js / adminAuditLog.js from this file's own
// `before()` — no real Supabase/GoTrue/Postgres involved) prove both fixes,
// plus the two outcomes (self-heal, and "no admin_sat ever attempted") that
// must NOT regress alongside them.

test('round 5.1: admin_sat returns HTTP 503, then admin_rt confirms invalid_grant — the admin_sat failure must NOT be erased; upstreamRevocationFailed stays true, a failure audit exists, cookies are cleared, and no revoke call ever succeeds', async () => {
  fetchImpl = fetchImplByUrl([
    ['/auth/v1/logout', async () => ({ ok: false, status: 503 })],
    ['/token?grant_type=refresh_token', async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }),
    })],
  ]);
  const req = {
    cookies: { [SUPABASE_AT_COOKIE]: 'EXPIRED_GOTRUE_ACCESS_TOKEN', [REFRESH_TOKEN_COOKIE]: 'ALREADY_DEAD_RT' },
    adminUser: { id: 'admin-1' },
  };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 2, 'admin_sat attempt, then the admin_rt redemption attempt — no successful revoke call anywhere');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'the admin_sat failure must survive admin_rt turning out to be separately already-dead');
  assert.ok(res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE), 'cookies are still cleared locally regardless');

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'the admin_sat failure must be audited, not silently discarded by the admin_rt outcome');
  assert.equal(failureAudit.after.reason, 'non_2xx_response', 'the reported failure is admin_sat\'s own — not overwritten by admin_rt\'s unrelated "already invalid" state');
  assert.equal(failureAudit.after.status, 503);
});

test('round 5.1: admin_sat times out, then admin_rt confirms invalid_grant — same outcome as the 503 case: the timeout failure is kept, not erased', async () => {
  const originalTimeoutEnv = process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
  process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = '50';

  fetchImpl = fetchImplByUrl([
    ['/auth/v1/logout', (opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })],
    ['/token?grant_type=refresh_token', async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }),
    })],
  ]);
  const req = {
    cookies: { [SUPABASE_AT_COOKIE]: 'EXPIRED_GOTRUE_ACCESS_TOKEN', [REFRESH_TOKEN_COOKIE]: 'ALREADY_DEAD_RT' },
    adminUser: { id: 'admin-1' },
  };
  const res = fakeRes();

  try {
    await logout(req, res);
  } finally {
    if (originalTimeoutEnv === undefined) delete process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS;
    else process.env.ADMIN_GOTRUE_LOGOUT_TIMEOUT_MS = originalTimeoutEnv;
  }

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true, 'the admin_sat timeout must survive admin_rt turning out to be separately already-dead');
  assert.ok(res._cookiesCleared.some((c) => c.name === SUPABASE_AT_COOKIE));

  const failureAudit = auditCalls.find((a) => a.action === 'auth.logout_gotrue_revoke_failed');
  assert.ok(failureAudit, 'the admin_sat timeout must be audited, not silently discarded');
  assert.equal(failureAudit.after.reason, 'timeout', 'the reported failure is admin_sat\'s own timeout — not overwritten by admin_rt\'s "already invalid" state');
});

test('round 5.1: admin_sat fails, admin_rt redemption succeeds, and the retried revoke ALSO succeeds — this is still genuine self-healing: no failure flag, no failure audit', async () => {
  fetchImpl = fetchImplByUrl([
    ['/auth/v1/logout', (() => {
      let call = 0;
      return async () => {
        call += 1;
        return call === 1 ? { ok: false, status: 401 } : { ok: true, status: 204 };
      };
    })()],
    ['/token?grant_type=refresh_token', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'FRESH_ACCESS_TOKEN', refresh_token: 'FRESH_RT', expires_in: 900 }),
    })],
  ]);
  const req = {
    cookies: { [SUPABASE_AT_COOKIE]: 'EXPIRED_GOTRUE_ACCESS_TOKEN', [REFRESH_TOKEN_COOKIE]: 'REAL_ADMIN_RT' },
    adminUser: { id: 'admin-1' },
  };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 3, 'admin_sat attempt, admin_rt redemption, then the retried (successful) revoke');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'a genuine successful revoke via the admin_rt fallback IS a real self-heal — no failure to report');
  assert.equal(
    auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'),
    false,
    'a fully self-healed revocation is not a failure worth auditing as one',
  );
});

test('round 5.1: no admin_sat cookie at all, and admin_rt confirms invalid_grant — unchanged from before: nothing-left-to-revoke, no failure flag (regression check for the precedence fix above)', async () => {
  fetchImpl = fetchImplByUrl([
    ['/token?grant_type=refresh_token', async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }),
    })],
  ]);
  const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'ALREADY_DEAD_RT' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res);

  assert.equal(fetchCalls.length, 1, 'only the redemption attempt — there was never an admin_sat attempt to fail, and nothing left to revoke via admin_rt either');
  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, undefined, 'no admin_sat attempt existed, and admin_rt is explicitly confirmed already-dead — genuinely nothing to revoke');
  assert.equal(auditCalls.some((a) => a.action === 'auth.logout_gotrue_revoke_failed'), false);
});

test('round 5.1: the failure-audit write for an UNEXPECTED (outer-catch) revoke error itself throws — still no 500, cookies stay cleared, and the audit failure is logged rather than propagated', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  revokeGoTrueSessionImpl = async () => { throw new TypeError("Cannot read properties of undefined (reading 'bar')"); };
  auditImpl = async (args) => {
    if (args.action === 'auth.logout_gotrue_revoke_failed') throw new Error('audit table is locked');
    auditCalls.push(args);
  };

  const req = { cookies: { [SUPABASE_AT_COOKIE]: 'REAL_GOTRUE_ACCESS_TOKEN' }, adminUser: { id: 'admin-1' } };
  const res = fakeRes();

  await logout(req, res); // must not throw / reject despite the audit write itself throwing on top of the unexpected error

  assert.equal(res._json.message, 'Logged out successfully');
  assert.equal(res._json.upstreamRevocationFailed, true);
  assert.equal(res._cookiesCleared.length, 4, 'admin_at, admin_rt (new Path), admin_sat, and legacy-Path admin_rt must all still be cleared');
  assert.ok(
    errorCalls.some((c) => c.message.includes('unexpected error during GoTrue revocation/audit')),
    'the original unexpected error must still be logged',
  );
  assert.ok(
    errorCalls.some((c) => c.message.includes('failed to audit the unexpected revocation error itself')),
    'the audit-write failure ON TOP of the unexpected error must also be logged, not silently swallowed or rethrown',
  );
});
