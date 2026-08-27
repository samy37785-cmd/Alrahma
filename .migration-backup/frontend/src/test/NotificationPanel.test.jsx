import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationPanel from '../components/ui/NotificationPanel';

// T25 (final engineering audit): NotificationPanel previously destructured a
// non-existent `getNotifications` export from notificationApi.js (the real
// export is `getMyNotifications`) and, separately, treated its resolved
// value as a bare array — but the real endpoint resolves the full paginated
// body ({ notifications, total, unreadCount, page, pages }). Both bugs
// together meant the panel's queryFn always threw and was silently swallowed
// by its own try/catch, so notifications never rendered in production
// regardless of what the backend actually had.
//
// Feature Sprint 1: the panel previously tracked "read" state purely in
// local component state (never calling the mark-read/mark-all-read APIs,
// so refreshing the page reset everything) and never navigated anywhere on
// click. This file now also covers the real API-backed mark read/mark all
// read behavior, click-to-navigate, pagination ("Load more"), and the
// loading/error states.

vi.mock('../api/notificationApi.js', () => ({
  getMyNotifications: vi.fn(),
  markNotifRead: vi.fn(),
  markAllNotifsRead: vi.fn(),
}));

import { getMyNotifications, markNotifRead, markAllNotifsRead } from '../api/notificationApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<NotificationPanel {...props} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseNotif = (overrides = {}) => ({
  _id: '1', title: 'Class starting soon', body: 'Your class starts in 10 minutes',
  type: 'class_scheduled', link: '/dashboard', read: false, createdAt: new Date().toISOString(),
  ...overrides,
});

describe('NotificationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markNotifRead.mockResolvedValue({});
    markAllNotifsRead.mockResolvedValue({});
  });

  it('shows a loading state before the query resolves', async () => {
    let resolveFetch;
    getMyNotifications.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    renderPanel();

    expect(screen.getByText(/loading notifications/i)).toBeInTheDocument();
    resolveFetch({ notifications: [], total: 0, unreadCount: 0 });
    await waitFor(() => expect(screen.queryByText(/loading notifications/i)).not.toBeInTheDocument());
  });

  it('renders real notifications returned by the API (not the empty state)', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [
        baseNotif({ _id: '1', title: 'Class starting soon', type: 'class_scheduled' }),
        baseNotif({ _id: '2', title: 'New message', type: 'message_received' }),
      ],
      total: 2,
      unreadCount: 2,
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Class starting soon')).toBeInTheDocument());
    expect(screen.getByText('New message')).toBeInTheDocument();
    expect(screen.getByText('Notifications (2)')).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are genuinely no notifications', async () => {
    getMyNotifications.mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 });

    renderPanel();

    await waitFor(() => expect(screen.getByText(/all caught up/i)).toBeInTheDocument());
  });

  it('shows an error state with a retry button when the request fails', async () => {
    getMyNotifications.mockRejectedValue(new Error('Network error'));

    renderPanel();

    await waitFor(() => expect(screen.getByText(/couldn't load notifications/i)).toBeInTheDocument());
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();

    getMyNotifications.mockResolvedValue({ notifications: [baseNotif()], total: 1, unreadCount: 1 });
    await userEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByText('Class starting soon')).toBeInTheDocument());
  });

  it('clicking an unread notification marks it read via the API and navigates to its link', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [baseNotif({ _id: 'n1', link: '/billing' })],
      total: 1,
      unreadCount: 1,
    });
    const onClose = vi.fn();

    renderPanel({ onClose });

    const item = await screen.findByText('Class starting soon');
    await userEvent.click(item);

    expect(markNotifRead.mock.calls[0][0]).toBe('n1');
    expect(mockNavigate).toHaveBeenCalledWith('/billing');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking an already-read notification does not call markNotifRead again, but still navigates', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [baseNotif({ _id: 'n2', read: true, link: '/profile' })],
      total: 1,
      unreadCount: 0,
    });

    renderPanel();

    const item = await screen.findByText('Class starting soon');
    await userEvent.click(item);

    expect(markNotifRead).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('"Mark all read" calls the mark-all-read API', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [baseNotif({ _id: 'n3' })],
      total: 1,
      unreadCount: 1,
    });

    renderPanel();

    const markAllBtn = await screen.findByRole('button', { name: /mark all read/i });
    await userEvent.click(markAllBtn);

    expect(markAllNotifsRead).toHaveBeenCalled();
  });

  it('"Mark all read" is not shown when there are no unread notifications', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [baseNotif({ read: true })],
      total: 1,
      unreadCount: 0,
    });

    renderPanel();

    await screen.findByText('Class starting soon');
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('shows a "Load more" button when there are more notifications than currently loaded, and requests a bigger page on click', async () => {
    getMyNotifications.mockResolvedValue({
      notifications: [baseNotif({ _id: 'n4' })],
      total: 5,
      unreadCount: 1,
    });

    renderPanel();

    const loadMoreBtn = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      const lastCall = getMyNotifications.mock.calls.at(-1);
      expect(lastCall[0].limit).toBeGreaterThan(10);
    });
  });

  it('the close button calls onClose', async () => {
    getMyNotifications.mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 });
    const onClose = vi.fn();

    renderPanel({ onClose });

    await waitFor(() => expect(screen.getByText(/all caught up/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /close notifications/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
