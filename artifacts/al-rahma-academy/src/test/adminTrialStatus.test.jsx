import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The Trials tab lets an admin record how far a free-trial lead has got:
// new, contacted or scheduled. The change goes to PATCH
// /v1/admin/trials/:id/status (MFA + IP allowlist + enrollments:write, see
// backend tests), updates the list in place, and refetches the Overview's
// server-side counts. Nobody is messaged.

vi.mock('../api/contentApi', () => ({ getTrials: vi.fn(), getSubscribers: vi.fn(), updateTrialStatus: vi.fn() }));
vi.mock('../api/courseApi', () => ({ getCourses: vi.fn() }));
vi.mock('../api/paymentApi', () => ({ getManualPayments: vi.fn() }));
// getOverviewStats is mocked too so this file keeps working once the
// server-side Overview (#260) is merged, which reads it.
vi.mock('../api/adminApi', () => ({ getUsers: vi.fn(), getOverviewStats: vi.fn(() => Promise.resolve({ sections: {} })) }));
vi.mock('../api/enrollmentApi', () => ({ getEnrollments: vi.fn(), updateEnrollment: vi.fn() }));
vi.mock('../api/reviewApi', () => ({ getAdminReviews: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../components/features/admin/AdminCoursesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminPaymentsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminBookingsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminNewsletterTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminUsersTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminClassesTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminReviewsTab', () => ({ default: () => <div /> }));
vi.mock('../components/features/admin/AdminProgressModal', () => ({ default: () => <div /> }));

import { getTrials, getSubscribers, updateTrialStatus } from '../api/contentApi';
import { getCourses } from '../api/courseApi';
import { getManualPayments } from '../api/paymentApi';
import { getUsers } from '../api/adminApi';
import { getEnrollments } from '../api/enrollmentApi';
import { getAdminReviews } from '../api/reviewApi';
import AdminTrialsTab from '../components/features/admin/AdminTrialsTab';
import AdminDashboard from '../pages/AdminDashboard';

const trial = (over) => ({ email: 'lead@example.com', status: 'new', createdAt: '2026-10-19T10:00:00.000Z', ...over });
const TRIALS = [trial({ _id: 't1', name: 'Amina' }), trial({ _id: 't2', name: 'Yusuf', status: 'contacted' })];
const statusSelect = (name) => screen.getByRole('combobox', { name: `Status of ${name}'s request` });

describe('AdminTrialsTab status control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each request\'s status with the three stages to choose from', () => {
    render(<AdminTrialsTab trials={TRIALS} onTrialsChange={vi.fn()} onError={vi.fn()} />);
    expect(statusSelect('Amina')).toHaveValue('new');
    expect(statusSelect('Yusuf')).toHaveValue('contacted');
    expect(within(statusSelect('Amina')).getAllByRole('option').map((o) => o.textContent)).toEqual(['New', 'Contacted', 'Scheduled']);
  });

  it('saves a change and updates only that request in the list', async () => {
    updateTrialStatus.mockResolvedValue(trial({ _id: 't1', name: 'Amina', status: 'scheduled' }));
    const onTrialsChange = vi.fn();
    render(<AdminTrialsTab trials={TRIALS} onTrialsChange={onTrialsChange} onError={vi.fn()} />);

    fireEvent.change(statusSelect('Amina'), { target: { value: 'scheduled' } });
    expect(statusSelect('Amina')).toBeDisabled();
    await waitFor(() => expect(onTrialsChange).toHaveBeenCalledTimes(1));
    expect(updateTrialStatus).toHaveBeenCalledWith('t1', 'scheduled');
    const next = onTrialsChange.mock.calls[0][0](TRIALS);
    expect(next.map((t) => [t._id, t.status])).toEqual([['t1', 'scheduled'], ['t2', 'contacted']]);
    await waitFor(() => expect(statusSelect('Amina')).toBeEnabled());
  });

  it('a 403 says the admin lacks permission and changes nothing', async () => {
    updateTrialStatus.mockRejectedValue({ response: { status: 403, data: { message: 'Insufficient permissions' } } });
    const onTrialsChange = vi.fn();
    const onError = vi.fn();
    render(<AdminTrialsTab trials={TRIALS} onTrialsChange={onTrialsChange} onError={onError} />);

    fireEvent.change(statusSelect('Amina'), { target: { value: 'contacted' } });
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('do not have permission')));
    expect(onTrialsChange).not.toHaveBeenCalled();
    expect(statusSelect('Amina')).toHaveValue('new');
  });

  it('any other failure shows the server\'s message and changes nothing', async () => {
    updateTrialStatus.mockRejectedValue({ response: { status: 422, data: { message: 'status must be one of: new, contacted, scheduled' } } });
    const onTrialsChange = vi.fn();
    const onError = vi.fn();
    render(<AdminTrialsTab trials={TRIALS} onTrialsChange={onTrialsChange} onError={onError} />);

    fireEvent.change(statusSelect('Yusuf'), { target: { value: 'new' } });
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith('status must be one of: new, contacted, scheduled'));
    expect(onTrialsChange).not.toHaveBeenCalled();
  });

  it('after a change the row still shows the phone and message (#261), even if the reply carries only the status', async () => {
    const rows = [
      trial({ _id: 't1', name: 'Amina', phone: '+44 7700 900123', message: 'Weekday evenings work best.' }),
      trial({ _id: 't2', name: 'Yusuf' }),
    ];
    updateTrialStatus.mockResolvedValue({ _id: 't1', status: 'contacted' });
    function Harness() {
      const [list, setList] = useState(rows);
      return <AdminTrialsTab trials={list} onTrialsChange={(update) => setList((prev) => update(prev))} onError={vi.fn()} />;
    }
    render(<Harness />);

    fireEvent.change(statusSelect('Amina'), { target: { value: 'contacted' } });
    await waitFor(() => expect(statusSelect('Amina')).toHaveValue('contacted'));
    const row = statusSelect('Amina').closest('tr');
    expect(within(row).getByTestId('trial-phone')).toHaveTextContent('+44 7700 900123');
    expect(within(row).getByTestId('trial-message')).toHaveTextContent('Weekday evenings work best.');
    const other = statusSelect('Yusuf').closest('tr');
    expect(statusSelect('Yusuf')).toHaveValue('new');
    expect(within(other).getByTestId('trial-phone')).toHaveTextContent('Not recorded');
    expect(within(other).getByTestId('trial-message')).toHaveTextContent('No message');
  });

  it('without a way to save (read-only use) it shows the status as text', () => {
    render(<AdminTrialsTab trials={TRIALS} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
  });
});

describe('AdminDashboard: a status change updates the Trials tab and refreshes the Overview counts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the list in place and refetches the overview figures', async () => {
    getCourses.mockResolvedValue([]);
    getManualPayments.mockResolvedValue({ data: [], total: 0 });
    getUsers.mockResolvedValue({ data: [], total: 0 });
    getTrials.mockResolvedValue(TRIALS);
    getSubscribers.mockResolvedValue([]);
    getEnrollments.mockResolvedValue({ data: [], total: 0 });
    getAdminReviews.mockResolvedValue({ reviews: [], total: 0 });
    updateTrialStatus.mockResolvedValue(trial({ _id: 't1', name: 'Amina', status: 'contacted' }));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    render(<QueryClientProvider client={qc}><AdminDashboard /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole('tab', { name: /Trials/ }));
    fireEvent.change(await screen.findByRole('combobox', { name: "Status of Amina's request" }), { target: { value: 'contacted' } });
    await waitFor(() => expect(statusSelect('Amina')).toHaveValue('contacted'));
    expect(qc.getQueryData(['admin', 'trials']).map((t) => t.status)).toEqual(['contacted', 'contacted']);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'overview'] });
    expect(getTrials).toHaveBeenCalledTimes(1);
  });
});
