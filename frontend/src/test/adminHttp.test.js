import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import adminHttp from '../api/adminHttp.js';

// Production Readiness Audit — High finding: the admin MFA authentication
// flow shipped with zero test coverage, including adminHttp.js's 401
// ("expired session") handling — the piece that reacts to the short-lived
// (15 min) admin_at cookie expiring mid-session. Exercised here via a
// custom axios adapter (so the real request/response interceptor chain
// runs end-to-end) rather than a live network call, since neither a real
// nor a mocked HTTP server is needed to prove this interceptor's behavior.

const originalAdapter = adminHttp.defaults.adapter;

function rejectWith401() {
  adminHttp.defaults.adapter = (config) =>
    Promise.reject({
      config,
      response: { status: 401, data: { message: 'Unauthorized' }, headers: {}, config },
    });
}

function resolveOk() {
  adminHttp.defaults.adapter = (config) =>
    Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
}

// jsdom's window.location.assign is not a configurable property, so
// vi.spyOn(window.location, 'assign') throws "Cannot redefine property".
// vi.stubGlobal replaces the whole global binding instead (restored by
// vi.unstubAllGlobals() in afterEach), which sidesteps that restriction.
function mockLocationAssign() {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  return assign;
}

describe('adminHttp — expired session handling', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/admin');
  });

  afterEach(() => {
    adminHttp.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });

  it('normal responses pass through unaffected and never touch localStorage or navigation', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    resolveOk();

    const res = await adminHttp.get('/v1/admin/users');

    expect(res.data).toEqual({ ok: true });
    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem('adminUser')).not.toBe(null);
  });

  it('a 401 from a non-auth admin endpoint clears the cached profile and redirects to /admin/login', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    rejectWith401();

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(assign).toHaveBeenCalledWith('/admin/login');
  });

  it('a 401 from the MFA login/verify endpoints itself does not trigger a redirect (avoids a redirect loop on a failed login attempt)', async () => {
    const assign = mockLocationAssign();
    rejectWith401();

    await expect(adminHttp.post('/v1/admin/auth/mfa/verify', { token: '000000' })).rejects.toBeTruthy();

    expect(assign).not.toHaveBeenCalled();
  });

  it('does not call assign again if the visitor is already on /admin/login', async () => {
    window.history.pushState({}, '', '/admin/login');
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    rejectWith401();

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    // The cached profile is still cleared (session really is invalid), but
    // no redundant navigation is issued since the visitor is already there.
    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(assign).not.toHaveBeenCalled();
  });

  it('a non-401 error (e.g. 403 forbidden) does not clear the session or redirect', async () => {
    const assign = mockLocationAssign();
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminHttp.defaults.adapter = (config) =>
      Promise.reject({ config, response: { status: 403, data: { message: 'Forbidden' }, headers: {}, config } });

    await expect(adminHttp.get('/v1/admin/users')).rejects.toBeTruthy();

    expect(localStorage.getItem('adminUser')).not.toBe(null);
    expect(assign).not.toHaveBeenCalled();
  });
});
