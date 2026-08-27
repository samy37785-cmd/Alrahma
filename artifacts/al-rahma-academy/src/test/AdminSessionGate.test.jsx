import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext';
import AdminSessionGate from '../components/ui/AdminSessionGate';

// Production Readiness Audit — High finding: the admin MFA authentication
// flow shipped with zero test coverage. This file covers AdminSessionGate
// (the second-factor route guard for /admin) both as a direct unit
// (render children vs. redirect) and as a real routing integration (a
// visitor with no AdminUser session is bounced to /admin/login; one with a
// valid cached session reaches the protected content), mirroring how
// App.jsx actually wires <AdminSessionGate> around <AdminDashboard>.

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
}));

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
  });

  // -------------------------------------------------------------------
  // Direct gate behavior
  // -------------------------------------------------------------------
  it('redirects to /admin/login when there is no cached AdminUser session', () => {
    renderGate();
    expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('renders the protected children when a cached AdminUser session exists', () => {
    localStorage.setItem('adminUser', JSON.stringify({ email: 'jane@example.com', role: 'admin' }));
    renderGate();
    expect(screen.getByText('Protected Admin Content')).toBeInTheDocument();
    expect(screen.queryByText('Admin Login Placeholder')).not.toBeInTheDocument();
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
    const adminAuthApi = await import('../api/adminAuthApi.js');
    adminAuthApi.adminLogout.mockResolvedValue({ message: 'Logged out successfully' });
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

    expect(screen.getByText('Protected Admin Content')).toBeInTheDocument();

    fireEvent.click(screen.getByText('logout'));

    // logout() clears adminUser in AdminAuthContext; AdminSessionGate
    // re-renders with adminUser === null and returns <Navigate>, which the
    // real MemoryRouter follows immediately — no full page reload needed,
    // matching how App.jsx wires this gate around /admin in production.
    await waitFor(() => expect(screen.getByText('Admin Login Placeholder')).toBeInTheDocument());
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
    expect(localStorage.getItem('adminUser')).toBe(null);
  });
});
