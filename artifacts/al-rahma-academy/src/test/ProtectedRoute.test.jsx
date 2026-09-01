import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import ProtectedRoute from '../components/ui/ProtectedRoute';

// Stage 2A (see docs/user-admin-auth-contract.md, Sections 5-6, 10): covers
// ProtectedRoute's two gating modes end to end (real AuthProvider +
// AdminAuthProvider, mocked only at the api/*.js network boundary, same
// level as every other auth test in this suite):
//   - adminOnly: gated exclusively by the real AdminUser + MFA session,
//     never by the regular user session or a regular account's `role`
//     field (proves the core Stage 2A security property: a spoofed/legacy
//     `role: 'admin'` does not grant admin).
//   - otherwise: gated by the regular user session, with the
//     still-confirming / confirmed-absent distinction preserved.
//
// Stage 2C Final Corrective: the adminOnly block is rewritten - a cached
// AdminUser session alone used to render the protected content
// immediately (fail-open). It now renders nothing while verification
// (mocked adminRefresh) is in flight, and only renders once verified.

vi.mock('../api/authApi.js', () => ({
  loginUser:  vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  getMe:      vi.fn(),
  updateMe:   vi.fn(),
}));
vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
  adminRefresh:    vi.fn(),
}));

import * as authApi from '../api/authApi.js';
import * as adminAuthApi from '../api/adminAuthApi.js';

function renderProtected({ adminOnly = false } = {}) {
  return render(
    <QueryProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={<ProtectedRoute adminOnly={adminOnly}><div>Protected Content</div></ProtectedRoute>}
              />
              <Route path="/admin/login" element={<div>Admin Login Page</div>} />
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </AdminAuthProvider>
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // -------------------------------------------------------------------
  // adminOnly - gated by the real AdminUser + MFA session only
  // -------------------------------------------------------------------
  it('adminOnly: no AdminUser session at all -> redirects to /admin/login', async () => {
    renderProtected({ adminOnly: true });
    await waitFor(() => expect(screen.getByText('Admin Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('adminOnly: a cached AdminUser session alone renders NOTHING yet - neither the protected content nor a redirect - while verification is in flight', () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'admin@example.com' }));
    adminAuthApi.adminRefresh.mockImplementation(() => new Promise(() => {}));
    renderProtected({ adminOnly: true });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Login Page')).not.toBeInTheDocument();
    // Never touched the regular-session API at all for an adminOnly route.
    expect(authApi.getMe).not.toHaveBeenCalled();
  });

  it('adminOnly: a cached AdminUser session that IS server-verified -> renders the protected content, with no regular-login step needed', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'admin@example.com' }));
    adminAuthApi.adminRefresh.mockResolvedValue({});
    renderProtected({ adminOnly: true });
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
    expect(authApi.getMe).not.toHaveBeenCalled();
  });

  it('adminOnly: a cached AdminUser session that FAILS verification (401) -> redirected to /admin/login, never rendering protected content', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'attacker@example.com' }));
    adminAuthApi.adminRefresh.mockRejectedValue({ response: { status: 401 } });
    renderProtected({ adminOnly: true });
    await waitFor(() => expect(screen.getByText('Admin Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('adminOnly: a regular user logged in but with NO AdminUser session -> still denied, redirected to /admin/login', async () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'user' }));
    authApi.getMe.mockResolvedValue({ name: 'Jane', email: 'jane@example.com', role: 'user' });
    renderProtected({ adminOnly: true });
    await waitFor(() => expect(screen.getByText('Admin Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('adminOnly: a regular account spoofing role: "admin" is still denied - the regular role field never grants admin', async () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Spoofer', email: 'spoof@example.com', role: 'admin' }));
    authApi.getMe.mockResolvedValue({ name: 'Spoofer', email: 'spoof@example.com', role: 'admin' });
    renderProtected({ adminOnly: true });
    await waitFor(() => expect(screen.getByText('Admin Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // regular (non-adminOnly) gating
  // -------------------------------------------------------------------
  it('regular route: no cached user, session confirmation still pending -> renders nothing yet (no premature redirect)', async () => {
    let resolveGetMe;
    authApi.getMe.mockReturnValue(new Promise((r) => { resolveGetMe = r; }));
    renderProtected({ adminOnly: false });

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();

    resolveGetMe({ name: 'Jane' });
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });

  it('regular route: no cached user, session confirmed absent (401) -> redirects to /login', async () => {
    authApi.getMe.mockRejectedValue({ response: { status: 401 } });
    renderProtected({ adminOnly: false });
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('regular route: a cached user -> renders the protected content immediately', () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'user' }));
    authApi.getMe.mockResolvedValue({ name: 'Jane', email: 'jane@example.com', role: 'user' });
    renderProtected({ adminOnly: false });
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
