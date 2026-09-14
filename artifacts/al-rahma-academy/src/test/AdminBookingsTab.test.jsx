import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminBookingsTab from '../components/features/admin/AdminBookingsTab';
import { LangProvider } from '../context/LangContext';
import { pathFor } from '../utils/localePath';
import { LANGS } from '../i18n';

// Booking-First Enrollment: admin tracking tab for booking requests. Backed
// by the pre-existing, RBAC-protected generic CRUD at
// /api/v1/admin/enrollments (updateEnrollment in api/enrollmentApi.js) — no
// new backend route was added for this feature. This is administrative
// bookkeeping only (agreed amount/currency/external method/dates/note),
// never a payment gateway; it must never collect card or account data.

vi.mock('../api/enrollmentApi', () => ({
  updateEnrollment: vi.fn(),
}));

import * as enrollmentApi from '../api/enrollmentApi';

const BOOKING = {
  _id: 'b1',
  bookingRef: 'AR-20260913-ABCD',
  name: 'Amina Student',
  email: 'amina@example.com',
  whatsapp: '+44 7700 900000',
  plan: 'Huffaz',
  status: 'pending',
  createdAt: '2026-09-13T10:00:00.000Z',
};

function renderTab(bookings = [BOOKING], overrides = {}) {
  const props = {
    bookings,
    bookingsTotal: bookings.length,
    onBookingsChange: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { ...render(<LangProvider><AdminBookingsTab {...props} /></LangProvider>), props };
}

function renderTabAt(lang, bookings = [BOOKING], overrides = {}) {
  window.history.pushState({}, '', pathFor('/admin', lang));
  const props = {
    bookings,
    bookingsTotal: bookings.length,
    onBookingsChange: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { ...render(<LangProvider><AdminBookingsTab {...props} /></LangProvider>), props };
}

describe('AdminBookingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the booking reference, name, whatsapp and plan', () => {
    renderTab();
    expect(screen.getByText('AR-20260913-ABCD')).toBeInTheDocument();
    expect(screen.getByText('Amina Student')).toBeInTheDocument();
    expect(screen.getByText('+44 7700 900000')).toBeInTheDocument();
    expect(screen.getByText('Huffaz')).toBeInTheDocument();
  });

  it('changing the status select calls updateEnrollment with the new status', async () => {
    const user = userEvent.setup();
    enrollmentApi.updateEnrollment.mockResolvedValue({ ...BOOKING, status: 'contacted' });
    renderTab();

    await user.selectOptions(screen.getByDisplayValue('New'), 'contacted');

    expect(enrollmentApi.updateEnrollment).toHaveBeenCalledWith('b1', { status: 'contacted' });
  });

  it('the six booking statuses are all offered', () => {
    renderTab();
    const select = screen.getByDisplayValue('New');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['pending', 'contacted', 'awaiting_payment', 'paid', 'enrolled', 'cancelled']);
  });

  it('opening the financial-details editor and saving calls updateEnrollment with the entered fields, never a card/account field', async () => {
    const user = userEvent.setup();
    enrollmentApi.updateEnrollment.mockResolvedValue({ ...BOOKING, agreedAmount: 49, currency: 'EUR' });
    renderTab();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText(/Agreed amount/i), '49');
    await user.type(screen.getByLabelText(/Currency/i), 'EUR');
    await user.type(screen.getByLabelText(/External payment method/i), 'Bank transfer');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(enrollmentApi.updateEnrollment).toHaveBeenCalledWith('b1', expect.objectContaining({
      agreedAmount: 49,
      currency: 'EUR',
      paymentMethodExternal: 'Bank transfer',
    }));
    const [, patch] = enrollmentApi.updateEnrollment.mock.calls[0];
    expect(patch).not.toHaveProperty('cardNumber');
    expect(patch).not.toHaveProperty('cvv');
  });

  it('the empty-state row is shown when there are no bookings', () => {
    renderTab([]);
    expect(screen.getByText('No booking requests yet.')).toBeInTheDocument();
  });

  it.each(LANGS)('renders without throwing (no missing i18n key) in "%s"', (lang) => {
    expect(() => renderTabAt(lang)).not.toThrow();
  });

  it('renders right-to-left with real Arabic copy in the "ar" locale', () => {
    renderTabAt('ar');
    const panel = document.querySelector('.admin__panel');
    expect(panel).toHaveAttribute('dir', 'rtl');
    // statusPending ("New") in Arabic — proves the status <select> options
    // are actually localized, not just the panel chrome around them.
    expect(screen.getByDisplayValue('جديد')).toBeInTheDocument();
  });

  it('the empty state is localized in Arabic, not a hardcoded English fallback', () => {
    renderTabAt('ar', []);
    expect(screen.getByText('لا توجد طلبات حجز حتى الآن.')).toBeInTheDocument();
  });
});
