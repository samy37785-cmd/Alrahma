import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationPanel from '../components/ui/NotificationPanel';

// T25 (final engineering audit): NotificationPanel previously destructured a
// non-existent `getNotifications` export from notificationApi.js (the real
// export is `getMyNotifications`) and, separately, treated its resolved
// value as a bare array — but the real endpoint resolves the full paginated
// body ({ notifications, total, unreadCount, page, pages }). Both bugs
// together meant the panel's queryFn always threw and was silently swallowed
// by its own try/catch, so notifications never rendered in production
// regardless of what the backend actually had. Verifies real data now
// reaches the list.

vi.mock('../api/notificationApi.js', () => ({
  getMyNotifications: vi.fn(),
}));

import { getMyNotifications } from '../api/notificationApi.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('NotificationPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders real notifications returned by the API (not the empty state)', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [
        { _id: '1', title: 'Class starting soon', type: 'class', createdAt: new Date().toISOString() },
        { _id: '2', title: 'New message', type: 'message', createdAt: new Date().toISOString() },
      ],
      total: 2,
      unreadCount: 2,
      page: 1,
      pages: 1,
    });

    const Wrapper = wrapper();
    render(<NotificationPanel />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Class starting soon')).toBeInTheDocument());
    expect(screen.getByText('New message')).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are genuinely no notifications', async () => {
    getMyNotifications.mockResolvedValue({ notifications: [], total: 0, unreadCount: 0, page: 1, pages: 0 });

    const Wrapper = wrapper();
    render(<NotificationPanel />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/all caught up/i)).toBeInTheDocument());
  });
});
