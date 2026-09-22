import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import VerseOfTheDayPage from '../pages/tools/VerseOfTheDayPage';

// Same Header/Footer provider mocks as src/test/teacherProfileArabicSeo.test.jsx
// (PR #89) and src/test/teacherProfileArabicBio.test.jsx (Phase 1) — neither
// is touched by this fix.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Language Closure Phase 2 (policy approved by محمود): /ar/tools/verse-of-the-day
// showed a full English sentence ("Allāh does not charge a soul except...")
// underneath the real Arabic verse. Root cause, confirmed by reading
// VerseOfTheDayPage.jsx and api/quran.js in full: the Arabic verse text
// (verse.text_uthmani) was ALREADY correct and already rendered
// unconditionally — quran.com's /translations param (translationId=20) is,
// by definition, a *non-Arabic* rendering of the verse, so there is no
// separate "Arabic translation" field to switch to. The bug was that this
// English-only `trans` was rendered (and copied/shared) unconditionally,
// regardless of `lang`. Fix: `showTranslation = lang !== 'ar' && !!trans`
// gates the translation paragraph and the copy/share/WhatsApp text. The API
// call, fetch, date logic and day-selection (DAILY_VERSE_KEYS) are
// untouched — this mock only stubs the network boundary (getVerse), not any
// of that logic.
const FAKE_VERSE = {
  text_uthmani: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
  translations: [{ text: 'Allah does not charge a soul except [with that within] its capacity.' }],
};

vi.mock('../api/quran', () => ({
  getVerse: vi.fn(() => Promise.resolve(FAKE_VERSE)),
}));

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <VerseOfTheDayPage />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Verse of the Day: Arabic page never shows the English translation sentence', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('Arabic (/ar/tools/verse-of-the-day): shows the real Arabic verse, no English translation paragraph', async () => {
    const { container } = renderHarness('/ar/tools/verse-of-the-day');
    await waitFor(() => expect(container.querySelector('.votd-card__arabic')).toBeInTheDocument());

    expect(container.querySelector('.votd-card__arabic').textContent).toContain(FAKE_VERSE.text_uthmani);
    expect(container.querySelector('.votd-card__trans')).toBeNull();
    expect(screen.queryByText(/Allah does not charge a soul/)).toBeNull();
  });

  it('English (/tools/verse-of-the-day): still shows the translation paragraph — unchanged', async () => {
    const { container } = renderHarness('/tools/verse-of-the-day');
    await waitFor(() => expect(container.querySelector('.votd-card__arabic')).toBeInTheDocument());

    const transEl = container.querySelector('.votd-card__trans');
    expect(transEl).not.toBeNull();
    expect(transEl.textContent).toContain('Allah does not charge a soul except');
  });

  it('Arabic copy-to-clipboard text excludes the English translation line', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = renderHarness('/ar/tools/verse-of-the-day');
    await waitFor(() => expect(container.querySelector('.votd-card__arabic')).toBeInTheDocument());

    const copyBtn = container.querySelector('.votd-btn--copy');
    copyBtn.click();

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain(FAKE_VERSE.text_uthmani);
    expect(copiedText).not.toContain('Allah does not charge a soul');
  });

  it('English copy-to-clipboard text still includes the translation line — unchanged', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = renderHarness('/tools/verse-of-the-day');
    await waitFor(() => expect(container.querySelector('.votd-card__arabic')).toBeInTheDocument());

    const copyBtn = container.querySelector('.votd-btn--copy');
    copyBtn.click();

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain('Allah does not charge a soul except');
  });

  it('day-selection logic (DAILY_VERSE_KEYS / Date) is untouched: same verse key requested in both languages', async () => {
    const { getVerse } = await import('../api/quran');
    renderHarness('/tools/verse-of-the-day');
    renderHarness('/ar/tools/verse-of-the-day');
    await waitFor(() => expect(getVerse).toHaveBeenCalled());

    const keysRequested = getVerse.mock.calls.map((call) => call[0]);
    expect(new Set(keysRequested).size).toBe(1);
  });
});
