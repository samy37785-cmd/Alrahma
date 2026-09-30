import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import { HADITHS } from '../data/islamicStudiesData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SEO Publication Gate (2026-09-30): "Hadith of the Day" used to be chosen
// via `useMemo(() => {... Date.now() ...}, [])`, computed synchronously
// during render. scripts/prerender.mjs captures this page's static HTML
// with a REAL headless-Chromium (Playwright) session, not a JS-free server
// render, so that value would have been baked into the file at whichever
// day the build ran on -- and since a real visit almost never lands on the
// same calendar day as the last build, every real hydration would then
// mismatch against that frozen value. This suite proves the replacement
// (`useState(null)` + a `navigator.webdriver`-gated `useEffect`, the same
// signal ConsentBanner.jsx already uses for the identical reason) is
// actually safe: the initial render is always the placeholder regardless
// of the current date, Playwright's own capture (navigator.webdriver ===
// true) never advances past that placeholder, and a real visitor's browser
// (navigator.webdriver falsy) does resolve a real hadith after mount, with
// no hydration-mismatch-shaped console noise either way.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <CourseIslamicStudies />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
}

function hadithCardText(container) {
  return container.querySelector('.cl__hadith-card')?.textContent ?? '';
}

function isPlaceholder(container) {
  return container.querySelector('[data-testid="hadith-placeholder"]') !== null;
}

describe('CourseIslamicStudies: Hadith of the Day is hydration-safe, never build-day-frozen', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    document.title = '';
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // Reset to jsdom's real default (no automation flag) so later test
    // files in the same worker are unaffected.
    setWebdriver(undefined);
  });

  it('during the prerender capture (navigator.webdriver === true): renders the placeholder, never a real hadith, on every route/locale', () => {
    setWebdriver(true);
    for (const route of ['/courses/islamic-studies', '/ar/courses/islamic-studies', '/fr/courses/islamic-studies']) {
      const { container, unmount } = renderHarness(route);
      expect(isPlaceholder(container), `${route}: must show the placeholder while navigator.webdriver is true`).toBe(true);
      const cardText = hadithCardText(container);
      for (const h of HADITHS) {
        expect(cardText).not.toContain(h.en);
        expect(cardText).not.toContain(h.arabic);
      }
      unmount();
    }
  });

  it('during the prerender capture: the placeholder is identical regardless of the current date (no Date.now()-driven divergence)', () => {
    setWebdriver(true);
    const dateSpy = vi.spyOn(Date, 'now');

    dateSpy.mockReturnValue(new Date('2026-01-15').getTime());
    const first = renderHarness('/courses/islamic-studies');
    const firstHtml = first.container.querySelector('.cl__hadith-card').innerHTML;
    first.unmount();

    dateSpy.mockReturnValue(new Date('2026-11-02').getTime());
    const second = renderHarness('/courses/islamic-studies');
    const secondHtml = second.container.querySelector('.cl__hadith-card').innerHTML;
    second.unmount();

    expect(firstHtml).toBe(secondHtml);
    dateSpy.mockRestore();
  });

  it('for a real visitor (navigator.webdriver falsy): resolves to a real hadith from HADITHS after mount, not stuck on the placeholder', () => {
    setWebdriver(undefined);
    const { container } = renderHarness('/courses/islamic-studies');
    expect(isPlaceholder(container)).toBe(false);
    const cardText = hadithCardText(container);
    const matched = HADITHS.some((h) => cardText.includes(h.en) && cardText.includes(h.arabic));
    expect(matched, 'the rendered card must contain one full HADITHS entry (English text + Arabic text)').toBe(true);
  });

  it('a real visitor always gets the SAME day\'s hadith as build day would have picked, computed fresh from their own current date (not literally frozen to any prior build)', () => {
    setWebdriver(undefined);
    const fixedNow = new Date('2026-09-30T12:00:00Z').getTime();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const dayOfYear = Math.floor(
      (fixedNow - new Date(new Date(fixedNow).getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const expected = HADITHS[dayOfYear % HADITHS.length];

    const { container } = renderHarness('/courses/islamic-studies');
    const cardText = hadithCardText(container);
    expect(cardText).toContain(expected.en);
    expect(cardText).toContain(expected.arabic);
    dateSpy.mockRestore();
  });

  it('placeholder text is locale-appropriate on en/ar/fr and never a religious/hadith string', () => {
    setWebdriver(true);
    const cases = [
      { route: '/courses/islamic-studies', expectSubstring: 'Loading' },
      { route: '/ar/courses/islamic-studies', expectSubstring: 'جارٍ تحميل' },
      { route: '/fr/courses/islamic-studies', expectSubstring: 'Chargement' },
    ];
    for (const { route, expectSubstring } of cases) {
      const { container, unmount } = renderHarness(route);
      expect(hadithCardText(container)).toContain(expectSubstring);
      unmount();
    }
  });

  it('French hadith text, once resolved, is a literal copy of the English source (religious-content translation policy unchanged)', () => {
    setWebdriver(undefined);
    const { container } = renderHarness('/fr/courses/islamic-studies');
    const cardText = hadithCardText(container);
    const matched = HADITHS.find((h) => cardText.includes(h.en));
    expect(matched, 'must have resolved to one real HADITHS entry').toBeTruthy();
    // fr is documented (islamicStudiesData.js header) to be a literal copy
    // of en for every entry -- this assertion would fail if that policy
    // were ever silently broken.
    expect(matched.fr).toBe(matched.en);
    expect(cardText).toContain(matched.fr);
  });

  it('produces no console.error/console.warn noise in either mode (no hydration-mismatch-shaped warnings)', () => {
    setWebdriver(true);
    renderHarness('/courses/islamic-studies');
    setWebdriver(undefined);
    renderHarness('/fr/courses/islamic-studies');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});

describe('CourseIslamicStudies.jsx source: no render-time Date.now(), no useMemo for hadith selection', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../pages/CourseIslamicStudies.jsx'), 'utf8');

  it('does not import useMemo (the render-time hook the old, build-day-freezing selection used)', () => {
    expect(src).toMatch(/^import \{ useState, useEffect \} from 'react';$/m);
    expect(src).not.toMatch(/^import \{[^}]*\buseMemo\b[^}]*\} from 'react';$/m);
  });

  it('selects the hadith inside useEffect, not during render', () => {
    expect(src).toMatch(/const \[hadith, setHadith\] = useState\(null\);/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(navigator\.webdriver\) return;/);
  });

  it('still computes the day-of-year selection using HADITHS.length (selection logic itself is unchanged)', () => {
    expect(src).toMatch(/HADITHS\[dayOfYear % HADITHS\.length\]/);
  });
});
