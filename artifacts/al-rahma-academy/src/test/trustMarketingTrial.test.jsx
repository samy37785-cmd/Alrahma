import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { TrialProvider } from '../context/TrialContext';
import { langFromPath } from '../utils/localePath';

vi.mock('../api/contentApi', () => ({ submitTrial: vi.fn() }));
import { submitTrial } from '../api/contentApi';
import Trial from '../components/features/marketing/Trial';

// Trust/marketing remediation spec §6: Trial's "Only N free trial spots
// left this week" (N from spotsToday(), seeded to the day of month) had no
// real capacity/booking record behind it. This file guards its removal and
// confirms the real trial-request flow (submit/success/error, payload
// shape) is unchanged, plus §8's i18n rendering across the six languages.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = ['en', 'ar', 'it', 'es', 'de', 'fr'];
const LOCALE_PATH = { en: '/', ar: '/ar', it: '/it', es: '/es', de: '/de', fr: '/fr' };

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <TrialProvider>{children}</TrialProvider>
      </LangProvider>
    </BrowserRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Trial no longer shows artificial scarcity (spec §6)', () => {
  it('does not render an "Only N spots left" urgency badge', () => {
    const { container } = renderWithLang(<Trial />);
    expect(container.querySelector('.trial__urgency')).toBeNull();
    expect(container.textContent).not.toMatch(/\bonly\b.*spots?.*left/i);
  });

  it('the spotsToday() helper is gone from source', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/Trial.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/function\s+spotsToday/);
  });

  it('keeps the 60-minute trial session and no longer claims an unconfirmed 24-hour tutor-assignment SLA (Content Truth Contract Round 3, Part 7)', () => {
    // TermsOfService.jsx documents a general "Response time: within 24 hours"
    // (support inquiries) and a separate "tutor changes... within 48 hours"
    // (mid-subscription tutor swap) — neither is a promise that a NEW
    // trial's tutor is confirmed/assigned within 24 hours, which is what
    // this component previously implied. It now uses neutral phrasing
    // instead of borrowing the unrelated support-response number.
    renderWithLang(<Trial />);
    expect(screen.getByText(/60-minute session/i)).toBeInTheDocument();
    expect(screen.getByText(/we'll contact you to confirm your tutor and schedule/i)).toBeInTheDocument();
    expect(screen.queryByText(/within 24 hours/i)).toBeNull();
  });

  it('does not make a bare, unqualified "Secure" claim', () => {
    const { container } = renderWithLang(<Trial />);
    const trustRow = container.querySelector('.trial__trust-row');
    expect(trustRow.textContent).not.toMatch(/^\s*🔒\s*Secure\s*$/);
  });
});

describe('Trial submission flow still works (spec §6 regression guard)', () => {
  function fillForm() {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: '+1234567890' } });
  }

  it('submits the same payload shape as before (name, email, phone, course, message)', async () => {
    submitTrial.mockResolvedValueOnce({ ok: true });
    renderWithLang(<Trial />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));

    await waitFor(() => expect(submitTrial).toHaveBeenCalledTimes(1));
    const payload = submitTrial.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      ['course', 'email', 'message', 'name', 'phone'].sort(),
    );
    expect(payload.name).toBe('Test User');
    expect(payload.email).toBe('test@example.com');
  });

  it('shows the success message after a successful submission', async () => {
    submitTrial.mockResolvedValueOnce({ ok: true });
    renderWithLang(<Trial />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));

    await waitFor(() =>
      expect(screen.getByText(/thank you/i)).toBeInTheDocument(),
    );
  });

  it('shows an offline/error path when submission fails', async () => {
    submitTrial.mockRejectedValueOnce({ response: null });
    renderWithLang(<Trial />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
  });
});

describe('Trial renders correctly in all six languages (spec §8)', () => {
  it.each(LOCALES)('renders the trial form with no undefined literals in %s', (locale) => {
    const { container } = renderWithLang(<Trial />, LOCALE_PATH[locale]);
    expect(container.textContent).not.toMatch(/undefined/);
    // Every locale must supply its own trust-row copy — this fails loudly
    // (visible "undefined") if a locale is missing the new keys.
    expect(container.querySelector('.trial__trust-row').textContent.length).toBeGreaterThan(0);
  });

  it('renders right-to-left for Arabic', () => {
    renderWithLang(<Trial />, '/ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it.each(LOCALES.filter((l) => l !== 'en'))(
    'does not fall back to the known English-only trust-row literals in %s',
    (locale) => {
      const { container } = renderWithLang(<Trial />, LOCALE_PATH[locale]);
      const text = container.querySelector('.trial__trust-row').textContent;
      expect(text).not.toContain('See our Privacy Policy');
      expect(text).not.toContain('60-minute session');
      expect(text).not.toContain('No commitment');
    },
  );
});
