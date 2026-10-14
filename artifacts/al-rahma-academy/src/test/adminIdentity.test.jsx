import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import Header from '../components/layout/Header';
import { bottomNavFor } from '../components/layout/dashboardNav';

// A browser can hold a regular session and the separate AdminUser + MFA
// session at once (owner report, 2026-10-14: the admin console showed the
// owner's student account name next to "Administrator"). While the admin
// session is verified, the admin account is what the site shows, and
// signing out ends both sessions.

const auth = { user: null, logout: vi.fn() };
const admin = { isAdmin: false, adminUser: null, logout: vi.fn() };

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => admin }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }));
vi.mock('../components/ui/CommandPalette', () => ({ default: () => null }));
vi.mock('../components/ui/NotificationPanel', () => ({ default: () => null }));
vi.mock('../components/ui/LangSwitcher', () => ({ default: () => null }));
vi.mock('../api/messageApi', () => ({ getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }) }));
vi.mock('../api/notificationApi', () => ({ getUnreadNotifs: vi.fn().mockResolvedValue({ count: 0 }) }));

const STUDENT = { name: 'Mahmoud Samy', email: 'student@example.com' };
const ADMIN = { name: 'Academy Admin', email: 'admin@example.com' };

function wrap(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <LangProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin']}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </LangProvider>,
  );
}

beforeEach(() => {
  auth.user = null; auth.logout = vi.fn().mockResolvedValue();
  admin.isAdmin = false; admin.adminUser = null; admin.logout = vi.fn().mockResolvedValue();
});
afterEach(cleanup);

describe('dashboard shell', () => {
  it('with both sessions, shows the admin account, not the regular one', async () => {
    auth.user = STUDENT;
    admin.isAdmin = true; admin.adminUser = ADMIN;
    wrap(<DashboardLayout><div /></DashboardLayout>);

    expect(screen.getAllByText('Academy Admin').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mahmoud Samy')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('admin@example.com')).toBeTruthy();
    expect(within(menu).queryByText('student@example.com')).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /profile/i })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /billing/i })).toBeNull();
  });

  it('signing out as admin ends the admin and the regular session', async () => {
    auth.user = STUDENT;
    admin.isAdmin = true; admin.adminUser = ADMIN;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/admin', search: '', hash: '', assign: vi.fn() },
    });
    wrap(<DashboardLayout><div /></DashboardLayout>);

    await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(admin.logout).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('a first-login admin profile with only an email still gets a name', () => {
    admin.isAdmin = true; admin.adminUser = { email: 'owner@example.com' };
    wrap(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getAllByText('owner').length).toBeGreaterThan(0);
  });

  it('without an admin session, the regular account is shown as before', () => {
    auth.user = STUDENT;
    wrap(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getAllByText('Mahmoud Samy').length).toBeGreaterThan(0);
  });

  it('the admin bottom nav never links to the regular profile page', () => {
    expect(bottomNavFor(true, 0).map((i) => i.to)).not.toContain('/profile');
  });
});

describe('site header', () => {
  it('an admin with no regular session is shown as signed in, as the admin', async () => {
    admin.isAdmin = true; admin.adminUser = ADMIN;
    const { container } = wrap(<Header />);

    expect(screen.queryByRole('link', { name: 'Login' })).toBeNull();
    const btn = container.querySelector('.nav__user-btn');
    expect(btn.textContent).toContain('Academy');
    await userEvent.click(btn);
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent.trim());
    expect(items.some((t) => /dashboard/i.test(t))).toBe(true);
    expect(items.some((t) => /profile|invoices/i.test(t))).toBe(false);
  });

  it('with both sessions, the header names the admin account', () => {
    auth.user = STUDENT;
    admin.isAdmin = true; admin.adminUser = ADMIN;
    wrap(<Header />);
    expect(screen.getAllByText('Academy').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mahmoud')).toBeNull();
  });
});
