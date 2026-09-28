import { vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { mountFullPage, headMeta, bodyStrings } from './fullPageRender';
import PrayerTimesPage from '../../pages/tools/PrayerTimesPage';
import QiblaPage from '../../pages/tools/QiblaPage';
import IslamicCalendarPage from '../../pages/tools/IslamicCalendarPage';
import TasbeehPage from '../../pages/tools/TasbeehPage';
import TajweedCheckerPage from '../../pages/tools/TajweedCheckerPage';
import HadithLibrary from '../../pages/HadithLibrary';
// HifzReviewPage.jsx's DEFAULT_CARDS computes `new Date().toISOString()` at
// module-evaluation time. A static import here would evaluate that (and so
// each card's due date) using the REAL current date if this test-utility
// module is itself imported before useFullPageEnvironment()'s beforeAll
// installs the fixed fake clock the rest of this suite runs on — which a
// static top-level `import { BATCH_1E } from './frenchBatch1eStates'`
// elsewhere would do. Importing it lazily, inside hifzReviewStates() below
// (which only ever runs inside a test, after the fake clock is active),
// keeps "today" the one fixed test date regardless of import order.

// French Localization Batch 1E: every template of the batch, and every
// state the shared driver reaches without a real network call, a real
// geolocation prompt, a real microphone or a real date/localStorage value
// carried over between tests.
//
// jsdom has no `navigator.geolocation` at all, so every page already falls
// back to its deterministic "no location, search prominent" state with no
// stubbing needed. The "found" state is reached instead by mocking
// fetchPrayerCity directly (never a live network call).

async function settle(ms = 10) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function click(el) {
  fireEvent.click(el);
  await settle();
}

async function type(el, value) {
  fireEvent.change(el, { target: { value } });
  await act(async () => {});
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

export function pageMeta() {
  return {
    title: document.title,
    description: headMeta('meta[name="description"]'),
    ogTitle: headMeta('meta[property="og:title"]'),
    ogDescription: headMeta('meta[property="og:description"]'),
    htmlLang: document.documentElement.lang,
    htmlDir: document.documentElement.dir,
  };
}

// A realistic Aladhan-shaped response, reused by every geolocation tool.
export const PRAYER_FIXTURE = {
  timings: {
    Fajr: '05:12', Sunrise: '06:34', Dhuhr: '12:41', Asr: '16:02',
    Maghrib: '19:03', Isha: '20:25', Imsak: '05:02', Midnight: '00:12', Lastthird: '22:48',
  },
  date: {
    hijri: { day: '15', month: { number: '4', en: 'Rabi al-Thani' }, year: '1447', weekday: { en: 'Sunday', ar: 'الأحد' } },
    gregorian: { date: '27-09-2026', weekday: { en: 'Sunday' } },
  },
  meta: { timezone: 'Europe/Paris', latitude: '48.85', longitude: '2.35' },
};

async function prayerTimesStates(prefix, visit, mocks) {
  // Reaches the "notifications already granted" branch (its own
  // aria-label, PRAYER_TIMES_TEXT.notifyToggleAria) without a real
  // permission prompt.
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') });
  await mountFullPage(`${prefix}/tools/prayer-times`, PrayerTimesPage);
  await settle();
  await visit('noLocation');
  mocks.fetchPrayerCity.mockResolvedValueOnce(PRAYER_FIXTURE);
  await type($('#pt-city-search'), 'Paris');
  await click($('.it__city-btn'));
  await visit('found');
  await click($('.it__notify-btn, .it__toggle'));
  await visit('notifyToggle');
  await click($('.it__month-toggle'));
  await settle();
  await visit('monthOpen');
}

async function qiblaStates(prefix, visit, mocks) {
  await mountFullPage(`${prefix}/tools/qibla`, QiblaPage);
  await settle();
  await visit('noLocation');
  mocks.fetchPrayerCity.mockResolvedValueOnce(PRAYER_FIXTURE);
  await type($('#qibla-city-search'), 'Paris');
  await click($('.it__city-btn'));
  await visit('found');
}

async function islamicCalendarStates(prefix, visit, mocks) {
  await mountFullPage(`${prefix}/tools/islamic-calendar`, IslamicCalendarPage);
  await settle();
  await visit('noLocation');
  mocks.fetchPrayerCity.mockResolvedValueOnce(PRAYER_FIXTURE);
  await type($('#cal-city-search'), 'Paris');
  await click($('.it__city-btn'));
  await visit('found');
}

async function tasbeehStates(prefix, visit) {
  // Isolate from any other state reached earlier in the same test (the
  // shared afterEach only clears localStorage between tests, not between
  // the en/fr/ar calls inside one).
  try { localStorage.clear(); } catch { /* ignore */ }
  await mountFullPage(`${prefix}/tools/tasbeeh`, TasbeehPage);
  await visit('initial');
  await click($('.tsb__tap'));
  await click($('.tsb__tap'));
  await visit('tapped');
  await click($('.tsb__rst--all'));
  await visit('reset');
}

async function tajweedCheckerStates(prefix, visit) {
  // No browser in the test environment implements SpeechRecognition, so
  // the "unsupported" state is the only one reachable without a real mic.
  await mountFullPage(`${prefix}/tools/tajweed-checker`, TajweedCheckerPage);
  await visit('initial');
  await click($$('.tajweed__verse-tab')[1]);
  await visit('verse2');
}

async function hifzReviewStates(prefix, visit) {
  // Same isolation note as tasbeehStates above. Seeded with a single due
  // card (rather than the page's own 11 defaults) so one quality click
  // reaches the real "done" screen, instead of just advancing to card 2 of
  // 11 — exercising HIFZ_REVIEW_TEXT.done, not another mid-session card.
  try {
    localStorage.clear();
    localStorage.setItem('alrahma_hifz_cards', JSON.stringify([
      { id: 'f1', surah: 'Al-Fatiha', verse: 1, arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', hint: 'Bismillah…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
    ]));
  } catch { /* ignore */ }
  const { default: HifzReviewPage } = await import('../../pages/tools/HifzReviewPage');
  await mountFullPage(`${prefix}/tools/hifz-review`, HifzReviewPage);
  await visit('overview');
  await click($('.btn--lg.btn--block'));
  await visit('session');
  await click($('.btn.btn--green.btn--block'));
  await visit('revealed');
  await click($$('.hifz__quality-btn')[0]);
  await visit('done');
}

async function hadithLibraryStates(prefix, visit, mocks) {
  await mountFullPage(`${prefix}/tools/hadith`, HadithLibrary);
  await visit('grid');
  mocks.fetchMock.mockImplementation((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        hadiths: [{ hadithnumber: 1, text: url.includes('ara-') ? 'نص عربي' : 'English text', grades: [] }],
      }),
    }));
  await click($('.hl__card'));
  await settle(50);
  await visit('loaded');
}

export const BATCH_1E = [
  { key: 'prayerTimes', path: '/tools/prayer-times', run: prayerTimesStates },
  { key: 'qibla', path: '/tools/qibla', run: qiblaStates },
  { key: 'islamicCalendar', path: '/tools/islamic-calendar', run: islamicCalendarStates },
  { key: 'tasbeeh', path: '/tools/tasbeeh', run: tasbeehStates },
  { key: 'tajweedChecker', path: '/tools/tajweed-checker', run: tajweedCheckerStates },
  { key: 'hifzReview', path: '/tools/hifz-review', run: hifzReviewStates },
  { key: 'hadithLibrary', path: '/tools/hadith', run: hadithLibraryStates },
];

export async function collect(page, prefix, mocks) {
  const strings = new Set();
  const states = {};
  await page.run(prefix, async (name) => {
    bodyStrings().forEach((s) => strings.add(s));
    states[name] = pageMeta();
  }, mocks);
  cleanup();
  return { strings, states };
}
