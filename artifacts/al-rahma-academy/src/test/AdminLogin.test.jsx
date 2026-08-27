import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import AdminLogin from '../pages/AdminLogin';

// Production Readiness Audit — High finding: the admin MFA authentication
// flow shipped with zero test coverage. This file covers the AdminLogin
// page end-to-end (real AdminAuthContext, mocked only at the
// api/adminAuthApi.js network boundary): rendering, native validation,
// successful/failed login, the MFA-required (already-enrolled) flow, the
// first-time MFA-setup flow, valid/invalid TOTP submission, loading states,
// and error states.

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
}));

import * as adminAuthApi from '../api/adminAuthApi.js';

function renderAdminLogin() {
  return render(
    <LangProvider>
      <AdminAuthProvider>
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<div>Admin Dashboard Placeholder</div>} />
          </Routes>
        </MemoryRouter>
      </AdminAuthProvider>
    </LangProvider>,
  );
}

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------
  it('renders the credentials form by default (email + password + submit)', () => {
    renderAdminLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByText('Admin Sign In')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------
  it('validation: email and password inputs are marked required (native HTML5 validation)', () => {
    renderAdminLogin();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
  });

  it('validation: the 6-digit TOTP inputs are numeric, length-limited, and required (native HTML5 validation)', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa' });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const totpInput = await screen.findByLabelText('6-digit code');
    expect(totpInput).toBeRequired();
    expect(totpInput).toHaveAttribute('maxLength', '6');
    expect(totpInput).toHaveAttribute('inputMode', 'numeric');
  });

  // -------------------------------------------------------------------
  // Successful login → MFA-required flow → TOTP verification → navigate
  // -------------------------------------------------------------------
  it('successful login (already-enrolled admin): submits credentials, shows the TOTP-only form (no QR code), then navigates to /admin on valid TOTP', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa' });
    adminAuthApi.adminMfaVerify.mockResolvedValue({
      message: 'Login successful',
      admin: { id: '1', name: 'Jane', email: 'jane@example.com', role: 'admin' },
    });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeInTheDocument());
    expect(screen.queryByAltText('TOTP QR code')).not.toBeInTheDocument();
    expect(adminAuthApi.adminLogin).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'Sup3r-Str0ng-Pass!' });

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(screen.getByText('Admin Dashboard Placeholder')).toBeInTheDocument());
    expect(adminAuthApi.adminMfaVerify).toHaveBeenCalledWith('123456');
  });

  // -------------------------------------------------------------------
  // Failed login
  // -------------------------------------------------------------------
  it('failed login: shows the server error message and stays on the credentials form', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockRejectedValue({ response: { data: { message: 'Invalid credentials' } } });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app.')).not.toBeInTheDocument();
  });

  it('failed login: a network error with no response body falls back to a generic message', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockRejectedValue(new Error('Network Error'));
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed'));
  });

  // -------------------------------------------------------------------
  // MFA-setup (first-time) flow
  // -------------------------------------------------------------------
  it('MFA setup flow: a stage:"mfa_setup" response renders the QR code and secret, then activating navigates to /admin', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa_setup' });
    adminAuthApi.adminMfaSetup.mockResolvedValue({ qrCode: 'data:image/png;base64,abc', secret: 'BASE32SECRETKEY' });
    adminAuthApi.adminMfaConfirm.mockResolvedValue({ message: '2FA activated and session started' });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'newadmin@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByAltText('TOTP QR code')).toHaveAttribute('src', 'data:image/png;base64,abc'));
    expect(screen.getByText(/BASE32SECRETKEY/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('6-digit code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Activate & Sign In' }));

    await waitFor(() => expect(screen.getByText('Admin Dashboard Placeholder')).toBeInTheDocument());
    expect(adminAuthApi.adminMfaConfirm).toHaveBeenCalledWith('654321');
  });

  // -------------------------------------------------------------------
  // Invalid TOTP
  // -------------------------------------------------------------------
  it('invalid TOTP (already-enrolled admin): shows an error, stays on the TOTP form, and never navigates', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa' });
    adminAuthApi.adminMfaVerify.mockRejectedValue({ response: { data: { message: 'Invalid TOTP code' } } });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeInTheDocument());

    await user.type(screen.getByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid TOTP code'));
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard Placeholder')).not.toBeInTheDocument();
  });

  it('invalid TOTP during first-time setup: shows an error and stays on the MFA-setup form', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa_setup' });
    adminAuthApi.adminMfaSetup.mockResolvedValue({ qrCode: 'data:image/png;base64,abc', secret: 'BASE32SECRETKEY' });
    adminAuthApi.adminMfaConfirm.mockRejectedValue({ response: { data: { message: 'Invalid TOTP code' } } });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'newadmin@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeInTheDocument());

    await user.type(screen.getByLabelText('6-digit code'), '111111');
    await user.click(screen.getByRole('button', { name: 'Activate & Sign In' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid TOTP code'));
    expect(screen.getByAltText('TOTP QR code')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Loading states
  // -------------------------------------------------------------------
  it('loading state: the submit button shows a busy label and is disabled while the credentials request is in flight', async () => {
    const user = userEvent.setup();
    let resolveLogin;
    adminAuthApi.adminLogin.mockReturnValue(new Promise((r) => { resolveLogin = r; }));
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const busyButton = await screen.findByRole('button', { name: 'Signing in…' });
    expect(busyButton).toBeDisabled();

    resolveLogin({ stage: 'mfa' });
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeInTheDocument());
  });

  it('loading state: the TOTP submit button shows a busy label while verification is in flight', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockResolvedValue({ stage: 'mfa' });
    let resolveVerify;
    adminAuthApi.adminMfaVerify.mockReturnValue(new Promise((r) => { resolveVerify = r; }));
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeInTheDocument());

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    const busyButton = await screen.findByRole('button', { name: 'Verifying…' });
    expect(busyButton).toBeDisabled();

    resolveVerify({ message: 'Login successful', admin: { email: 'jane@example.com' } });
    await waitFor(() => expect(screen.getByText('Admin Dashboard Placeholder')).toBeInTheDocument());
  });

  // -------------------------------------------------------------------
  // Error states
  // -------------------------------------------------------------------
  it('error state: the error banner has role="alert" for screen readers and clears on a new submission', async () => {
    const user = userEvent.setup();
    adminAuthApi.adminLogin.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });
    renderAdminLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));

    adminAuthApi.adminLogin.mockResolvedValueOnce({ stage: 'mfa' });
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
