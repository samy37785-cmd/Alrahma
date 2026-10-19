import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { TrialProvider } from '../context/TrialContext';
import { getExperienceText } from '../i18n/experience';

// The visitor's phone/WhatsApp number from every trial form must reach the
// server as `phone`, the only field POST /api/trials stores. The quick-trial
// modal and the exit popup used to send it as `whatsapp`, which the server
// dropped, so those numbers were never saved or emailed. These tests run the
// real api/contentApi.js and stop at the HTTP client, so they see the exact
// request body each form sends.

vi.mock('../api/http', () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })), get: vi.fn() } }));
vi.mock('../analytics/ga', () => ({ trackTrialSubmitted: vi.fn() }));
import http from '../api/http';
import Trial from '../components/features/marketing/Trial';
import QuickTrialModal from '../components/ui/QuickTrialModal';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';
import AdminTrialsTab from '../components/features/admin/AdminTrialsTab';

const QT = getExperienceText('en').quickTrial;
const EX = getExperienceText('en').exitIntent;
const PHONE = '+20 100 000 0001';

function renderWithLang(children) {
  window.history.replaceState({}, '', '/');
  return render(
    <BrowserRouter>
      <LangProvider>
        <TrialProvider>{children}</TrialProvider>
      </LangProvider>
    </BrowserRouter>,
  );
}

const sentBody = () => {
  expect(http.post).toHaveBeenCalledTimes(1);
  const [url, body] = http.post.mock.calls[0];
  expect(url).toBe('/trials');
  return body;
};

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('every trial form sends the number as phone', () => {
  it('main trial form', async () => {
    renderWithLang(<Trial />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Amina' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'amina@example.com' } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: PHONE } });
    fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    const body = sentBody();
    expect(body.phone).toBe(PHONE);
    expect(body).not.toHaveProperty('whatsapp');
    expect(body.formSource).toBe('trial_section');
  });

  it('quick trial modal', async () => {
    renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(QT.name), { target: { value: 'Amina' } });
    fireEvent.change(screen.getByLabelText(QT.email), { target: { value: 'amina@example.com' } });
    fireEvent.change(screen.getByLabelText(new RegExp(QT.whatsapp)), { target: { value: PHONE } });
    fireEvent.click(screen.getByRole('button', { name: QT.submit }));
    expect(await screen.findByText(QT.successTitle)).toBeInTheDocument();
    const body = sentBody();
    expect(body.phone).toBe(PHONE);
    expect(body).not.toHaveProperty('whatsapp');
    expect(body.formSource).toBe('quick_trial');
  });

  it('exit popup', async () => {
    vi.useFakeTimers();
    renderWithLang(<ExitIntentPopup />);
    act(() => { vi.advanceTimersByTime(20000); });
    act(() => { document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 0 })); });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.change(screen.getByPlaceholderText(EX.name), { target: { value: 'Amina' } });
    fireEvent.change(screen.getByPlaceholderText(EX.email), { target: { value: 'amina@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(EX.whatsapp), { target: { value: PHONE } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: EX.submit })); });
    const body = sentBody();
    expect(body.phone).toBe(PHONE);
    expect(body).not.toHaveProperty('whatsapp');
    expect(body.formSource).toBe('exit_intent');
  });

  it('a quick form left without a number sends an empty phone, not a whatsapp field', async () => {
    renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(QT.name), { target: { value: 'Amina' } });
    fireEvent.change(screen.getByLabelText(QT.email), { target: { value: 'amina@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: QT.submit }));
    expect(await screen.findByText(QT.successTitle)).toBeInTheDocument();
    const body = sentBody();
    expect(body.phone).toBe('');
    expect(body).not.toHaveProperty('whatsapp');
  });
});

describe('Trials tab shows the phone and the message', () => {
  const base = { email: 'a@example.com', status: 'new', createdAt: '2026-10-19T10:00:00.000Z' };

  it('shows a stored phone (left-to-right) and message', () => {
    render(<AdminTrialsTab trials={[{ ...base, _id: '1', name: 'Amina', phone: PHONE, message: 'Evenings\nplease' }]} />);
    const phone = screen.getByTestId('trial-phone');
    expect(phone).toHaveTextContent(PHONE);
    expect(within(phone).getByText(PHONE)).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('trial-message').textContent).toBe('Evenings\nplease');
  });

  it('says when the phone or message was not recorded, instead of leaving the cell blank', () => {
    render(<AdminTrialsTab trials={[{ ...base, _id: '2', name: 'Yusuf', formSource: 'quick_trial' }]} />);
    expect(screen.getByTestId('trial-phone')).toHaveTextContent('Not recorded');
    expect(screen.getByTestId('trial-message')).toHaveTextContent('No message');
    expect(screen.getByText(/the number typed in the quick trial form and the exit popup was not saved/)).toBeInTheDocument();
  });

  it('keeps every other column', () => {
    render(<AdminTrialsTab trials={[]} />);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Name', 'Email', 'Phone / WhatsApp', 'Message', 'Course', 'Heard from', 'Campaign', 'Status', 'Date',
    ]);
    expect(screen.getByText('No requests yet.')).toHaveAttribute('colspan', '9');
  });
});
