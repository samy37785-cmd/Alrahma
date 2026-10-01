import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import VerseOfTheDayPage from '../pages/tools/VerseOfTheDayPage';
import PrayerTimesPage from '../pages/tools/PrayerTimesPage';
import Quran from '../pages/Quran';
import Enroll from '../pages/Enroll';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// French SEO Publication Wave (2026-09-30): /tools/verse-of-the-day,
// /tools/quran-reader and /tools/prayer-times each had a real fetch (or
// geolocation) effect that scripts/prerender.mjs's REAL headless-Chromium
// capture would actually run to completion, baking that one build's live
// result (a specific verse, Surah 1's text, a specific location's prayer
// times) into the static file. All three are now guarded by
// `navigator.webdriver`, the same signal ConsentBanner.jsx and
// CourseIslamicStudies.jsx's Hadith-of-the-Day already rely on. This suite
// proves that guard directly on the real components (not just by reading
// prerender.mjs's own capture behaviour), for both sides: nothing fetches
// when `navigator.webdriver` is the Playwright-launched-browser default
// (`true`), and everything fetches normally for a real visitor (`false`).
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// vi.hoisted(): vi.mock() below is itself hoisted above every static
// import (including VerseOfTheDayPage/Quran, which import from '../api/quran'
// at their own top level) by Vitest's transform, so a plain top-level
// `const NEVER = ...` here would not yet be initialized when the mock
// factory runs — same reason tajweedCheckerPrerenderSafety.test.jsx's own
// SpeechRecognition stub uses vi.hoisted() instead of a plain statement.
const { NEVER } = vi.hoisted(() => ({ NEVER: () => new Promise(() => {}) }));

vi.mock('../api/quran', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getVerse: vi.fn(NEVER),
    getChapters: vi.fn(NEVER),
    getVerses: vi.fn(NEVER),
    getVersesByPage: vi.fn(NEVER),
    getVersesByJuz: vi.fn(NEVER),
    getVersesByHizb: vi.fn(NEVER),
    getChapterAudio: vi.fn(NEVER),
    getVerseAudios: vi.fn(NEVER),
  };
});

import { getVerse, getChapters, getVerses, getChapterAudio } from '../api/quran';

function renderHarness(Component, path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <Component />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

// jsdom defines neither `navigator.webdriver` nor `navigator.geolocation`
// at all (verified against jsdom's own Navigator implementation — neither
// exists as a prototype getter), so both are plain, absent properties here
// — safe to add as configurable own properties on the real
// `window.navigator` for one test and remove again afterwards, unlike a
// real browser's Navigator.prototype.webdriver (non-configurable) or a
// vi.stubGlobal('navigator', {...}) replacement (a spread of `navigator`
// would silently drop every OTHER prototype-getter property, like
// clipboard/share/userAgent, that this page or its siblings might still
// read).
function defineNavProp(name, value) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
}
function clearNavProp(name) {
  delete window.navigator[name];
}

describe('French SEO Publication Wave: prerender-safety guards (navigator.webdriver)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    document.title = '';
    clearNavProp('webdriver');
    clearNavProp('geolocation');
  });

  describe('VerseOfTheDayPage (/fr/tools/verse-of-the-day): the daily-verse fetch', () => {
    it('never calls getVerse, and shows no verse/error, when navigator.webdriver is true (prerender capture)', () => {
      defineNavProp('webdriver', true);
      const { container } = renderHarness(VerseOfTheDayPage, '/fr/tools/verse-of-the-day');
      expect(getVerse).not.toHaveBeenCalled();
      expect(container.querySelector('.votd-card__arabic'), 'no verse text baked into this capture').toBeNull();
      expect(container.querySelector('.it__empty'), 'no error banner either').toBeNull();
    });

    it('does call getVerse for a real visitor (navigator.webdriver false)', () => {
      defineNavProp('webdriver', false);
      renderHarness(VerseOfTheDayPage, '/fr/tools/verse-of-the-day');
      expect(getVerse).toHaveBeenCalledTimes(1);
    });
  });

  describe('PrayerTimesPage (/fr/tools/prayer-times): the geolocation-triggered fetch', () => {
    it('never calls navigator.geolocation.getCurrentPosition when navigator.webdriver is true', () => {
      defineNavProp('webdriver', true);
      const getCurrentPosition = vi.fn();
      defineNavProp('geolocation', { getCurrentPosition });
      const { container } = renderHarness(PrayerTimesPage, '/fr/tools/prayer-times');
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(container.querySelector('.it__prayer-list'), 'no prayer times rendered').toBeNull();
    });

    it('does call navigator.geolocation.getCurrentPosition for a real visitor', () => {
      defineNavProp('webdriver', false);
      const getCurrentPosition = vi.fn();
      defineNavProp('geolocation', { getCurrentPosition });
      renderHarness(PrayerTimesPage, '/fr/tools/prayer-times');
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('Quran reader (/fr/tools/quran-reader): chapters/verses/chapter-audio fetches', () => {
    it('never calls getChapters/getVerses/getChapterAudio when navigator.webdriver is true, and still renders a real <h1> and non-empty #main-content', () => {
      defineNavProp('webdriver', true);
      const { container } = renderHarness(Quran, '/fr/tools/quran-reader');
      expect(getChapters).not.toHaveBeenCalled();
      expect(getVerses).not.toHaveBeenCalled();
      expect(getChapterAudio).not.toHaveBeenCalled();
      const main = container.querySelector('#main-content');
      expect(main, '#main-content must exist').toBeTruthy();
      expect(main.textContent.trim().length).toBeGreaterThan(0);
      const h1 = container.querySelector('h1');
      expect(h1, 'a real <h1> must render even before chapters load').toBeTruthy();
      expect(h1.textContent.trim().length).toBeGreaterThan(0);
    });

    it('renders a BreadcrumbList JSON-LD script (sr-only trail) even though the reader has no visible breadcrumb bar', () => {
      defineNavProp('webdriver', true);
      renderHarness(Quran, '/fr/tools/quran-reader');
      const script = document.querySelector('script[data-seo="breadcrumb"]');
      expect(script, 'script[data-seo="breadcrumb"] must exist').toBeTruthy();
      const parsed = JSON.parse(script.textContent);
      expect(parsed.itemListElement.length).toBeGreaterThan(0);
    });

    it('does call getChapters/getVerses/getChapterAudio for a real visitor', () => {
      defineNavProp('webdriver', false);
      renderHarness(Quran, '/fr/tools/quran-reader');
      expect(getChapters).toHaveBeenCalledTimes(1);
      expect(getVerses).toHaveBeenCalledTimes(1);
      expect(getChapterAudio).toHaveBeenCalledTimes(1);
    });
  });

  describe('Enroll (/fr/enroll): newly-added sr-only breadcrumb', () => {
    it('renders a BreadcrumbList JSON-LD script even though the booking wizard has no visible breadcrumb bar', () => {
      renderHarness(Enroll, '/fr/enroll');
      const script = document.querySelector('script[data-seo="breadcrumb"]');
      expect(script, 'script[data-seo="breadcrumb"] must exist').toBeTruthy();
      const parsed = JSON.parse(script.textContent);
      expect(parsed.itemListElement.length).toBeGreaterThan(0);
    });
  });

  describe('component source: every guarded effect checks navigator.webdriver before any fetch/geolocation call', () => {
    const read = (relPath) => fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');

    it('VerseOfTheDayPage.jsx', () => {
      const src = read('../pages/tools/VerseOfTheDayPage.jsx');
      expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(navigator\.webdriver\) return;\s*setVerseError/);
    });

    it('PrayerTimesPage.jsx', () => {
      const src = read('../pages/tools/PrayerTimesPage.jsx');
      expect(src).toMatch(/if \(navigator\.webdriver\) \{ setLoading\(false\); return; \}/);
    });

    it('Quran.jsx', () => {
      const src = read('../pages/Quran.jsx');
      const guardCount = (src.match(/if \(navigator\.webdriver\) return;/g) || []).length;
      expect(guardCount, 'all 3 fetch effects (chapters, verses+audio, per-verse hifz audio) must be guarded').toBe(3);
    });
  });
});
