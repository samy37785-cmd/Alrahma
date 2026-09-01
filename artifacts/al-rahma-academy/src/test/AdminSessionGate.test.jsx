import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext';
import AdminSessionGate from '../components/ui/AdminSessionGate';

// Production Readiness Audit — High finding: the admin MFA authentication
// flow shipped with zero test coverage. This file covers AdminSessionGate
// (the second-factor route guard for /admin) both as a direct unit
// (render children vs. redirect) and as a real routing integration.
//
// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): this
// file used to assert that a merely-cached localStorage.adminUser was
// enough, by itself, to render the protected Admin content - exactly the
// fail-open bug this stage closes. It is rewritten here to prove the new
// fail-closed contract: a cached profile alone renders NOTHING (not the
// gate's protected children, not a login redirect either) until a real
// server round trip (mocked adminRefresh) resolves one way or the other.

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
  adminRefresh:    vi.fn(),
}));

import * as adminAuthApi from '../api/adminAuthApi.js';

function ProtectedContent() {
  return <div>Protected Admin Content</div>;
}

function LoginPlaceholder() {
  return <div>Admin Login Placeholder</div>;
}

// Exposes a real logout() call on the actual context, so the "expired
// session" test can prove AdminSessionGate reacts to the session being
// cleared while already rendering the protected route.
function LogoutControl() {
  const { logout } = useAdminAuth();
  return <button onClick={() => logout()}>logout</button>;
}

function renderGate({ initialEntries = ['/admin'] } = {}) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin/login" element={<LoginPlaceholder />} />
          <Route
            path="/admin"
            element={
              <AdminSessionGate>
                <ProtectedContent />
              </AdminSessionGate>
            }
          />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>,
  );
}

describe('AdminSessionGate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // Direct gate behavior
  // -------------------------------------------------------------------
  it('redirects to /admin/login when there is no cached AdminUser session at all', () => {
    renderGate();
    expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('a cached AdminUser session ALONE renders nothing yet - not the protected content, not the login redirect - while verification is in flight', () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com', role: 'admin' }));
    adminAuthApi.adminRefresh.mockImplementation(() => new Promise(() => {})); // never resolves
    renderGate();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Login Placeholder')).not.toBeInTheDocument();
  });

  it('renders the protected children only once the cached session is actually server-verified', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com', role: 'admin' }));
    adminAuthApi.adminRefresh.mockResolvedValue({});
    renderGate();
    await waitFor(() => expect(screen.getByText('Protected Admin Content')).toBeInTheDocument());
    expect(screen.queryByText('Admin Login Placeholder')).not.toBeInTheDocument();
  });

  it('a forged/stale cached session that fails verification (401) ends up redirected to /admin/login, never rendering protected content', async () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'attacker@example.com', role: 'admin' }));
    adminAuthApi.adminRefresh.mockRejectedValue({ response: { status: 401 } });
    renderGate();
    await waitFor(() => expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument());
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Protected route behavior (real routing integration, mirroring App.jsx)
  // -------------------------------------------------------------------
  it('protected route integration: a visitor with no session hitting /admin never sees protected content', () => {
    render(
      <AdminAuthProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin/login" element={<LoginPlaceholder />} />
            <Route
              path="/admin"
              element={
                <AdminSessionGate>
                  <ProtectedContent />
                </AdminSessionGate>
              }
            />
          </Routes>
        </MemoryRouter>
      </AdminAuthProvider>,
    );

    expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument();
  });

  it('expired session handling: logging out while on the protected route immediately redirects to /admin/login', async () => {
    adminAuthApi.adminLogout.mockResolvedValue({ message: 'Logged out successfully' });
    adminAuthApi.adminRefresh.mockResolvedValue({});
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com' }));

    function GateWithLogoutControl() {
      return (
        <AdminSessionGate>
          <ProtectedContent />
          <LogoutControl />
        </AdminSessionGate>
      );
    }

    render(
      <AdminAuthProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin/login" element={<LoginPlaceholder />} />
            <Route path="/admin" element={<GateWithLogoutControl />} />
          </Routes>
        </MemoryRouter>
      </AdminAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Protected Admin Content')).toBeInTheDocument());

    fireEvent.click(screen.getByText('logout'));

    // logout() clears the verified session in AdminAuthContext; AdminSessionGate
    // re-renders with isAdmin === false and returns <Navigate>, which the
    // real MemoryRouter follows immediately — no full page reload needed,
    // matching how App.jsx wires this gate around /admin in production.
    await waitFor(() => expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument());
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
    expect(localStorage.getItem('adminUser')).toBe(null);
  });
});
