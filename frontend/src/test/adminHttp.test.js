import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Production Readiness Sprint 2: adminHttp.js previously redirected to
// /admin/login on ANY 401, even a routine access-token expiry (the admin_at
// cookie is only 15 minutes) — losing whatever the admin was doing. It now
// attempts exactly one silent refresh via the existing backend endpoint
// (POST /api/v1/admin/auth/refresh) before redirecting, retries the
// original request exactly once on success, and still redirects on
// failure. adminRefresh() (api/adminAuthApi.js) is mocked so these tests
// exercise the real interceptor logic in isolation, via a custom axios
// adapter, rather than depending on a live/mocked HTTP server.

vi.mock('../api/adminAuthApi.js', () => ({
  adminRefresh: vi.fn(),
}));

import adminHttp from '../api/adminHttp.js';
import { adminRefresh } from '../api/adminAuthApi.js';

const originalAdapter = adminHttp.defaults.adapter;
const flush = () => new Promise((r) => setTimeout(r, 0));

// jsdom's window.location.assign is not a configurable property, so
// vi.spyOn(window.location, 'assign') throws "Cannot redefine property".
// vi.stubGlobal replaces the whole global binding instead (restored by
// vi.unstubAllGlobals() in afterEach), which sidesteps that restriction.
function mockLocationAssign() {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  return assign;
}

function resolveOk() {
  adminHttp.defaults.adapter = (config) =>
    Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
}

function rejectWith(status, message = 'error') {
  adminHttp.defaults.adapter = (config) =>
    Promise.reject({ config, response: { status, data: { message }, headers: {}, config } });
}

// First call 401s, every call after that succeeds — simulates "the access
// token was expired, then the retry (after refresh) goes through".
function reject401ThenSucceed() {
  let call = 0;
  adminHttp.defaults.adapter = (config) => {
    call += 1;
    if (call === 1) {
      return Promise.reject({ config, response: { status: 401, data: {}, headers: {}, config } });
    }
    return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
  };
}

// Always 401s, no matter how many times it's called — simulates a refresh
// that "succeeds" but the retried request still can't get past auth (e.g.
// the account was deactivated in between).
function alwaysReject401() {
  adminHttp.defaults.adapter = (config) =>
    Promise.reject({ config, response: { status: 401, data: {}, headers: {}, config } });
}

describe('adminHttp — session refresh on 401', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/admin');
  });

  afterEach(() => {
    adminHttp.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // Existing behavior preserved
  // -------------------------------------------------------------------
  it('normal responses pass through unaffected and never attempt a refresh', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    resolveOk();

    const res = await adminHttp.get('/v1/admin/users');

    expect(res.data).toEqual({ ok: true });
    expect(adminRefresh).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem('adminUser')).not.toBe(null);
  });

  it('a 401 from the MFA login/verify endpoints itself does not attempt a refresh or redirect (avoids a loop on a failed login attempt)', async () => {
    const assign = mockLocationAssign();
    rejectWith(401, 'Invalid TOTP code');

    await expect(adminHttp.post('/v1/admin/auth/mfa/verify', { token: '000000' })).rejects.toBeTruthy();

    expect(adminRefresh).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('a non-401 error (e.g. 403 forbidden) never attempts a refresh or clears the session', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    rejectWith(403, 'Forbidden');

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(adminRefresh).not.toHaveBeenCalled();
    expect(localStorage.getItem('adminUser')).not.toBe(null);
    expect(assign).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Successful refresh
  // -------------------------------------------------------------------
  it('successful refresh: a 401 triggers exactly one refresh call, then the original request is retried once and succeeds', async () => {
    adminRefresh.mockResolvedValue({ message: 'Tokens refreshed' });
    reject401ThenSucceed();

    const res = await adminHttp.get('/v1/admin/users');

    expect(res.data).toEqual({ ok: true });
    expect(adminRefresh).toHaveBeenCalledTimes(1);
  });

  it('successful refresh: does not touch the cached adminUser profile (the backend returns no profile to update)', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminRefresh.mockResolvedValue({ message: 'Tokens refreshed' });
    reject401ThenSucceed();

    await adminHttp.get('/v1/admin/users');

    expect(JSON.parse(localStorage.getItem('adminUser'))).toEqual({ email: 'jane@example.com' });
  });

  // -------------------------------------------------------------------
  // Failed refresh
  // -------------------------------------------------------------------
  it('failed refresh: clears the cached session, redirects to /admin/login, and the original request rejects', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminRefresh.mockRejectedValue({ response: { status: 401, data: { message: 'Refresh token expired', code: 'TOKEN_EXPIRED' } } });
    alwaysReject401();

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(adminRefresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(assign).toHaveBeenCalledWith('/admin/login');
  });

  it('does not call assign again if the visitor is already on /admin/login', async () => {
    window.history.pushState({}, '', '/admin/login');
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminRefresh.mockRejectedValue({ response: { status: 401, data: { message: 'Refresh token missing' } } });
    alwaysReject401();

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(assign).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Retry exactly once / no infinite loop
  // -------------------------------------------------------------------
  it('retry exactly once: if the retried request also gets a 401, no second refresh is attempted and the session is cleared', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminRefresh.mockResolvedValue({ message: 'Tokens refreshed' }); // refresh itself "succeeds"...
    alwaysReject401(); // ...but every request, including the retry, still 401s

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(adminRefresh).toHaveBeenCalledTimes(1); // not called again for the retry's own 401
    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(assign).toHaveBeenCalledWith('/admin/login');
  });

  // -------------------------------------------------------------------
  // Multiple concurrent 401 responses
  // -------------------------------------------------------------------
  it('multiple concurrent 401 responses share a single in-flight refresh call, and every request retries successfully', async () => {
    let resolveRefresh;
    adminRefresh.mockReturnValue(new Promise((r) => { resolveRefresh = r; }));

    let calls = 0;
    adminHttp.defaults.adapter = (config) => {
      calls += 1;
      // The first 3 dispatches are the 3 concurrent original requests (401);
      // anything after that is a retry, which succeeds.
      if (calls <= 3) return Promise.reject({ config, response: { status: 401, data: {}, headers: {}, config } });
      return Promise.resolve({ data: { ok: true, url: config.url }, status: 200, statusText: 'OK', headers: {}, config });
    };

    const p1 = adminHttp.get('/v1/admin/users');
    const p2 = adminHttp.get('/v1/admin/courses');
    const p3 = adminHttp.get('/v1/admin/payments/manual');

    // Let all three 401 rejections reach the interceptor and call
    // requestRefresh() before the shared refresh promise resolves.
    await flush();
    await flush();
    resolveRefresh({ message: 'Tokens refreshed' });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(adminRefresh).toHaveBeenCalledTimes(1);
    expect(r1.data.ok).toBe(true);
    expect(r2.data.ok).toBe(true);
    expect(r3.data.ok).toBe(true);
  });

  it('a later, independent 401 after a completed refresh triggers a fresh refresh call (the single-flight guard does not stick around)', async () => {
    adminRefresh.mockResolvedValue({ message: 'Tokens refreshed' });
    reject401ThenSucceed();
    await adminHttp.get('/v1/admin/users');
    expect(adminRefresh).toHaveBeenCalledTimes(1);

    reject401ThenSucceed();
    await adminHttp.get('/v1/admin/courses');
    expect(adminRefresh).toHaveBeenCalledTimes(2);
  });
});
