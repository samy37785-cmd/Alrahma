import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

// The Overview tab renders only what GET /v1/admin/stats/overview counted on
// the server. These tests pin what each card says, that a figure it could
// not load or may not see is "—" with the reason (never 0), and that
// amounts in different currencies are never added together.

vi.mock('../components/ui/DsChart', () => ({
  DsBarChart: ({ data }) => <div data-testid="chart" data-points={JSON.stringify(data)} />,
  DsAreaChart: ({ data }) => <div data-testid="chart" data-points={JSON.stringify(data)} />,
  DsChartEmpty: ({ message }) => <div data-testid="chart-empty">{message}</div>,
}));

import AdminOverviewPanel from '../components/features/admin/AdminOverviewPanel';

const months = (counts, endYear = 2026, endMonth = 10) => counts.map((count, i) => {
  const d = new Date(Date.UTC(endYear, endMonth - 1 - (counts.length - 1 - i), 1));
  return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, count };
});

function fullStats() {
  return {
    generatedAt: '2026-10-19T12:00:00.000Z',
    timeZone: 'Africa/Cairo',
    sections: {
      users: { status: 'ok', total: 60, newByMonth: months([0, 0, 0, 5, 10, 20, 25]) },
      subscriptions: { status: 'ok', active: 20, markedActiveButExpired: 10 },
      bookings: {
        status: 'ok', total: 55,
        byStatus: { pending: 20, contacted: 5, awaiting_payment: 6, paid: 8, enrolled: 4, cancelled: 12, other: 0 },
        newByMonth: months([0, 0, 0, 0, 5, 50]),
      },
      bookingPayments: {
        status: 'ok',
        paidByCurrency: [
          { currency: 'EGP', count: 2, amount: 3000 },
          { currency: 'EUR', count: 6, amount: 800.5 },
          { currency: 'USD', count: 2, amount: 160 },
        ],
        paidMissingDetails: 2,
        awaitingPayment: { count: 6, agreedByCurrency: [{ currency: 'EUR', count: 4, amount: 200 }] },
        paidByMonth: months([0, 0, 0, 0, 3, 7]),
      },
      trials: { status: 'ok', total: 52, byStatus: { new: 30, contacted: 12, scheduled: 10, other: 0 } },
      newsletter: { status: 'ok', total: 51 },
      legacyManualPayments: { status: 'ok', total: 3, byStatus: { pending: 1, approved: 1, rejected: 1, other: 0 } },
      courses: {
        status: 'ok', total: 3, published: 2,
        items: [
          { _id: 'c1', title: 'Tajweed', icon: '📗', level: 'Beginner', published: true, modules: 2, lessons: 3, resources: 1 },
          { _id: 'c2', title: 'Draft', level: 'All levels', published: false, modules: 0, lessons: 0, resources: 0 },
          { _id: 'c3', title: 'Quran reading', level: 'All levels', published: true, modules: 1, lessons: 1, resources: 0 },
        ],
      },
      activity: {
        status: 'ok', omitted: [],
        events: [
          { type: 'booking', _id: 'b1', name: 'Amina', email: 'amina@example.com', status: 'awaiting_payment', plan: 'Standard', bookingRef: 'AR-7', createdAt: '2026-10-19T11:00:00.000Z' },
          { type: 'trial', _id: 't1', name: 'Yusuf', email: 'yusuf@example.com', course: 'Tajweed', status: 'new', createdAt: '2026-10-19T10:00:00.000Z' },
          { type: 'account', _id: 'u1', name: 'Mariam', email: 'mariam@example.com', createdAt: '2026-10-19T09:00:00.000Z' },
          { type: 'newsletter', _id: 'n1', email: 'reader@example.com', createdAt: '2026-10-19T08:00:00.000Z' },
        ],
      },
    },
  };
}

const card = (id) => screen.getByTestId(`stat-${id}`);
const value = (id) => card(id).querySelector('.ds-stat__value').textContent;
const sub = (id) => card(id).querySelector('.ds-stat__sub').textContent;
const CARDS = ['accounts', 'paid-access', 'bookings', 'booking-payments', 'trials', 'newsletter', 'legacy-payments'];

function renderPanel(props = {}) {
  const onNavigate = vi.fn();
  render(<AdminOverviewPanel stats={fullStats()} onNavigate={onNavigate} {...props} />);
  return { onNavigate };
}

describe('AdminOverviewPanel: figures from the server count', () => {
  it('shows each total over every record, with what it counts', () => {
    renderPanel();
    expect(value('accounts')).toBe('60');
    expect(sub('accounts')).toMatch(/including any test accounts/);
    expect(value('paid-access')).toBe('20');
    expect(sub('paid-access')).toBe('Subscription active and not past its end date · 10 more marked active but expired');
    expect(value('bookings')).toBe('55');
    expect(sub('bookings')).toBe('20 new · 6 awaiting payment · 4 enrolled');
    expect(value('trials')).toBe('52');
    expect(sub('trials')).toBe('30 new · 12 contacted · 10 scheduled');
    expect(value('newsletter')).toBe('51');
    expect(value('legacy-payments')).toBe('3');
    expect(sub('legacy-payments')).toMatch(/1 pending review · old payment form, now closed; not booking income/);
    expect(screen.getByText(/Months follow the Africa\/Cairo time zone/)).toBeInTheDocument();
  });

  it('lists booking payments per currency and never adds currencies together', () => {
    renderPanel();
    const amounts = within(card('booking-payments')).getByText('€800.50').parentElement;
    // Intl puts a no-break space after a currency code.
    expect(within(amounts).getAllByText(/./).map((n) => n.textContent.replace(/\s/g, ' '))).toEqual(['EGP 3,000.00', '€800.50', 'US$160.00']);
    expect(card('booking-payments').textContent).not.toMatch(/3,960|3960|1,000\.5|4,?000/);
    expect(sub('booking-payments')).toBe(
      '10 bookings marked paid or enrolled with amount, currency and payment date · 2 marked paid without those details, not counted',
    );
  });

  it('says "None yet" when no booking payment is recorded, instead of an amount', () => {
    const stats = fullStats();
    stats.sections.bookingPayments = { ...stats.sections.bookingPayments, paidByCurrency: [], paidMissingDetails: 0 };
    render(<AdminOverviewPanel stats={stats} onNavigate={() => {}} />);
    expect(value('booking-payments')).toBe('None yet');
    expect(sub('booking-payments')).toBe('0 bookings marked paid or enrolled with amount, currency and payment date');
  });

  it('a section the admin may not see shows "—" and why, never 0', () => {
    const stats = fullStats();
    for (const key of ['users', 'subscriptions', 'newsletter', 'bookingPayments', 'legacyManualPayments']) {
      stats.sections[key] = { status: 'forbidden' };
    }
    stats.sections.activity = { ...stats.sections.activity, omitted: ['account', 'newsletter'] };
    render(<AdminOverviewPanel stats={stats} onNavigate={() => {}} />);
    for (const id of ['accounts', 'paid-access', 'newsletter', 'booking-payments', 'legacy-payments']) {
      expect(value(id)).toBe('—');
      expect(sub(id)).toBe('No permission to view');
    }
    expect(value('bookings')).toBe('55');
    expect(screen.getByText(/Not included: accounts, newsletter sign-ups/)).toBeInTheDocument();
  });

  it('a section that failed on the server shows "Could not load", and its chart too', () => {
    const stats = fullStats();
    stats.sections.bookings = { status: 'error' };
    render(<AdminOverviewPanel stats={stats} onNavigate={() => {}} />);
    expect(value('bookings')).toBe('—');
    expect(sub('bookings')).toBe('Could not load');
    expect(screen.getAllByTestId('chart-empty').map((n) => n.textContent)).toContain('Could not load');
    expect(screen.getByText('Review Bookings')).toBeInTheDocument();
  });

  it('when the whole request fails, it says so and no card shows a number', () => {
    renderPanel({ stats: undefined, error: { response: { status: 404 } } });
    expect(screen.getByRole('alert')).toHaveTextContent('The overview figures could not be loaded (HTTP 404)');
    for (const id of CARDS) expect(value(id)).toBe('—');
    expect(screen.queryByText(/Counted on the server/)).not.toBeInTheDocument();
  });

  it('a failed refresh does not keep showing the previous figures', () => {
    renderPanel({ error: new Error('Network Error') });
    for (const id of CARDS) expect(value(id)).toBe('—');
  });

  it('while loading, every card waits instead of showing 0', () => {
    renderPanel({ stats: undefined, isLoading: true });
    for (const id of CARDS) {
      expect(value(id)).toBe('—');
      expect(sub(id)).toBe('Loading…');
    }
  });

  it('a real empty academy shows real zeros', () => {
    const stats = fullStats();
    stats.sections.users = { status: 'ok', total: 0, newByMonth: months([0, 0, 0, 0, 0, 0, 0]) };
    stats.sections.trials = { status: 'ok', total: 0, byStatus: { new: 0, contacted: 0, scheduled: 0, other: 0 } };
    render(<AdminOverviewPanel stats={stats} onNavigate={() => {}} />);
    expect(value('accounts')).toBe('0');
    expect(value('trials')).toBe('0');
    expect(screen.getByText('No new accounts in this period')).toBeInTheDocument();
  });

  it('charts show the server months: bookings by request date, payments by payment date, accounts by sign-up', () => {
    renderPanel();
    const points = screen.getAllByTestId('chart').map((n) => JSON.parse(n.dataset.points));
    expect(points[0]).toEqual([
      { label: 'May', Bookings: 0 }, { label: 'Jun', Bookings: 0 }, { label: 'Jul', Bookings: 0 },
      { label: 'Aug', Bookings: 0 }, { label: 'Sep', Bookings: 5 }, { label: 'Oct', Bookings: 50 },
    ]);
    expect(points[1].map((p) => p.Payments)).toEqual([0, 0, 0, 0, 3, 7]);
    expect(points[2].map((p) => p.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(points[2].at(-1).Accounts).toBe(25);
  });

  it('the course card counts real modules and lessons and marks hidden courses', () => {
    renderPanel();
    const rows = screen.getAllByTestId('overview-course');
    expect(rows[0]).toHaveTextContent('Tajweed');
    expect(rows[0]).toHaveTextContent('2 modules · 3 lessons');
    expect(rows[1]).toHaveTextContent('Hidden');
    expect(rows[2]).toHaveTextContent('1 module · 1 lesson');
    expect(screen.getByText(/Course Catalogue \(3\)/)).toBeInTheDocument();
  });

  it('recent activity shows bookings, trials, accounts and newsletter sign-ups with their real fields', () => {
    renderPanel();
    expect(screen.getByTestId('activity-booking')).toHaveTextContent('Booking request — Standard');
    expect(screen.getByTestId('activity-booking')).toHaveTextContent('Amina · awaiting payment · AR-7');
    expect(screen.getByTestId('activity-trial')).toHaveTextContent('Trial request — Tajweed');
    expect(screen.getByTestId('activity-trial')).toHaveTextContent('Yusuf');
    expect(screen.getByTestId('activity-account')).toHaveTextContent('Mariam created an account');
    expect(screen.getByTestId('activity-newsletter')).toHaveTextContent('reader@example.com');
  });

  it('quick actions carry the server counts and open the right tab', () => {
    const { onNavigate } = renderPanel();
    fireEvent.click(screen.getByText('Review Bookings (20 new)'));
    expect(onNavigate).toHaveBeenCalledWith('bookings');
    fireEvent.click(screen.getByText('Trial Requests (30 new)'));
    expect(onNavigate).toHaveBeenCalledWith('trials');
    expect(screen.queryByText(/Review Payments/)).not.toBeInTheDocument();
  });
});
