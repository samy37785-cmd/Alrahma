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
// all eight tabs simultaneously (hidden divs, not conditional mounting), so
// rendering their real implementations here would make this test heavy and
// brittle for behaviour this file isn't about.

vi.mock('../api/courseApi', () => ({ getCourses: vi.fn() }));
vi.mock('../api/paymentApi', () => ({ getManualPayments: vi.fn() }));
vi.mock('../api/adminApi', () => ({ getUsers: vi.fn(), listTeachers: vi.fn() }));
vi.mock('../api/contentApi', () => ({ getTrials: vi.fn(), getSubscribers: vi.fn() }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../components/features/admin/AdminCoursesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminTrialsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminPaymentsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminNewsletterTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminUsersTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminStaffTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminClassesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminProgressModal', () => ({ default: () => <div /> }));

import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers, listTeachers } from '../api/adminApi';
import { getTrials, getSubscribers } from '../api/contentApi';
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
  listTeachers.mockResolvedValue([]);
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

  it('multiple failed queries are all named in the banner, in query-declaration order', async () => {
    mockAllSucceed();
    getCourses.mockRejectedValue(new Error('Forbidden'));
    getManualPayments.mockRejectedValue(new Error('Forbidden'));
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Failed to load: courses, payments/)).toBeInTheDocument());
  });

  it('a failed listTeachers call does not trigger the banner (it self-recovers via .catch(() => []), unlike the five isError-tracked queries)', async () => {
    mockAllSucceed();
    listTeachers.mockRejectedValue(new Error('Network Error'));
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });
});
