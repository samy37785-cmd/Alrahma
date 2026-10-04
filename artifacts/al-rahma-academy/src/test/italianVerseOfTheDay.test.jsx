import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, act, fireEvent, screen } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import VerseOfTheDayPage from '../pages/tools/VerseOfTheDayPage';
import { DAILY_VERSE_KEYS } from '../utils/islamicToolsUtils';
import { PRERENDER_MANIFEST, hreflangLinksFor } from '../../scripts/prerender-routes.mjs';

// Italian Verse of the Day publication gate. The page UI is fully Italian; the
// Arabic verse and its reference are source text, and the live Quran.com
// translation (id 20) stays the English source, exactly as on /fr/ and on the
// Italian Home and Tajweed pages (italianReligiousSourceLanguagePolicy.test.jsx):
// no Italian translation of a verse is created without a licensed source. The
// component and the Quran API module are NOT changed by this publication.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockGetVerse = vi.fn();
vi.mock('../api/quran', () => ({ getVerse: (...a) => mockGetVerse(...a) }));

useFullPageEnvironment();

const sha = (s) => createHash('sha256').update(s).digest('hex');
const shaFile = (rel) =>
  sha(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'));
const FAKE_VERSE = {
  text_uthmani: 'لَا يُكَلِّفُ ٱللَّهُ نَفۡسًا إِلَّا وُسۡعَهَا',
  translations: [{ text: 'Allah does not charge a soul except [with that within] its capacity.' }],
};

function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true, writable: true });
}
beforeEach(() => {
  mockGetVerse.mockReset();
  mockGetVerse.mockResolvedValue(FAKE_VERSE);
});
afterEach(() => {
  cleanup();
  delete window.navigator.webdriver;
});

async function capture(urlPath) {
  setWebdriver(true);
  await mountFullPage(urlPath, VerseOfTheDayPage);
  const state = { title: document.title, body: document.querySelector('#main-content').innerHTML };
  cleanup();
  return state;
}

describe('the component and its data source are unchanged', () => {
  it('VerseOfTheDayPage.jsx, api/quran.js and islamicToolsUtils.js hash to origin/main (the Italian description line aside)', () => {
    // Italian SEO Meta Descriptions Wave 1: the only change to this file is the `it` description
    // string; it is mapped back to the origin/main text before hashing, so any other edit still fails.
    const NEW_IT_DESC = "Un versetto del Corano ogni giorno: testo arabo, riferimento e traduzione da fonte esterna. Per iniziare la giornata con le parole di Allah.";
    const OLD_IT_DESC = "Un versetto del Corano scelto ogni giorno con traduzione — inizia la giornata con le parole di Allah.";
    const votd = fs.readFileSync(path.resolve(__dirname, '..', 'pages/tools/VerseOfTheDayPage.jsx'), 'utf8').replace(/\r\n/g, '\n');
    // Italian discoverability PR: the related-tools nav hides the unpublished Qibla/Calendar links in
    // Italian and adds the Tajweed Checker link (two imports + the nav block). Those edits are mapped
    // back to the origin/main text too, so every other edit to the file still fails this hash.
    const NEW_IMPORTS = "import { isRouteHidden } from '../../utils/italianLinkPolicy';\nimport { IT_TAJWEED_ROUTE, IT_TAJWEED_RELATED_LABEL } from '../../i18n/itDiscoverability';\n";
    const NEW_NAV = "            {!isRouteHidden(lang, '/tools/qibla') && <Link to=\"/tools/qibla\">🧭 {copy.qibla}</Link>}\n            {!isRouteHidden(lang, '/tools/islamic-calendar') && <Link to=\"/tools/islamic-calendar\">📅 {copy.calendar}</Link>}\n            <Link to=\"/tools/adhkar\">📿 {copy.adhkar}</Link>\n            {lang === 'it' && <Link to={IT_TAJWEED_ROUTE}>🎯 {IT_TAJWEED_RELATED_LABEL}</Link>}\n";
    const OLD_NAV = "            <Link to=\"/tools/qibla\">🧭 {copy.qibla}</Link>\n            <Link to=\"/tools/islamic-calendar\">📅 {copy.calendar}</Link>\n            <Link to=\"/tools/adhkar\">📿 {copy.adhkar}</Link>\n";
    expect(votd.split(NEW_IT_DESC)).toHaveLength(2);
    expect(votd.split(NEW_IMPORTS)).toHaveLength(2);
    expect(votd.split(NEW_NAV)).toHaveLength(2);
    expect(sha(votd.replace(NEW_IT_DESC, OLD_IT_DESC).replace(NEW_IMPORTS, '').replace(NEW_NAV, OLD_NAV))).toBe('234b3c98d308a7f66526d5940fdee0eea0278735067c7bdc98cfdd1daab02a05');
    expect(shaFile('api/quran.js')).toBe('84ad13d403c5ee7f879365971a2140044c85c8c32db2d7c62c702692fd8d1c88');
    expect(shaFile('utils/islamicToolsUtils.js')).toBe('df31e29fbc2229194e12025a29cd9e34addead0155e47e81acc56898f344ce27');
  });

  it('EN/AR/FR prerender captures are unchanged (SHA-256 baselines from origin/main)', async () => {
    const h = {};
    for (const [k, p] of [['en', '/tools/verse-of-the-day'], ['ar', '/ar/tools/verse-of-the-day'], ['fr', '/fr/tools/verse-of-the-day']]) {
      const c = await capture(p);
      h[k] = sha(JSON.stringify(c));
    }
    expect(h).toEqual({ en: '19921dd9643c4302d8de9d5908f0fe1d62239d4770b98264c9d7965026c929c9', ar: 'bd9c7259b551e4957a93e116876c866218727d876c7b51ba43de2b3d04c1aaea', fr: '5197ecf5639e7bbb7d1e6d6f777af62233a07001089097ad8373d98ff7f9487f' });
  });
});

describe('/it/tools/verse-of-the-day: complete Italian shell, no English or French fallback', () => {
  it('title, description, H1, breadcrumb, hero, CTA and related tools are Italian', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toBe('Versetto del giorno | AL-Rahma Academy');
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Un versetto del Corano ogni giorno: testo arabo, riferimento e traduzione da fonte esterna. Per iniziare la giornata con le parole di Allah.',
    );
    expect([...document.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Versetto del giorno']);
    const text = document.querySelector('#main-content').textContent;
    for (const s of ['Strumenti', 'Strumenti per la preghiera', 'Strumenti islamici', 'Un versetto scelto con cura', 'Prenota una lezione di prova gratuita', 'Nessuna carta di credito', 'Prova anche:', 'Orari di preghiera', 'Adhkar quotidiani', 'Verificatore di Tajweed']) {
      expect(text, s).toContain(s);
    }
    // Qibla and Calendar have no published Italian page, so they are not linked (italianInternalLinks.test.jsx).
    for (const s of ['Direzione della Qibla', 'Calendario islamico']) expect(text, s).not.toContain(s);
    expect(document.querySelector('nav.it__also-try').getAttribute('aria-label')).toBe('Strumenti correlati');
    for (const s of ['Verse of the Day', 'Islamic Tools', 'Related tools', 'Also try', 'Prayer Times', 'Qibla Direction', 'Islamic Calendar', 'Daily Adhkar', 'Book a Free Trial', 'No credit card', 'Verset du jour', 'Outils']) {
      expect(text, s).not.toContain(s);
    }
  });

  it('error state, buttons and aria-labels are Italian after a real visitor load', async () => {
    setWebdriver(false);
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    const labels = [...document.querySelectorAll('.votd-actions [aria-label]')].map((e) => e.getAttribute('aria-label'));
    expect(labels).toEqual(['📋 Copia', '🔗 Condividi', 'Condividi su WhatsApp', 'Leggi nel contesto']);
    const text = document.querySelector('.votd-actions').textContent + document.querySelector('.votd-hint').textContent;
    for (const s of ['Copia', 'Condividi', 'Leggi la sura completa', 'Fai uno screenshot']) expect(text, s).toContain(s);
    for (const s of ['Copy', 'Share', 'Read full chapter', 'Screenshot the card']) expect(text, s).not.toContain(s);

    cleanup();
    mockGetVerse.mockReset();
    mockGetVerse.mockRejectedValue(new Error('offline'));
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(document.querySelector('.it__empty').textContent).toBe('Impossibile caricare il versetto. Controlla la connessione.');
  });
});

describe('religious text policy: Arabic and reference untouched, translation stays the English source', () => {
  it('real visitor on /it/: Arabic verse and reference as fetched, English translation shown, no Italian translation invented', async () => {
    setWebdriver(false);
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    const key = DAILY_VERSE_KEYS[(new Date().getDate() - 1) % DAILY_VERSE_KEYS.length];
    expect(mockGetVerse).toHaveBeenCalledTimes(1);
    expect(mockGetVerse).toHaveBeenCalledWith(key, 20);
    expect(document.querySelector('.votd-card__arabic').textContent).toContain(FAKE_VERSE.text_uthmani);
    expect(document.querySelector('.votd-card__arabic').getAttribute('lang')).toBe('ar');
    expect(document.querySelector('.votd-card__ref').textContent).toBe(`Corano · ${key}`);
    expect(document.querySelector('.votd-card__trans').textContent).toContain('Allah does not charge a soul except');
    // The same English source as /fr/ and /: the translation is not localised.
    cleanup();
    await mountFullPage('/fr/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(document.querySelector('.votd-card__trans').textContent).toContain('Allah does not charge a soul except');
  });

  it('Arabic page still hides the English translation (unchanged)', async () => {
    setWebdriver(false);
    await mountFullPage('/ar/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(document.querySelector('.votd-card__arabic')).not.toBeNull();
    expect(document.querySelector('.votd-card__trans')).toBeNull();
  });

  it('copy and WhatsApp share carry the Arabic, the English translation and the Italian labels', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    setWebdriver(false);
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    const key = DAILY_VERSE_KEYS[(new Date().getDate() - 1) % DAILY_VERSE_KEYS.length];
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '📋 Copia' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain(FAKE_VERSE.text_uthmani);
    expect(copied).toContain('Allah does not charge a soul');
    expect(copied).toContain(`— Corano ${key}`);
    const wa = decodeURIComponent(document.querySelector('a.votd-btn--wa').getAttribute('href'));
    expect(wa).toContain('Versetto del giorno');
    expect(wa).toContain('Impara il Corano con Al-Rahma Academy');
  });
});

describe('prerender safety: nothing dated or fetched is frozen into the static file', () => {
  it('under navigator.webdriver nothing is fetched and the card is a neutral spinner only', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/verse-of-the-day', VerseOfTheDayPage);
    expect(mockGetVerse).not.toHaveBeenCalled();
    expect(document.querySelector('.it__spinner')).not.toBeNull();
    for (const sel of ['.votd-card__arabic', '.votd-card__trans', '.votd-card__ref', '.votd-actions', '.votd-hint', '.it__empty']) {
      expect(document.querySelector(sel), sel).toBeNull();
    }
    expect(document.querySelector('#main-content').textContent).not.toMatch(/\d{1,3}:\d{1,3}/);
  });

  it('the capture is identical on different days (no build-day verse, date or reference)', async () => {
    const html = [];
    for (const d of ['2026-01-01T10:00:00Z', '2026-09-27T10:00:00Z', '2026-12-31T23:30:00Z']) {
      vi.setSystemTime(new Date(d));
      html.push((await capture('/it/tools/verse-of-the-day')).body);
    }
    expect(new Set(html).size).toBe(1);
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  });
});

describe('publication: one new Italian URL, x-default is the published French page', () => {
  it('manifest has it for verse-of-the-day, and hreflang is fr + it + x-default (fr), reciprocal', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/tools/verse-of-the-day').map((e) => e.locale)).toEqual(['fr', 'it']);
    for (const locale of ['fr', 'it']) {
      expect(hreflangLinksFor({ route: '/tools/verse-of-the-day', locale })).toEqual([
        { hreflang: 'fr', href: 'https://al-rahmaacademy.com/fr/tools/verse-of-the-day' },
        { hreflang: 'it', href: 'https://al-rahmaacademy.com/it/tools/verse-of-the-day' },
        { hreflang: 'x-default', href: 'https://al-rahmaacademy.com/fr/tools/verse-of-the-day' },
      ]);
    }
  });

  it('the sitemap holds exactly one Italian verse-of-the-day URL and no en/ar one', () => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.filter((u) => u.endsWith('/tools/verse-of-the-day')).sort()).toEqual([
      'https://al-rahmaacademy.com/fr/tools/verse-of-the-day',
      'https://al-rahmaacademy.com/it/tools/verse-of-the-day',
    ]);
    expect(locs).toHaveLength(PRERENDER_MANIFEST.filter((e) => e.status === 'published').length);
  });
});
