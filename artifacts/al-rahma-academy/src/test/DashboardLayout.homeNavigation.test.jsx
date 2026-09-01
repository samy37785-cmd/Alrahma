import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import DashboardLayout from '../components/layout/DashboardLayout';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 5): logout
// used to call navigate('/'), react-router's imperative navigate - which,
// under a non-English <BrowserRouter basename>, produces "/fr" with no
// trailing slash (the same joinPaths special-case documented on
// localePath.js's homeHref()). Fixed by calling goHome() instead, a full
// window.location.assign() that bypasses the router's basename join
// entirely. This proves the real button click, for en/fr/it - not just
// the underlying goHome() utility (covered separately in
// localePath.test.js) - actually reaches window.location.assign with the
// correct canonical href, and never calls react-router's navigate('/').

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Amina Test', email: 'amina@example.com' }, logout: vi.fn() }),
}));
vi.mock('../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ isAdmin: false }),
}));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}));
vi.mock('../components/ui/CommandPalette', () => ({ default: () => null }));
vi.mock('../components/ui/NotificationPanel', () => ({ default: () => null }));
vi.mock('../components/ui/LangSwitcher', () => ({ default: () => null }));
vi.mock('../api/messageApi', () => ({ getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }) }));
vi.mock('../api/notificationApi', () => ({ getUnreadNotifs: vi.fn().mockResolvedValue({ count: 0 }) }));

// jsdom's window.location.assign is non-configurable, so vi.spyOn() on it
// directly throws "Cannot redefine property" - replace the whole location
// object with a controlled fake instead, preserving the real pathname
// (goHome() -> homeHref() -> langFromPath() reads it) while making assign()
// a real, assertable mock.
function stubLocation(path) {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: path, search: '', hash: '', assign },
  });
  return assign;
}

async function renderLayoutAt(path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <LangProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <DashboardLayout>
            <div>dashboard content</div>
          </DashboardLayout>
        </MemoryRouter>
      </QueryClientProvider>
    </LangProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(/user menu|menu utilisateur|menu utente/i));
  return user;
}

describe('DashboardLayout logout: goes home via a safe canonical navigation, not navigate("/")', () => {
  const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', realLocationDescriptor);
  });

  it('English: logout navigates to "/" via window.location.assign', async () => {
    const assign = stubLocation('/dashboard');
    const user = await renderLayoutAt('/dashboard');
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('French: logout navigates to "/fr/" (with trailing slash) via window.location.assign', async () => {
    const assign = stubLocation('/fr/dashboard');
    const user = await renderLayoutAt('/fr/dashboard');
    await user.click(screen.getByRole('menuitem', { name: /se déconnecter/i }));
    expect(assign).toHaveBeenCalledWith('/fr/');
  });

  it('Italian: logout navigates to "/it/" (with trailing slash) via window.location.assign', async () => {
    const assign = stubLocation('/it/dashboard');
    const user = await renderLayoutAt('/it/dashboard');
    await user.click(screen.getByRole('menuitem', { name: /esci/i }));
    expect(assign).toHaveBeenCalledWith('/it/');
  });
});
