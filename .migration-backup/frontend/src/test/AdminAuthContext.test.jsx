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

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
}));

import * as adminAuthApi from '../api/adminAuthApi.js';

function Consumer() {
  const ctx = useAdminAuth();
  return (
    <div>
      <span data-testid="adminUser">{JSON.stringify(ctx.adminUser)}</span>
      <span data-testid="pendingStage">{ctx.pendingStage ?? 'none'}</span>
      <span data-testid="mfaSetupInfo">{JSON.stringify(ctx.mfaSetupInfo)}</span>
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
  it('initial state: no cached profile means adminUser is null and no MFA stage is pending', () => {
    renderConsumer();
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
  });

  it('initial state: a valid cached profile is read from localStorage on mount', () => {
    localStorage.setItem('adminUser', JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'admin' }));
    renderConsumer();
    expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'admin' }));
  });

  it('initial state: corrupted localStorage JSON is handled gracefully (falls back to null, does not throw)', () => {
    localStorage.setItem('adminUser', '{not valid json');
    expect(() => renderConsumer()).not.toThrow();
    expect(screen.getByTestId('adminUser').textContent).toBe('null');
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
  it('confirmMfaSetup(): success persists a minimal profile (email) and clears the pending MFA-setup stage', async () => {
    adminAuthApi.adminMfaConfirm.mockResolvedValue({ message: '2FA activated and session started' });
    renderConsumer();

    fireEvent.click(screen.getByText('confirmSetup'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify({ email: 'admin@example.com' })));
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
    expect(screen.getByTestId('mfaSetupInfo').textContent).toBe('null');
    expect(JSON.parse(localStorage.getItem('adminUser'))).toEqual({ email: 'admin@example.com' });
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
  it('verifyMfa(): success persists the full admin profile and clears the pending stage', async () => {
    const admin = { id: '1', name: 'Jane', email: 'jane@example.com', role: 'admin', permissions: ['users:read'] };
    adminAuthApi.adminMfaVerify.mockResolvedValue({ message: 'Login successful', admin });
    renderConsumer();

    fireEvent.click(screen.getByText('verify'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe(JSON.stringify(admin)));
    expect(screen.getByTestId('pendingStage').textContent).toBe('none');
    expect(JSON.parse(localStorage.getItem('adminUser'))).toEqual(admin);
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
  it('logout(): clears the cached profile and localStorage on success', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminAuthApi.adminLogout.mockResolvedValue({ message: 'Logged out successfully' });
    renderConsumer();

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe('null'));
    expect(localStorage.getItem('adminUser')).toBe(null);
  });

  it('logout(): still clears the profile locally even if the API call fails (e.g. session already expired)', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));
    adminAuthApi.adminLogout.mockRejectedValue({ response: { status: 401 } });
    renderConsumer();

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('adminUser').textContent).toBe('null'));
    expect(localStorage.getItem('adminUser')).toBe(null);
  });
});
