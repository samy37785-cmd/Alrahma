import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Production Polish Sprint: coverage for the new RBAC-aware error-surfacing
// banner (a failed admin data query — most commonly a 403 for a role lacking
// the relevant RBAC permission — must render a visible banner instead of the
// silent "0 users/0 payments" an empty-array fallback would otherwise show).
//
// Mocks only the api/ network boundary (same convention as useBilling.test.jsx)
// plus every child tab component and DashboardLayout — AdminDashboard mounts
// every tab simultaneously (hidden divs, not conditional mounting), so
// rendering their real implementations here would make this test heavy and
// brittle for behaviour this file isn't about. (Stage 2B: the Staff tab was
// removed along with AdminStaffTab.jsx - see
// docs/legacy-role-dashboard-pruning.md. Booking-First Enrollment added the
// Bookings tab, backed by api/enrollmentApi.js's getEnrollments.)

vi.mock('../api/courseApi', () => ({ getCourses: vi.fn() }));
vi.mock('../api/paymentApi', () => ({ getManualPayments: vi.fn() }));
vi.mock('../api/adminApi', () => ({ getUsers: vi.fn(), getOverviewStats: vi.fn() }));
vi.mock('../api/contentApi', () => ({ getTrials: vi.fn(), getSubscribers: vi.fn() }));
vi.mock('../api/enrollmentApi', () => ({ getEnrollments: vi.fn(), updateEnrollment: vi.fn() }));
vi.mock('../api/reviewApi', () => ({ getAdminReviews: vi.fn() }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../components/features/admin/AdminCoursesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminTrialsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminPaymentsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminBookingsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminNewsletterTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminUsersTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminClassesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminReviewsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminProgressModal', () => ({ default: () => <div /> }));

import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers, getOverviewStats } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
import { getEnrollments } from '../api/enrollmentApi';
import { getAdminReviews } from '../api/reviewApi';
import AdminDashboard from '../pages/AdminDashboard';

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminDashboard />
    </QueryClientProvider>,
  );
}

function mockAllSucceed() {
  getCourses.mockResolvedValue([]);
  getManualPayments.mockResolvedValue({ data: [], total: 0 });
  getUsers.mockResolvedValue({ data: [], total: 0 });
  getTrials.mockResolvedValue([]);
  getSubscribers.mockResolvedValue([]);
  getEnrollments.mockResolvedValue({ data: [], total: 0 });
  getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
  getOverviewStats.mockResolvedValue(overviewStats());
}

describe('AdminDashboard — RBAC-aware load-error banner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('all queries succeed: no error banner is rendered', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });

  // The community tab read endpoints that never existed on the server, so it
  // always put "community posts, community comments" in the banner.
  it('has no community tab', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /community/i })).not.toBeInTheDocument();
  });

  it('a single failed query (e.g. a 403 for a role lacking users:read) names that section in the banner', async () => {
    mockAllSucceed();
    getUsers.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: users/)).toBeInTheDocument());
    expect(screen.getByText(/permission/)).toBeInTheDocument();
  });

  it('a failed reviews query names "reviews" in the banner', async () => {
    mockAllSucceed();
    getAdminReviews.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: reviews/)).toBeInTheDocument());
  });

  it('multiple failed queries are all named in the banner, in query-declaration order', async () => {
    mockAllSucceed();
    getCourses.mockRejectedValue(new Error('Forbidden'));
    getManualPayments.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: courses, payments/)).toBeInTheDocument());
  });
});

// The Overview's figures come from GET /v1/admin/stats/overview, counted on
// the server over every record (AdminOverviewPanel.test.jsx covers each
// card). The page used to count them in the browser from the first 50
// users, which also ignored subscription end dates.
function overviewStats({ pendingBookings = 0 } = {}) {
  const zeroMonths = (n) => Array.from({ length: n }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, count: 0 }));
  return {
    generatedAt: '2026-10-19T12:00:00.000Z',
    timeZone: 'UTC',
    sections: {
      users: { status: 'ok', total: 60, newByMonth: zeroMonths(7) },
      subscriptions: { status: 'ok', active: 20, markedActiveButExpired: 10 },
      bookings: {
        status: 'ok', total: 70,
        byStatus: { pending: pendingBookings, contacted: 0, awaiting_payment: 0, paid: 0, enrolled: 0, cancelled: 0, other: 0 },
        newByMonth: zeroMonths(6),
      },
      bookingPayments: { status: 'ok', paidByCurrency: [], paidMissingDetails: 0, awaitingPayment: { count: 0, agreedByCurrency: [] }, paidByMonth: zeroMonths(6) },
      trials: { status: 'ok', total: 0, byStatus: { new: 0, contacted: 0, scheduled: 0, other: 0 } },
      newsletter: { status: 'ok', total: 0 },
      legacyManualPayments: { status: 'ok', total: 0, byStatus: { pending: 0, approved: 0, rejected: 0, other: 0 } },
      courses: { status: 'ok', total: 0, published: 0, items: [] },
      activity: { status: 'ok', events: [], omitted: [] },
    },
  };
}

const statValue = (label) => screen.getByText(label).closest('.ds-stat').querySelector('.ds-stat__value').textContent;
const tabBadge = (name) => screen.getByRole('tab', { name: new RegExp(name) }).querySelector('.ds-badge')?.textContent ?? null;

describe('AdminDashboard Overview: server counts, not the first page of a list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the server totals even though the user list holds only two accounts', async () => {
    mockAllSucceed();
    getUsers.mockResolvedValue({
      data: [
        { _id: '1', name: 'A', role: 'teacher', subscription: { status: 'active' } },
        { _id: '2', name: 'B', role: 'student', subscription: { status: 'active', validUntil: '2020-01-01' } },
      ],
      total: 2,
    });
    renderDashboard();

    await waitFor(() => expect(statValue('Accounts')).toBe('60'));
    expect(statValue('Paid access now')).toBe('20');
    expect(statValue('Booking requests')).toBe('70');
  });

  // Stage 2C (docs/user-admin-auth-contract.md) removed the role-based KPIs
  // and the unproven trial-to-subscriber "Conversion Rate"; they stay gone.
  it('never renders role-based KPIs, a conversion rate, or the old payment cards', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Accounts')).toBeInTheDocument());
    for (const gone of ['Active Students', 'Active Subscribers', 'Conversion Rate', 'Pending Payments', 'Total Users']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/^Teachers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trials\s*→\s*Active/)).not.toBeInTheDocument();
  });

  it('a failed overview request shows that, and no figure, while the other tabs still load', async () => {
    mockAllSucceed();
    getOverviewStats.mockRejectedValue({ response: { status: 500 } });
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/The overview figures could not be loaded \(HTTP 500\)/)).toBeInTheDocument());
    expect(statValue('Accounts')).toBe('—');
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });
});

describe('AdminDashboard tab badges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Trials counts requests nobody has contacted yet (status "new")', async () => {
    mockAllSucceed();
    getTrials.mockResolvedValue([{ _id: 't1', status: 'new' }, { _id: 't2', status: 'new' }, { _id: 't3', status: 'contacted' }, { _id: 't4', status: 'scheduled' }]);
    renderDashboard();

    await waitFor(() => expect(tabBadge('Trials')).toBe('2'));
  });

  it('Bookings counts new requests over every booking, not just the newest 50 in the list', async () => {
    mockAllSucceed();
    getOverviewStats.mockResolvedValue(overviewStats({ pendingBookings: 60 }));
    getEnrollments.mockResolvedValue({ data: [{ _id: 'b1', status: 'pending' }], total: 70 });
    renderDashboard();

    await waitFor(() => expect(tabBadge('Bookings')).toBe('60'));
  });

  it('Bookings falls back to the loaded list when the overview figures fail', async () => {
    mockAllSucceed();
    getOverviewStats.mockRejectedValue(new Error('Network Error'));
    getEnrollments.mockResolvedValue({ data: [{ _id: 'b1', status: 'pending' }, { _id: 'b2', status: 'contacted' }], total: 2 });
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/The overview figures could not be loaded/)).toBeInTheDocument());
    expect(tabBadge('Bookings')).toBe('1');
  });
});
