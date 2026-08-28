import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import QuickTrialModal from '../components/ui/QuickTrialModal';

// Stage 1 (see docs/localization-audit.md Priority 1): the site moved from a
// `?lang=` query-string model to a path-prefix model (/ar/..., /fr/... +
// <BrowserRouter basename>). These tests replace the old ?lang= coverage —
// see plan history / commit history for the prior query-string version.

function LanguageHarness() {
  const { lang, setLang } = useLang();
  const location = useLocation();
  return (
    <>
      <output aria-label="language">{lang}</output>
      <output aria-label="location">{`${location.pathname}${location.search}${location.hash}`}</output>
      <button type="button" onClick={() => setLang('en')}>English</button>
      <Link to="/tools#reader">Tools</Link>
    </>
  );
}

// Mirrors main.jsx: the router's basename is computed once from the URL's
// language prefix, and routes/Links are written unprefixed — basename
// resolves them under whatever language the app booted into.
function renderHarness(children) {
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

describe('language routing and document direction', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/ar/courses#quran');
  });

  it('reads the language from the URL path prefix and applies Arabic document attributes', async () => {
    renderHarness(<LanguageHarness />);

    await waitFor(() => expect(screen.getByLabelText('language')).toHaveTextContent('ar'));
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('resolves an in-language internal link through the router basename, with no ?lang= needed', async () => {
    renderHarness(<LanguageHarness />);

    // Under basename="/ar", <Link to="/tools#reader"> must resolve to
    // "/ar/tools#reader" automatically — this is what replaces the old
    // withLanguage()-appends-?lang= mechanism (see LangContext.jsx's
    // withLanguage() comment).
    const toolsLink = screen.getByRole('link', { name: 'Tools' });
    expect(toolsLink).toHaveAttribute('href', '/ar/tools#reader');
  });

  it('navigates to a fresh, unprefixed URL when switching to English (a real reload, not an in-place state update)', async () => {
    // jsdom's window.location.assign is non-configurable in this environment
    // (vi.spyOn throws "Cannot redefine property"), so swap the whole object
    // for a spy-able one — snapshotting the current pathname/search/hash
    // (already set by the outer beforeEach) rather than reconstructing them.
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });
    try {
      renderHarness(<LanguageHarness />);

      fireEvent.click(screen.getByRole('button', { name: 'English' }));

      // setLang() now performs a real navigation (window.location.assign),
      // because <BrowserRouter>'s basename is only recomputed on a fresh
      // load — see localePath.js's switchLanguageHref() comment.
      expect(assignSpy).toHaveBeenCalledWith('/courses#quran');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it.each(['it', 'es', 'de', 'fr'])(
    'loads the %s language from its path prefix and keeps in-language links basename-relative',
    async (locale) => {
      window.history.replaceState({}, '', `/${locale}/courses#quran`);

      renderHarness(<LanguageHarness />);

      await waitFor(() => expect(screen.getByLabelText('language')).toHaveTextContent(locale));
      expect(document.documentElement).toHaveAttribute('lang', locale);
      expect(document.documentElement).toHaveAttribute('dir', 'ltr');

      const toolsLink = screen.getByRole('link', { name: 'Tools' });
      expect(toolsLink).toHaveAttribute('href', `/${locale}/tools#reader`);
    },
  );

  it('reads unprefixed URLs as English (no prefix = the default, unprefixed language)', async () => {
    window.history.replaceState({}, '', '/courses#quran');

    renderHarness(<LanguageHarness />);

    await waitFor(() => expect(screen.getByLabelText('language')).toHaveTextContent('en'));
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });

  it('renders representative conversion UI in Arabic', () => {
    renderHarness(<QuickTrialModal open onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'احجز تجربتك المجانية' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'احجز حصتي المجانية' })).toBeInTheDocument();
  });
});
