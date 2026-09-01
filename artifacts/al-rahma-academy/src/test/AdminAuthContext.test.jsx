import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext';

// Production Readiness Audit — High finding: the admin MFA authentication
// flow (AdminAuthContext, AdminLogin, AdminSessionGate, adminHttp,
// adminAuthApi) shipped with zero test coverage. This file covers
// AdminAuthContext's state machine directly — login()/confirmMfaSetup()/
// verifyMfa()/logout() and their effect on adminUser/pendingStage/
// mfaSetupInfo — via a minimal consumer component, mocking only the API
// network boundary (api/adminAuthApi.js), the same level every other
// context/hook test in this suite mocks at (see useBilling.test.jsx).
//
// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): adds
// the fail-closed session-verification coverage this file never had -
// `isAdmin`/`isChecking`/`sessionStatus` are now the real thing under
// test, not just `adminUser`'s presence. A forged/stale cached adminUser
// must NEVER make isAdmin true by itself; only a real adminRefresh()
// round trip (mocked here at the network boundary, same as every other
// call) or a fresh in-session login/MFA result can.

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
  adminRefresh:    vi.fn(),
}));

import * as adminAuthApi from '../api/adminAuthApi.js';

function Consumer() {
  const ctx = useAdminAuth();
  return (
    <div>
      <span data-testid="adminUser">{JSON.stringify(ctx.adminUser)}</span>
      <span data-testid="pendingStage">{ctx.pendingStage ?? 'none'}</span>
      <span data-testid="mfaSetupInfo">{JSON.stringify(ctx.mfaSetupInfo)}</span>
      <span data-testid="sessionStatus">{ctx.sessionStatus}</span>
      <span data-testid="isAdmin">{String(ctx.isAdmin)}</span>
      <span data-testid="isChecking">{String(ctx.isChecking)}</span>
      <button onClick={() => ctx.login('admin@example.com', 'password123').catch(() => {})}>login</button>
      <button onClick={() => ctx.confirmMfaSetup('123456', 'admin@example.com').catch(() => {})}>confirmSetup</button>
      <button onClick={() => ctx.verifyMfa('123456').catch(() => {})}>verify</button>
      <button onClick={() => ctx.logout()}>logout</button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <AdminAuthProvider>
      <Consumer />
    </AdminAuthProvider>,
  );
}

describe('AdminAuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------
  it('initial state: no cached profile means adminUser is null, isAdmin is false, and there is nothing to check', () => {
    renderConsumer();
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
    expect(screen.getByTestId('isChecking').textContent).toBe('false');
    expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated');
    // No cached profile means nothing to verify - the network is never hit.
    expect(adminAuthApi.adminRefresh).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Fail-closed session verification (Stage 2C Final Corrective) - this
  // is the core of the fix: a cached adminUser object, however it got
  // there, is NEVER by itself sufficient for isAdmin to become true.
  // -------------------------------------------------------------------
  it('a cached profile starts "checking" (not admin yet) and calls verifySession via adminRefresh on mount', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'admin' }));
    adminAuthApi.adminRefresh.mockImplementation(() => new Promise(() => {})); // never resolves - freeze in "checking"
    renderConsumer();

    // Immediately after mount: cached data is visible as a hint, but NOT admin yet.
    expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'admin' }));
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
    expect(screen.getByTestId('isChecking').textContent).toBe('true');
    await waitFor(() => expect(adminAuthApi.adminRefresh).toHaveBeenCalledTimes(1));
  });

  it('a real, valid session: adminRefresh() succeeds, so isAdmin becomes true and checking ends', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ name: 'Jane', email: 'jane@example.com' }));
    adminAuthApi.adminRefresh.mockResolvedValue({});
    renderConsumer();

    await waitFor(() => expect(screen.getByTestId('isAdmin').textContent).toBe('true'));
    expect(screen.getByTestId('isChecking').textContent).toBe('false');
    expect(screen.getByTestId('sessionStatus').textContent).toBe('verified');
  });

  it('a forged or stale cached profile: adminRefresh() 401s, so isAdmin stays false and the cache is cleared - the localStorage object alone never grants admin', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ name: 'Fake Admin', email: 'attacker@example.com', role: 'admin' }));
    adminAuthApi.adminRefresh.mockRejectedValue({ response: { status: 401 } });
    renderConsumer();

    await waitFor(() => expect(screen.getByTestId('isChecking').textContent).toBe('false'));
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
    expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(localStorage.getItem('adminUser')).toBe(null);
  });

  it('corrupted localStorage JSON is handled gracefully (falls back to null, does not throw, never checks)', () => {
    localStorage.setItem('adminUser', '{not valid json');
    expect(() => renderConsumer()).not.toThrow();
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
    expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated');
    expect(adminAuthApi.adminRefresh).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // login() — MFA required flow (already-enrolled admin)
  // -------------------------------------------------------------------
  it('login(): a stage:"mfa" response sets pendingStage to "mfa" and does not call adminMfaSetup', async () => {
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa' });
    renderConsumer();

    fireEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('pendingStage').textContent).toBe('mfa'));
    expect(adminAuthApi.adminMfaSetup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // login() — first-time MFA setup flow
  // -------------------------------------------------------------------
  it('login(): a stage:"mfa_setup" response sets pendingStage and populates mfaSetupInfo from adminMfaSetup', async () => {
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa_setup' });
    adminAuthApi.adminMfaSetup.mockResolvedValue({ qrCode: 'data:image/png;base64,abc', secret: 'BASE32SECRET' });
    renderConsumer();

    fireEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('pendingStage').textContent).toBe('mfa_setup'));
    await waitFor(() => expect(screen.getByTestId('mfaSetupInfo').textContent).toBe(JSON.stringify({ qrCode: 'data:image/png;base64,abc', secret: 'BASE32SECRET' })));
  });

  // -------------------------------------------------------------------
  // login() — failed login (bad credentials)
  // -------------------------------------------------------------------
  it('login(): a rejected request leaves adminUser and pendingStage untouched', async () => {
    adminAuthApi.adminLogin.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid credentials' } } });
    renderConsumer();

    fireEvent.click(screen.getByText('login'));

    await waitFor(() => expect(adminAuthApi.adminLogin).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
  });

  // -------------------------------------------------------------------
  // confirmMfaSetup() — TOTP verification (first-time activation)
  // -------------------------------------------------------------------
  it('confirmMfaSetup(): success persists a minimal profile (email), clears the pending MFA-setup stage, and IS a real verified session (no extra adminRefresh round trip needed)', async () => {
    adminAuthApi.adminMfaConfirm.mockResolvedValue({ message: '2FA activated and session started' });
    renderConsumer();

    fireEvent.click(screen.getByText('confirmSetup'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify({ email: 'admin@example.com' })));
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
    expect(screen.getByTestId('mfaSetupInfo').textContent).toBe('null');
    expect(JSON.parse(localStorage.getItem('adminUser'))).toEqual({ email: 'admin@example.com' });
    expect(screen.getByTestId('sessionStatus').textContent).toBe('verified');
    expect(screen.getByTestId('isAdmin').textContent).toBe('true');
    expect(adminAuthApi.adminRefresh).not.toHaveBeenCalled();
  });

  it('confirmMfaSetup(): invalid TOTP (rejected) leaves adminUser unset', async () => {
    adminAuthApi.adminMfaConfirm.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid TOTP code' } } });
    renderConsumer();

    fireEvent.click(screen.getByText('confirmSetup'));

    await waitFor(() => expect(adminAuthApi.adminMfaConfirm).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
  });

  // -------------------------------------------------------------------
  // verifyMfa() — TOTP verification (already-enrolled admin)
  // -------------------------------------------------------------------
  it('verifyMfa(): success persists the full admin profile, clears the pending stage, and IS itself a real verified session', async () => {
    const admin = { id: '1', name: 'Jane', email: 'jane@example.com', role: 'admin', permissions: ['users:read'] };
    adminAuthApi.adminMfaVerify.mockResolvedValue({ message: 'Login successful', admin });
    renderConsumer();

    fireEvent.click(screen.getByText('verify'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify(admin)));
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
    expect(JSON.parse(localStorage.getItem('adminUser'))).toEqual(admin);
    expect(screen.getByTestId('sessionStatus').textContent).toBe('verified');
    expect(screen.getByTestId('isAdmin').textContent).toBe('true');
    expect(adminAuthApi.adminRefresh).not.toHaveBeenCalled();
  });

  it('verifyMfa(): an invalid TOTP code (rejected) never sets adminUser', async () => {
    adminAuthApi.adminMfaVerify.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid TOTP code' } } });
    renderConsumer();

    fireEvent.click(screen.getByText('verify'));

    await waitFor(() => expect(adminAuthApi.adminMfaVerify).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(localStorage.getItem('adminUser')).toBe(null);
  });

  // -------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------
  it('logout(): closes the Admin shell - clears the cached profile, localStorage, and isAdmin/sessionStatus', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminAuthApi.adminRefresh.mockResolvedValue({}); // mount-time verifySession() for the cached profile
    adminAuthApi.adminLogout.mockResolvedValue({ message: 'Logged out successfully' });
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId('isAdmin').textContent).toBe('true'));

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe('null'));
    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
    expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated');
  });

  it('logout(): still clears the profile locally even if the API call fails (e.g. session already expired)', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminAuthApi.adminRefresh.mockResolvedValue({}); // mount-time verifySession() for the cached profile
    adminAuthApi.adminLogout.mockRejectedValue({ response: { status: 401 } });
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId('isAdmin').textContent).toBe('true'));

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe('null'));
    expect(localStorage.getItem('adminUser')).toBe(null);
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
  });

  it('a slow mount-time verifySession() that resolves AFTER logout() must not resurrect the session (epoch guard regression test)', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    let resolveRefresh;
    adminAuthApi.adminRefresh.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    adminAuthApi.adminLogout.mockResolvedValue({ message: 'Logged out successfully' });
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId('isChecking').textContent).toBe('true'));

    // Log out WHILE the mount-time verifySession() is still in flight.
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated'));

    // NOW let the stale verifySession() call resolve successfully - it must
    // be ignored, not flip isAdmin back to true after logout already ran.
    resolveRefresh({});
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByTestId('sessionStatus').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
  });
});
