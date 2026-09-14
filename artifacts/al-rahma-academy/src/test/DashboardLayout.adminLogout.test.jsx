import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import DashboardLayout from '../components/layout/DashboardLayout';

// Auth hardening security batch: a real bug, found by actually driving the
// "Log out" button from the admin console in a browser (Chrome DevTools
// verification), not just reading the code. AdminDashboard.jsx renders
// inside this SAME shared DashboardLayout the regular customer dashboard
// uses. handleLogout used to call ONLY useAuth().logout() (the regular
// customer session) unconditionally, regardless of which session was
// actually active — on a real admin session this meant clicking "Log out"
// fired POST /api/auth/logout (a session that may not even exist for an
// admin-only operator) while the real admin_at/admin_rt cookies were left
// completely untouched: the admin stayed fully logged in, silently, behind
// what looked like a working logout button. A subsequent
// POST /api/v1/admin/auth/refresh still succeeded after "logging out".
//
// This proves the fix: when isAdmin is true (the same real, fail-closed
// signal — AdminAuthContext's sessionStatus — used everywhere else in this
// app to distinguish the two sessions), Log out must call the ADMIN
// logout() and land on /admin/login, and must NEVER call the regular
// session's logout().

const regularLogout = vi.fn();
// A controllable, deferred promise (not vi.fn().mockResolvedValue(), which
// resolves on the same microtask tick and can't distinguish "awaited
// correctly" from "fired and forgotten") -- lets the test assert that the
// redirect genuinely waits for this promise to settle, not just that both
// eventually happened in some order.
let resolveAdminLogout;
const adminLogoutFn = vi.fn(() => new Promise((resolve) => { resolveAdminLogout = resolve; }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Admin Operator', email: 'admin@example.com' }, logout: regularLogout }),
}));
vi.mock('../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ isAdmin: true, logout: adminLogoutFn }),
}));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}));
vi.mock('../components/ui/CommandPalette', () => ({ default: () => null }));
vi.mock('../components/ui/NotificationPanel', () => ({ default: () => null }));
vi.mock('../components/ui/LangSwitcher', () => ({ default: () => null }));
vi.mock('../api/messageApi', () => ({ getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }) }));
vi.mock('../api/notificationApi', () => ({ getUnreadNotifs: vi.fn().mockResolvedValue({ count: 0 }) }));

// Same jsdom workaround as DashboardLayout.homeNavigation.test.jsx: window.
// location.assign is non-configurable, so replace the whole object.
function stubLocation(path) {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: path, search: '', hash: '', assign },
  });
  return assign;
}

describe('DashboardLayout logout, admin session (isAdmin: true): uses the real admin logout, never the regular one', () => {
  const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', realLocationDescriptor);
  });

  it('clicking Log out on an admin session awaits the admin logout() before redirecting — and never calls the regular logout()', async () => {
    const assign = stubLocation('/admin');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <LangProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/admin']}>
            <DashboardLayout>
              <div>admin console content</div>
            </DashboardLayout>
          </MemoryRouter>
        </QueryClientProvider>
      </LangProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/user menu/i));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    // The admin logout() call has started, but its promise is still
    // pending (resolveAdminLogout has not been called yet) — the redirect
    // must NOT have happened yet. This is the actual regression this batch
    // fixes: the previous code called window.location.assign() immediately
    // after firing adminLogout(), without waiting for it, letting the full
    // page navigation potentially abort the still-in-flight
    // POST /api/v1/admin/auth/logout request before the server cleared the
    // admin_at/admin_rt cookies.
    expect(adminLogoutFn).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(regularLogout).not.toHaveBeenCalled();

    // Now let the pending logout request "complete" server-side.
    resolveAdminLogout();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/login'));
    expect(regularLogout).not.toHaveBeenCalled();
  });

  // The redirect lives in a `finally` block specifically so a rejected/
  // failed adminLogout() call (network error, server 5xx, etc.) still
  // lands the operator on /admin/login instead of stranding them on a
  // dashboard that looks logged in but no longer has a valid session to
  // read. Not exercised here via a real component click+reject, because
  // handleLogout is fired from an onClick handler whose returned promise
  // nothing in React consumes — a rejection there surfaces as a jsdom/
  // Node "unhandled rejection" regardless of the internal `finally`
  // running correctly, making it an unreliable, noisy thing to assert on
  // through this component-level harness. The `finally` placement itself
  // (see DashboardLayout.jsx's handleLogout) is what guarantees this;
  // it is structural, not something a mocked promise rejection can prove
  // more than reading the code already does.
});
