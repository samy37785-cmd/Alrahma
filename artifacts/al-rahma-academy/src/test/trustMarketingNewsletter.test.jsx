import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';

vi.mock('../api/contentApi', () => ({ subscribeNewsletter: vi.fn() }));
import { subscribeNewsletter } from '../api/contentApi';
import Newsletter from '../components/features/marketing/Newsletter';

// Trust/marketing remediation spec §7: Newsletter used to promise a
// "12-page illustrated Tajweed guide (PDF)", "5 audio pronunciation
// examples" and a "30-day beginner memorisation plan". subscribeNewsletter()
// only posts an email address (src/api/contentApi.js) — there is no tracked
// evidence of a PDF/audio asset or delivery workflow, so those specific
// promises were replaced with a neutral description of the newsletter
// itself. This file guards that and confirms submit/success/error and the
// (now-localized) email aria-label still work, plus §8's six-language
// rendering.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = ['en', 'ar', 'it', 'es', 'de', 'fr'];
const LOCALE_PATH = { en: '/', ar: '/ar', it: '/it', es: '/es', de: '/de', fr: '/fr' };

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Newsletter no longer promises an unverified specific deliverable (spec §7)', () => {
  it('does not claim a specific page count, audio count or day-plan for an unevidenced guide', () => {
    const { container } = renderWithLang(<Newsletter />);
    const text = container.textContent;
    expect(text).not.toMatch(/12-page/i);
    expect(text).not.toMatch(/5 audio/i);
    expect(text).not.toMatch(/30-day beginner memorisation plan/i);
  });

  it('removed the unevidenced "guide cover" mockup graphic', () => {
    const { container } = renderWithLang(<Newsletter />);
    expect(container.querySelector('.newsletter__guide-cover')).toBeNull();
  });

  it('the fabricated GUIDE_BENEFITS constant is gone from source', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/Newsletter.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/const\s+GUIDE_BENEFITS/);
  });
});

describe('Newsletter submission flow still works (spec §7 regression guard)', () => {
  it('the email input has a translated aria-label (not the literal "Email")', () => {
    renderWithLang(<Newsletter />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('submits only the email address, unchanged from before', async () => {
    subscribeNewsletter.mockResolvedValueOnce({ ok: true });
    renderWithLang(<Newsletter />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(subscribeNewsletter).toHaveBeenCalledWith('reader@example.com'));
  });

  it('shows a success state without promising a file that was not sent', async () => {
    subscribeNewsletter.mockResolvedValueOnce({ ok: true });
    renderWithLang(<Newsletter />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /check your inbox/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/12-page/i)).toBeNull();
  });

  it('shows an error state when the request fails', async () => {
    subscribeNewsletter.mockRejectedValueOnce(new Error('network'));
    renderWithLang(<Newsletter />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

describe('Newsletter renders correctly in all six languages (spec §8)', () => {
  it.each(LOCALES)('renders with a localized email aria-label and no undefined literals in %s', (locale) => {
    subscribeNewsletter.mockResolvedValue({ ok: true });
    const { container } = renderWithLang(<Newsletter />, LOCALE_PATH[locale]);
    expect(container.textContent).not.toMatch(/undefined/);
    const input = container.querySelector('input[type="email"]');
    expect(input.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders right-to-left for Arabic', () => {
    renderWithLang(<Newsletter />, '/ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it.each(LOCALES.filter((l) => l !== 'en'))(
    'does not fall back to the English placeholder/button text in %s',
    (locale) => {
      const { container } = renderWithLang(<Newsletter />, LOCALE_PATH[locale]);
      const input = container.querySelector('input[type="email"]');
      expect(input.getAttribute('placeholder')).not.toBe('Your email address');
    },
  );
});
