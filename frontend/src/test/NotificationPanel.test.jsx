import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
//
// v1.1.0 roadmap #1: mark-read/mark-all-read previously only updated local
// component state, so a reload showed every notification as unread again
// even though the backend's markNotifRead/markAllNotifsRead endpoints already
// existed and were already tested. Verifies the panel now calls them and
// reflects the server's `read` field after each mutation.

vi.mock('../api/notificationApi.js', () => ({
  getMyNotifications: vi.fn(),
  markNotifRead: vi.fn(),
  markAllNotifsRead: vi.fn(),
}));

import { getMyNotifications, markNotifRead, markAllNotifsRead } from '../api/notificationApi.js';

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

  it('marks a single notification as read on the backend and reflects it after the mutation resolves', async () => {
    getMyNotifications
      .mockResolvedValueOnce({
        notifications: [{ _id: '1', title: 'Class starting soon', type: 'class', read: false, createdAt: new Date().toISOString() }],
        total: 1, unreadCount: 1, page: 1, pages: 1,
      })
      .mockResolvedValueOnce({
        notifications: [{ _id: '1', title: 'Class starting soon', type: 'class', read: true, createdAt: new Date().toISOString() }],
        total: 1, unreadCount: 0, page: 1, pages: 1,
      });
    markNotifRead.mockResolvedValue({ notification: { _id: '1', read: true } });

    const Wrapper = wrapper();
    render(<NotificationPanel />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Class starting soon')).toBeInTheDocument());
    const item = screen.getByText('Class starting soon').closest('.ds-notif__item');
    expect(item).toHaveClass('ds-notif__item--unread');

    await userEvent.click(item);

    expect(markNotifRead.mock.calls[0][0]).toBe('1');
    await waitFor(() =>
      expect(screen.getByText('Class starting soon').closest('.ds-notif__item')).not.toHaveClass('ds-notif__item--unread')
    );
  });

  it('marks all notifications as read via "Mark all read" and hides the button once none remain unread', async () => {
    getMyNotifications
      .mockResolvedValueOnce({
        notifications: [
          { _id: '1', title: 'Class starting soon', type: 'class', read: false, createdAt: new Date().toISOString() },
          { _id: '2', title: 'New message', type: 'message', read: false, createdAt: new Date().toISOString() },
        ],
        total: 2, unreadCount: 2, page: 1, pages: 1,
      })
      .mockResolvedValueOnce({
        notifications: [
          { _id: '1', title: 'Class starting soon', type: 'class', read: true, createdAt: new Date().toISOString() },
          { _id: '2', title: 'New message', type: 'message', read: true, createdAt: new Date().toISOString() },
        ],
        total: 2, unreadCount: 0, page: 1, pages: 1,
      });
    markAllNotifsRead.mockResolvedValue({ message: 'All notifications marked as read' });

    const Wrapper = wrapper();
    render(<NotificationPanel />, { wrapper: Wrapper });

    const markAllBtn = await screen.findByRole('button', { name: /mark all read/i });
    await userEvent.click(markAllBtn);

    expect(markAllNotifsRead).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    );
  });
});
