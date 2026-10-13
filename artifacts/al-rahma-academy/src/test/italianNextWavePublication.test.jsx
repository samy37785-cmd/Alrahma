import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_MANIFEST, hreflangLinksFor, ogLocaleFor } from '../../scripts/prerender-routes.mjs';

// Italian SEO Publication Gate, wave 3 (2026-10-03): /it/tools/hadith and
// /it/tools/prayer-times are published. /it/enroll is NOT: its read-only
// timezone field is initialised from Intl at module load, so the static file
// freezes the build machine's timezone (production /fr/enroll shows "UTC",
// a build on another machine shows that machine's zone). It stays
// unpublished until the field is neutral in the prerender (separate fix).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://al-rahmaacademy.com';
const sitemapXml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const published = PRERENDER_MANIFEST.filter((e) => e.status === 'published');

describe('manifest and sitemap: baseline derived from the manifest, not a hard-coded total', () => {
  it('sitemap equals the published manifest entries; Italian grew by exactly hadith, prayer-times, enroll, verse-of-the-day and quran-reader', () => {
    expect(locs).toHaveLength(published.length);
    const itPublished = published.filter((e) => e.locale === 'it');
    const itLocs = locs.filter((u) => u.startsWith(`${ORIGIN}/it/`));
    expect(itLocs).toHaveLength(itPublished.length);
    // Baseline before wave 3: 129 total, 31 Italian. Waves 3 + the final Enroll publication add exactly 3.
    // The en + ar versions of the five routes (2026-10-13) are a later, separate wave of 10.
    expect(published.length - 10 - 129).toBe(5);
    expect(itPublished.length - 31).toBe(5);
    expect(itPublished.map((e) => e.route)).toEqual(expect.arrayContaining(['/tools/hadith', '/tools/prayer-times', '/enroll', '/tools/verse-of-the-day', '/tools/quran-reader']));
    expect(locs).toContain(`${ORIGIN}/it/enroll`);
    expect(locs).toContain(`${ORIGIN}/it/tools/hadith`);
    expect(locs).toContain(`${ORIGIN}/it/tools/prayer-times`);
  });

  it('every other locale kept its count: 36 fr; en and ar are 36 (31 + the five tools/Enroll routes, 2026-10-13)', () => {
    const count = (l) => published.filter((e) => e.locale === l).length;
    expect([count('en'), count('ar'), count('fr')]).toEqual([36, 36, 36]);
  });
});

const PAGES = [
  {
    route: '/tools/hadith',
    file: 'it/tools/hadith/index.html',
    title: 'Biblioteca degli Hadith | AL-Rahma Academy',
    description: 'Sfoglia e cerca 10 raccolte autentiche di hadith, tra cui Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud e altre.',
    h1: 'Biblioteca islamica degli Hadith',
    crumbs: ['Pagina iniziale', 'Strumenti Islamici', 'Biblioteca Hadith'],
  },
  {
    route: '/tools/prayer-times',
    file: 'it/tools/prayer-times/index.html',
    title: 'Orari di preghiera | AL-Rahma Academy',
    description: 'Orari di preghiera precisi per la tua posizione, con conto alla rovescia in diretta, avvisi di preghiera e calendario mensile completo.',
    h1: 'Orari di preghiera',
    crumbs: ['Pagina iniziale', 'Strumenti', 'Strumenti per la preghiera', 'Orari di preghiera'],
  },
];

describe('hreflang and og:locale follow the locales actually published for each route', () => {
  for (const { route } of PAGES) {
    // en + ar joined on 2026-10-13: all four languages, x-default English.
    it(`${route}: fr + it + en + ar + x-default (English), reciprocal on every version`, () => {
      for (const locale of ['fr', 'it', 'en', 'ar']) {
        const links = hreflangLinksFor({ route, locale });
        expect(links.map((l) => l.hreflang).sort()).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
        expect(links.find((l) => l.hreflang === 'it').href).toBe(`${ORIGIN}/it${route}`);
        expect(links.find((l) => l.hreflang === 'fr').href).toBe(`${ORIGIN}/fr${route}`);
        expect(links.find((l) => l.hreflang === 'en').href).toBe(`${ORIGIN}${route}`);
        expect(links.find((l) => l.hreflang === 'ar').href).toBe(`${ORIGIN}/ar${route}`);
        expect(links.find((l) => l.hreflang === 'x-default').href).toBe(`${ORIGIN}${route}`);
      }
      expect(ogLocaleFor({ route, locale: 'it' })).toEqual({ primary: 'it_IT', alternates: ['fr_FR', 'en_GB', 'ar_EG'] });
      expect(ogLocaleFor({ route, locale: 'fr' })).toEqual({ primary: 'fr_FR', alternates: ['it_IT', 'en_GB', 'ar_EG'] });
    });
  }
});

describe('/it/enroll is published (en + ar joined fr + it on 2026-10-13)', () => {
  it('has one Italian manifest entry and one sitemap URL; hreflang fr + it + en + ar + x-default (English), reciprocal', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(1);
    expect(locs.filter((u) => u === `${ORIGIN}/it/enroll`)).toHaveLength(1);
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll').map((e) => e.locale)).toEqual(['fr', 'it', 'en', 'ar']);
    for (const locale of ['fr', 'it', 'en', 'ar']) {
      const links = hreflangLinksFor({ route: '/enroll', locale });
      expect(links).toEqual([
        { hreflang: 'fr', href: `${ORIGIN}/fr/enroll` },
        { hreflang: 'it', href: `${ORIGIN}/it/enroll` },
        { hreflang: 'en', href: `${ORIGIN}/enroll` },
        { hreflang: 'ar', href: `${ORIGIN}/ar/enroll` },
        { hreflang: 'x-default', href: `${ORIGIN}/enroll` },
      ]);
    }
    expect(locs.filter((u) => u === `${ORIGIN}/enroll` || u === `${ORIGIN}/ar/enroll`)).toHaveLength(2);
  });
});

describe('the other unpublished Italian tools stay out', () => {
  it('qibla, islamic-calendar, hifz-review and blog have no Italian entry or URL', () => {
    for (const r of ['/tools/qibla', '/tools/islamic-calendar', '/tools/hifz-review', '/resources/blog']) {
      expect(PRERENDER_MANIFEST.filter((e) => e.route === r && e.locale === 'it'), r).toHaveLength(0);
      expect(locs.some((u) => u === `${ORIGIN}/it${r}`), r).toBe(false);
    }
  });
});
