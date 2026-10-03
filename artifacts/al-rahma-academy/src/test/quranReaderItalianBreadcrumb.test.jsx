import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Quran from '../pages/Quran';
import itl from '../i18n/it';
import frl from '../i18n/fr';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Quran Reader breadcrumb prerequisite: /it/tools/quran-reader now renders the
// same visually-hidden breadcrumb as /fr/tools/quran-reader, which also writes the
// BreadcrumbList JSON-LD that scripts/prerender.mjs's waitForHydratedSeo() requires on
// every non-Home route (same pattern as /it/enroll). en, ar, es and de are unchanged.
// Nothing is published here.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();

const mocks = vi.hoisted(() => ({
  getChapters: vi.fn(), getVerses: vi.fn(), getVersesByPage: vi.fn(), getVersesByJuz: vi.fn(),
  getVersesByHizb: vi.fn(), getChapterAudio: vi.fn(), getVerseAudios: vi.fn(),
  getVerseTafsir: vi.fn(), getVerseTafsirCloud: vi.fn(),
}));
vi.mock('../api/quran', async (orig) => ({ ...(await orig()), ...mocks }));
const fetchMock = vi.fn(() => Promise.reject(new Error('network disabled in test')));

const sha = (s) => createHash('sha256').update(s).digest('hex');
const setWebdriver = (value) => Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
const crumbScripts = () => [...document.querySelectorAll('script[data-seo="breadcrumb"]')];
const crumb = () => JSON.parse(crumbScripts()[0].textContent);
const hiddenTrails = () => document.querySelectorAll('.sr-only');
async function snapshot(urlPath) {
  setWebdriver(true);
  await mountFullPage(urlPath, Quran);
  const state = {
    body: document.body.innerHTML,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).sort(),
  };
  cleanup();
  return sha(JSON.stringify(state));
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset().mockRejectedValue(new Error('network disabled in test'));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.navigator.webdriver;
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});

describe('/it/tools/quran-reader writes an Italian BreadcrumbList', () => {
  it('has exactly one breadcrumb script, valid JSON, in order, with Italian names from the existing i18n and Italian URLs', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/quran-reader', Quran);
    expect(crumbScripts()).toHaveLength(1);
    const ld = crumb();
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    // The names come from the existing i18n, not from a hard-coded string.
    expect(ld.itemListElement.map((i) => i.name)).toEqual([itl.nav.home, itl.nav.tools, itl.nav.quranReader]);
    expect(ld.itemListElement.map((i) => i.name)).toEqual(['Pagina iniziale', 'Strumenti Islamici', 'Lettore del Corano']);
    expect(ld.itemListElement.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/it/',
      'https://al-rahmaacademy.com/it/tools',
      'https://al-rahmaacademy.com/it/tools/quran-reader',
    ]);
  });

  it('renders one visually-hidden Italian trail with /it/ links and no Arabic, French or English fallback', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/quran-reader', Quran);
    expect(hiddenTrails()).toHaveLength(1);
    const trail = hiddenTrails()[0];
    expect(trail.textContent).toContain('Pagina iniziale');
    expect(trail.textContent).toContain('Strumenti Islamici');
    expect(trail.textContent).toContain('Lettore del Corano');
    expect(trail.textContent).not.toMatch(/[؀-ۿ]/);
    expect(trail.textContent).not.toMatch(/Accueil|Outils|Lecteur|Home|Islamic Tools|Quran Reader|Reader/);
    expect([...trail.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/it/', '/it/tools']);
    expect(trail.querySelector('[aria-current="page"]').textContent).toBe('Lettore del Corano');
  });

  it('never duplicates: StrictMode keeps one script and one trail', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/quran-reader', () => (
      <StrictMode>
        <Quran />
      </StrictMode>
    ));
    await act(async () => {});
    expect(crumbScripts()).toHaveLength(1);
    expect(hiddenTrails()).toHaveLength(1);
    expect(crumb().itemListElement).toHaveLength(3);
  });
});

describe('fr, en, ar, es and de are unchanged (SHA-256 of the prerender-time DOM and JSON-LD, from origin/main)', () => {
  it('/fr/tools/quran-reader still writes its French breadcrumb exactly as before', async () => {
    setWebdriver(true);
    await mountFullPage('/fr/tools/quran-reader', Quran);
    expect(crumbScripts()).toHaveLength(1);
    expect(crumb().itemListElement.map((i) => [i.name, i.item])).toEqual([
      [frl.nav.home, 'https://al-rahmaacademy.com/fr/'],
      [frl.nav.tools, 'https://al-rahmaacademy.com/fr/tools'],
      [frl.nav.quranReader, 'https://al-rahmaacademy.com/fr/tools/quran-reader'],
    ]);
    expect(crumb().itemListElement.map((i) => i.name)).toEqual(['Accueil', 'Outils islamiques', 'Lecteur du Coran']);
    cleanup();
    expect(await snapshot('/fr/tools/quran-reader')).toBe('4189f7d15acda91cc62aa05a2d10795fa94655b899336aba7eb7ca0838bd97ea');
  });

  it('en, ar, es and de render no breadcrumb and are byte-identical to before', async () => {
    const paths = { en: '/tools/quran-reader', ar: '/ar/tools/quran-reader', es: '/es/tools/quran-reader', de: '/de/tools/quran-reader' };
    for (const [l, p] of Object.entries(paths)) {
      setWebdriver(true);
      await mountFullPage(p, Quran);
      expect(crumbScripts(), l).toHaveLength(0);
      expect(hiddenTrails(), l).toHaveLength(0);
      cleanup();
    }
    expect({
      en: await snapshot(paths.en), ar: await snapshot(paths.ar), es: await snapshot(paths.es), de: await snapshot(paths.de),
    }).toEqual({ en: 'ea56ed0b377dde7d65867123fdc6cf027ac0653741233bd7d1d0d9d4ee3e9343', ar: '4889afa31df36344956e084819cea9112ed3314b6afcff7f00fa8e921903c6ef', es: 'c46d481796a3dbb5a634436189fcb27ce781b60c6d4284a7db5eb85da1938187', de: 'a1fbad210958017ca59194e2903cfb5348f356d0abfb39fa15808301a570d4a7' });
  });
});

describe('prerender safety: the new breadcrumb adds nothing dynamic', () => {
  it('under navigator.webdriver nothing is fetched, no audio is loaded and no verse, translation, tafsir or progress appears', async () => {
    setWebdriver(true);
    window.localStorage.setItem('khatm-done', JSON.stringify([1, 2, 3]));
    await mountFullPage('/it/tools/quran-reader', Quran);
    for (const m of Object.values(mocks)) expect(m).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('audio[src]')).toBeNull();
    expect(document.querySelector('.qlc__arabic, .qlc__chapter-ar, .qlc__tafsir-panel')).toBeNull();
    const main = document.body.textContent;
    expect(main).not.toMatch(/\d{1,3}:\d{1,3}/);
    expect(main).not.toMatch(/\d+\/114/);
    expect(document.documentElement.outerHTML).not.toMatch(/quran\.com|quranicaudio|verses\.quran/i);
    expect(crumbScripts()).toHaveLength(1);
  });

  it('the Italian capture is identical on different days', async () => {
    const out = [];
    for (const d of ['2026-01-01T10:00:00Z', '2026-09-27T10:00:00Z', '2026-12-31T23:30:00Z']) {
      vi.setSystemTime(new Date(d));
      out.push(await snapshot('/it/tools/quran-reader'));
    }
    expect(new Set(out).size).toBe(1);
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  });
});

describe('nothing is published by this change', () => {
  it('/it/tools/quran-reader has no manifest entry and no sitemap URL; the sitemap is unchanged (133, IT 35)', () => {
    expect(PRERENDER_MANIFEST.some((e) => e.route === '/tools/quran-reader' && e.locale === 'it')).toBe(false);
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/tools/quran-reader').map((e) => e.locale)).toEqual(['fr']);
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(133);
    expect(locs.filter((u) => u.includes('/it/'))).toHaveLength(35);
    expect(locs.some((u) => u.endsWith('/it/tools/quran-reader'))).toBe(false);
  });
});
