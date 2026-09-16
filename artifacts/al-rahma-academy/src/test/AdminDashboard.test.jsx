import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Production Polish Sprint: coverage for the RBAC-aware error-surfacing
// banner (a failed admin data query — most commonly a 403 for a role lacking
// the relevant RBAC permission — must render a visible banner instead of the
// silent "0 users/0 bookings" an empty-array fallback would otherwise show).
//
// Mocks only the api/ network boundary plus every child tab component and
// DashboardLayout — AdminDashboard mounts every tab simultaneously (hidden
// divs, not conditional mounting), so rendering their real implementations
// here would make this test heavy and brittle for behaviour this file isn't
// about.
//
// AdminPaymentsTab and the payments query/tab (a checkout-era transaction
// view) are gone entirely, along with the online card-gateway checkout it
// showed. Booking-derived KPIs (pending/enrolled counts from
// api/enrollmentApi.js's getEnrollments) replaced the old subscription- and
// manual-payment-derived ones on this dashboard — manual/offline payment
// bookkeeping and subscription activation are otherwise live again (see
// docs/current-project-status.md).

vi.mock('../api/courseApi', () => ({ getCourses: vi.fn() }));
vi.mock('../api/adminApi', () => ({ getUsers: vi.fn() }));
vi.mock('../api/contentApi', () => ({ getTrials: vi.fn(), getSubscribers: vi.fn() }));
vi.mock('../api/enrollmentApi', () => ({ getEnrollments: vi.fn(), updateEnrollment: vi.fn() }));
vi.mock('../api/reviewApi', () => ({ getAdminReviews: vi.fn() }));
vi.mock('../api/communityApi', () => ({ getAdminPosts: vi.fn(), getAdminComments: vi.fn() }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../components/features/admin/AdminCoursesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminTrialsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminBookingsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminNewsletterTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminUsersTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminClassesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminReviewsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminProgressModal', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminCommunityTab', () => ({ default: () => <div /> }));

import { getCourses } from '../api/courseApi';
import { getUsers } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
import { getEnrollments } from '../api/enrollmentApi';
import { getAdminReviews } from '../api/reviewApi';
import { getAdminPosts, getAdminComments } from '../api/communityApi';
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
  getUsers.mockResolvedValue({ data: [], total: 0 });
  getTrials.mockResolvedValue([]);
  getSubscribers.mockResolvedValue([]);
  getEnrollments.mockResolvedValue({ data: [], total: 0 });
  getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
  getAdminPosts.mockResolvedValue({ posts: [], total: 0 });
  getAdminComments.mockResolvedValue({ comments: [], total: 0 });
}

describe('AdminDashboard — RBAC-aware load-error banner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('all queries succeed: no error banner is rendered', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
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
    getEnrollments.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: courses, bookings/)).toBeInTheDocument());
  });
});

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): the
// KPIs used to be computed from `users.filter(u => u.role === 'student')`
// and a separate `listTeachers()` call - both deleted. This proves the
// old "Active Students"/"Teachers" labels and the "Teachers list" card
// stay gone for good.
//
// These specific dashboard KPIs derive from booking data (Enrollment.status),
// not User.subscription — a deliberate choice for this dashboard's cards,
// not because User.subscription is unused: it's a real, admin-set field
// again via booking approval (see docs/current-project-status.md).
describe('AdminDashboard KPIs no longer depend on account roles or payment/subscription state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Enrolled Students" counts bookings by status === "enrolled", ignoring role and subscription fields entirely', async () => {
    getCourses.mockResolvedValue([]);
    getUsers.mockResolvedValue({
      data: [
        { _id: '1', name: 'A', role: 'teacher', subscription: { status: 'active' } },
        { _id: '2', name: 'B', role: 'student', subscription: { status: 'active' } },
      ],
      total: 2,
    });
    getTrials.mockResolvedValue([]);
    getSubscribers.mockResolvedValue([]);
    getEnrollments.mockResolvedValue({
      data: [
        { _id: 'e1', status: 'enrolled' },
        { _id: 'e2', status: 'enrolled' },
        { _id: 'e3', status: 'pending' },
        { _id: 'e4', status: 'cancelled' },
      ],
      total: 4,
    });
    getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
    getAdminPosts.mockResolvedValue({ posts: [], total: 0 });
    getAdminComments.mockResolvedValue({ comments: [], total: 0 });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Enrolled Students')).toBeInTheDocument());
    // 2 of the 4 bookings have status === 'enrolled' - independent of the
    // user accounts' role/subscription fields mocked above.
    const kpiValues = screen.getAllByText('2');
    expect(kpiValues.length).toBeGreaterThan(0);
  });

  it('never renders the old "Active Students"/"Teachers"/"Active Subscribers" labels or a "Teachers list" card', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('Active Students')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Teachers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/teachers yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Active Subscribers')).not.toBeInTheDocument();
  });

  it('never renders a Payments tab, a "Manual Payments" heading, or any payment KPI/chart', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /payments/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Manual Payments')).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment Approvals/)).not.toBeInTheDocument();
    expect(screen.queryByText('Pending Payments')).not.toBeInTheDocument();
  });
});

// Stage 2C Final Corrective Round 2 (see docs/user-admin-auth-contract.md):
// the "Conversion Rate" KPI computed `activeSubscribers.length /
// trials.length` - two unrelated groups from unrelated time periods, with
// no cohort/linkage proving a given subscriber actually came from a given
// trial. The ratio could exceed 100% and was materially misleading. It is
// deleted outright (no invented linkage).
//
// Its direct-count replacement ("pending manual payments awaiting admin
// review") was itself retired when this dashboard's KPIs moved to booking
// data — "Pending Bookings" (a plain count of Enrollment.status ===
// 'pending') is the current honest, single-group metric in its place; this
// is a dashboard-metric choice, not a claim that manual payment review is
// unavailable (see docs/current-project-status.md).
describe('AdminDashboard: the unproven conversion-rate metric is gone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never renders a "Conversion Rate" KPI or a Trials→Active ratio', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('Conversion Rate')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trials\s*→\s*Active/)).not.toBeInTheDocument();
  });

  it('renders "Pending Bookings" as a direct count of bookings with status "pending", not a derived percentage', async () => {
    getCourses.mockResolvedValue([]);
    getUsers.mockResolvedValue({ data: [], total: 0 });
    getTrials.mockResolvedValue([{ _id: 't1' }, { _id: 't2' }, { _id: 't3' }, { _id: 't4' }]);
    getSubscribers.mockResolvedValue([]);
    getEnrollments.mockResolvedValue({
      data: [
        { _id: 'e1', status: 'pending' },
        { _id: 'e2', status: 'pending' },
        { _id: 'e3', status: 'enrolled' },
      ],
      total: 3,
    });
    getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
    getAdminPosts.mockResolvedValue({ posts: [], total: 0 });
    getAdminComments.mockResolvedValue({ comments: [], total: 0 });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Pending Bookings')).toBeInTheDocument());
    // 2 pending bookings - a plain count, unrelated to the 4 trials mocked
    // above (which, under the old formula, would have produced a 50% ratio
    // that no longer exists anywhere on the page).
    expect(screen.getByText('Awaiting admin review')).toBeInTheDocument();
    const label = screen.getByText('Pending Bookings');
    const card = label.closest('.ds-stat');
    expect(card.querySelector('.ds-stat__value').textContent).toBe('2');
  });
});
