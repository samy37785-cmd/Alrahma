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
// all nine tabs simultaneously (hidden divs, not conditional mounting), so
// rendering their real implementations here would make this test heavy and
// brittle for behaviour this file isn't about. (Stage 2B: the Staff tab was
// removed along with AdminStaffTab.jsx - see
// docs/legacy-role-dashboard-pruning.md.)

vi.mock('../api/courseApi', () => ({ getCourses: vi.fn() }));
vi.mock('../api/paymentApi', () => ({ getManualPayments: vi.fn() }));
vi.mock('../api/adminApi', () => ({ getUsers: vi.fn() }));
vi.mock('../api/contentApi', () => ({ getTrials: vi.fn(), getSubscribers: vi.fn() }));
vi.mock('../api/reviewApi', () => ({ getAdminReviews: vi.fn() }));
vi.mock('../api/communityApi', () => ({ getAdminPosts: vi.fn(), getAdminComments: vi.fn() }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../components/features/admin/AdminCoursesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminTrialsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminPaymentsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminNewsletterTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminUsersTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminClassesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminReviewsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminProgressModal', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminCommunityTab', () => ({ default: () => <div /> }));

import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
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
  getManualPayments.mockResolvedValue({ data: [], total: 0 });
  getUsers.mockResolvedValue({ data: [], total: 0 });
  getTrials.mockResolvedValue([]);
  getSubscribers.mockResolvedValue([]);
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
    getManualPayments.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: courses, payments/)).toBeInTheDocument());
  });
});

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): the
// KPIs used to be computed from `users.filter(u => u.role === 'student')`
// and a separate `listTeachers()` call - both deleted. This proves the
// replacement KPIs are computed from real product fields (subscription
// status) regardless of whatever a legacy `role` value says, and that the
// old "Active Students"/"Teachers" labels and the "Teachers list" card are
// gone for good.
describe('AdminDashboard KPIs no longer depend on account roles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Active Subscribers" counts by subscription.status, ignoring whatever the legacy role field says', async () => {
    getCourses.mockResolvedValue([]);
    getManualPayments.mockResolvedValue({ data: [], total: 0 });
    getUsers.mockResolvedValue({
      data: [
        { _id: '1', name: 'A', role: 'teacher', subscription: { status: 'active' } },
        { _id: '2', name: 'B', role: 'student', subscription: { status: 'active' } },
        { _id: '3', name: 'C', role: 'admin', subscription: { status: 'inactive' } },
        { _id: '4', name: 'D', role: undefined, subscription: null },
      ],
      total: 4,
    });
    getTrials.mockResolvedValue([]);
    getSubscribers.mockResolvedValue([]);
    getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
    getAdminPosts.mockResolvedValue({ posts: [], total: 0 });
    getAdminComments.mockResolvedValue({ comments: [], total: 0 });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Active Subscribers')).toBeInTheDocument());
    // 2 of the 4 users have subscription.status === 'active' - independent
    // of the fact that one is 'teacher' and one is 'student'.
    const kpiValues = screen.getAllByText('2');
    expect(kpiValues.length).toBeGreaterThan(0);
  });

  it('never renders the old "Active Students"/"Teachers" labels or a "Teachers list" card', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('Active Students')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Teachers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/teachers yet/)).not.toBeInTheDocument();
  });
});

// Stage 2C Final Corrective Round 2 (see docs/user-admin-auth-contract.md):
// the "Conversion Rate" KPI computed `activeSubscribers.length /
// trials.length` - two unrelated groups from unrelated time periods, with
// no cohort/linkage proving a given subscriber actually came from a given
// trial. The ratio could exceed 100% and was materially misleading. It is
// deleted outright (no invented linkage) and replaced with a direct,
// unambiguous single-group count already proven honest elsewhere on this
// page: pending manual payments awaiting admin review.
describe('AdminDashboard: the unproven conversion-rate metric is gone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never renders a "Conversion Rate" KPI or a Trials→Active ratio', async () => {
    mockAllSucceed();
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('Conversion Rate')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trials\s*→\s*Active/)).not.toBeInTheDocument();
  });

  it('renders "Pending Payments" as a direct count of payments with status "pending", not a derived percentage', async () => {
    getCourses.mockResolvedValue([]);
    getManualPayments.mockResolvedValue({
      data: [
        { _id: 'p1', status: 'pending' },
        { _id: 'p2', status: 'pending' },
        { _id: 'p3', status: 'approved' },
      ],
      total: 3,
    });
    getUsers.mockResolvedValue({ data: [], total: 0 });
    getTrials.mockResolvedValue([{ _id: 't1' }, { _id: 't2' }, { _id: 't3' }, { _id: 't4' }]);
    getSubscribers.mockResolvedValue([]);
    getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
    getAdminPosts.mockResolvedValue({ posts: [], total: 0 });
    getAdminComments.mockResolvedValue({ comments: [], total: 0 });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Pending Payments')).toBeInTheDocument());
    // 2 pending payments - a plain count, unrelated to the 4 trials mocked
    // above (which, under the old formula, would have produced a 50% ratio
    // that no longer exists anywhere on the page).
    expect(screen.getByText('Awaiting admin review')).toBeInTheDocument();
    const label = screen.getByText('Pending Payments');
    const card = label.closest('.ds-stat');
    expect(card.querySelector('.ds-stat__value').textContent).toBe('2');
  });
});
