import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import Dashboard from '../pages/Dashboard';

// A brand-new account was told "Your subscription has expired" with a red
// "Renew" banner (owner test, 2026-10-14). It never had a plan, so it now
// gets a welcome line and a free-trial button instead.

const auth = { user: null };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ ...auth, logout: vi.fn(), ensureSession: vi.fn(), sessionChecked: true }),
}));
vi.mock('../hooks/useDashboard', () => ({
  useDashboardData: () => ({ me: auth.user, enrollment: null, courses: [], loading: false, error: null, refetch: vi.fn() }),
}));

function renderAs(user) {
  auth.user = user;
  window.history.pushState({}, '', '/dashboard');
  return render(
    <LangProvider>
      <QueryProvider>
        <AdminAuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Dashboard />
          </MemoryRouter>
        </AdminAuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

afterEach(cleanup);

describe('Dashboard subscription line', () => {
  it('a new account (never subscribed) is welcomed and pointed at the free trial, not told it expired', () => {
    renderAs({ name: 'New Student', subscription: { status: 'inactive', plan: null, validUntil: null, activeSince: null } });
    expect(screen.getByText(/Start with a free 60-minute trial lesson/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book a Free Trial' }).getAttribute('href')).toBe('/enroll');
    expect(screen.queryByText(/has expired/)).toBeNull();
    expect(screen.queryByText('Renew Plan')).toBeNull();
  });

  it('an account whose plan ended still sees the expired banner and Renew', () => {
    renderAs({ name: 'Old Student', subscription: { status: 'inactive', plan: 'Basic', validUntil: '2026-01-01T00:00:00.000Z', activeSince: '2025-12-01T00:00:00.000Z' } });
    expect(screen.getByText(/Your subscription has expired/)).toBeTruthy();
    expect(screen.getByText('Renew Plan')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Book a Free Trial' })).toBeNull();
  });
});
