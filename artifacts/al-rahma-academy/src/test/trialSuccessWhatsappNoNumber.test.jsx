import { act, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { TrialProvider } from '../context/TrialContext';
import { getExperienceText } from '../i18n/experience';
import { getTrialWhatsappText } from '../i18n/trialWhatsapp';

// With no valid academy WhatsApp number configured, a successful trial
// request shows the email success only: no WhatsApp button, no broken link,
// and the exit-intent popup keeps closing itself after 4.5 s as before.
vi.mock('../data/site', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, site: { ...actual.site, whatsapp: '' } };
});
vi.mock('../api/contentApi', () => ({ submitTrial: vi.fn() }));
import { submitTrial } from '../api/contentApi';
import Trial from '../components/features/marketing/Trial';
import QuickTrialModal from '../components/ui/QuickTrialModal';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';

const BUTTON = getTrialWhatsappText('en').button;
const QT = getExperienceText('en').quickTrial;
const EX = getExperienceText('en').exitIntent;

function renderIt(children) {
  window.history.replaceState({}, '', '/');
  return render(
    <BrowserRouter>
      <LangProvider>
        <TrialProvider>{children}</TrialProvider>
      </LangProvider>
    </BrowserRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('no academy WhatsApp number configured', () => {
  it('Trial: email success only', async () => {
    submitTrial.mockResolvedValueOnce({});
    const { container } = renderIt(<Trial />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/thank you/i);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    expect(container.querySelector('.trial-wa')).toBeNull();
  });

  it('QuickTrialModal: email success only', async () => {
    submitTrial.mockResolvedValueOnce({});
    renderIt(<QuickTrialModal open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(QT.name), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(QT.email), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: QT.submit }));
    expect(await screen.findByText(QT.successTitle)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('ExitIntentPopup: email success only, and it still closes itself after 4.5 s', async () => {
    vi.useFakeTimers();
    submitTrial.mockResolvedValueOnce({});
    renderIt(<ExitIntentPopup />);
    act(() => { vi.advanceTimersByTime(20000); });
    act(() => { document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 0 })); });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.change(screen.getByPlaceholderText(EX.email), { target: { value: 'a@example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: EX.submit })); });
    expect(screen.getByText(EX.successTitle)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    act(() => { vi.advanceTimersByTime(4600); });
    expect(screen.queryByText(EX.successTitle)).toBeNull();
  });
});
