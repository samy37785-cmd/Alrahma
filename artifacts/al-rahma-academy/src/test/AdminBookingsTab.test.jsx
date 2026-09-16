import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminBookingsTab from '../components/features/admin/AdminBookingsTab';
import { LangProvider } from '../context/LangContext';
import { pathFor } from '../utils/localePath';
import { LANGS } from '../i18n';

// Admin tracking tab for booking requests. Backed by the pre-existing,
// RBAC-protected generic CRUD at /api/v1/admin/enrollments (updateEnrollment
// in api/enrollmentApi.js). Status (pending/approved/enrolled/cancelled)
// and an adminNote — no price, payment, card, or checkout field exists
// anywhere in this component or the requests it sends. Scope correction
// (see docs/current-project-status.md): "Approve & Activate"
// (approveEnrollment) is the one admin action that links a booking to its
// registered account and activates their subscription/content access.

vi.mock('../api/enrollmentApi', () => ({
  updateEnrollment: vi.fn(),
  approveEnrollment: vi.fn(),
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

  it('there is no "Agreed Amount" (or any financial) column', () => {
    renderTab();
    expect(screen.queryByText('Agreed Amount')).not.toBeInTheDocument();
  });

  it('changing the status select calls updateEnrollment with the new status', async () => {
    const user = userEvent.setup();
    enrollmentApi.updateEnrollment.mockResolvedValue({ ...BOOKING, status: 'approved' });
    renderTab();

    await user.selectOptions(screen.getByDisplayValue('New'), 'approved');

    expect(enrollmentApi.updateEnrollment).toHaveBeenCalledWith('b1', { status: 'approved' });
  });

  it('exactly the four canonical, non-financial statuses are offered for a booking already at a canonical status', () => {
    renderTab();
    const select = screen.getByDisplayValue('New');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['pending', 'approved', 'enrolled', 'cancelled']);
  });

  it('migration-safe: a booking carrying a retired status ("awaiting_payment") still renders correctly, with that value as an extra option alongside the four canonical ones', () => {
    renderTab([{ ...BOOKING, status: 'awaiting_payment' }]);
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('awaiting_payment');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['awaiting_payment', 'pending', 'approved', 'enrolled', 'cancelled']);
  });

  it('opening the note editor and saving calls updateEnrollment with only adminNote — no financial field exists to send', async () => {
    const user = userEvent.setup();
    enrollmentApi.updateEnrollment.mockResolvedValue({ ...BOOKING, adminNote: 'Confirmed via WhatsApp' });
    renderTab();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText(/Agreed amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Currency/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/External payment method/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Admin note/i), 'Confirmed via WhatsApp');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(enrollmentApi.updateEnrollment).toHaveBeenCalledWith('b1', { adminNote: 'Confirmed via WhatsApp' });
  });

  it('shows "Approve & Activate" for a pending booking, and clicking it calls approveEnrollment and applies the returned enrollment', async () => {
    const user = userEvent.setup();
    enrollmentApi.approveEnrollment.mockResolvedValue({
      message: 'Booking approved and subscription activated',
      enrollment: { ...BOOKING, status: 'enrolled' },
      user: { _id: 'u1', subscription: { status: 'active', plan: 'Huffaz' } },
    });
    const onBookingsChange = vi.fn();
    renderTab([BOOKING], { onBookingsChange });

    await user.click(screen.getByRole('button', { name: 'Approve & Activate' }));

    expect(enrollmentApi.approveEnrollment).toHaveBeenCalledWith('b1');
    expect(onBookingsChange).toHaveBeenCalled();
  });

  it('does NOT show "Approve & Activate" for an already-enrolled or cancelled booking', () => {
    renderTab([{ ...BOOKING, status: 'enrolled' }]);
    expect(screen.queryByRole('button', { name: 'Approve & Activate' })).not.toBeInTheDocument();
  });

  it('a failed approval calls onError with the server message and does not change local state', async () => {
    const user = userEvent.setup();
    enrollmentApi.approveEnrollment.mockRejectedValue({ response: { data: { message: 'No registered account found' } } });
    const onError = vi.fn();
    renderTab([BOOKING], { onError });

    await user.click(screen.getByRole('button', { name: 'Approve & Activate' }));

    expect(onError).toHaveBeenCalledWith('No registered account found');
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
