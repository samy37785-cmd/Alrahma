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
const distDir = path.resolve(__dirname, '../../dist/public');
const distExists = fs.existsSync(path.join(distDir, 'index.html'));
const ORIGIN = 'https://al-rahmaacademy.com';
const sitemapXml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const published = PRERENDER_MANIFEST.filter((e) => e.status === 'published');

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

describe('manifest and sitemap: baseline derived from the manifest, not a hard-coded total', () => {
  it('sitemap equals the published manifest entries; Italian grew by exactly the two wave-3 pages', () => {
    expect(locs).toHaveLength(published.length);
    const itPublished = published.filter((e) => e.locale === 'it');
    const itLocs = locs.filter((u) => u.startsWith(`${ORIGIN}/it/`));
    expect(itLocs).toHaveLength(itPublished.length);
    // Baseline before this wave: 129 total, 31 Italian. Wave 3 adds exactly 2.
    expect(published.length - 129).toBe(2);
    expect(itPublished.length - 31).toBe(2);
    expect(itPublished.map((e) => e.route)).toEqual(expect.arrayContaining(['/tools/hadith', '/tools/prayer-times']));
    expect(locs).toContain(`${ORIGIN}/it/tools/hadith`);
    expect(locs).toContain(`${ORIGIN}/it/tools/prayer-times`);
  });

  it('every other locale kept its count: 31 en, 31 ar, 36 fr', () => {
    const count = (l) => published.filter((e) => e.locale === l).length;
    expect([count('en'), count('ar'), count('fr')]).toEqual([31, 31, 36]);
  });
});

describe('hreflang and og:locale follow the locales actually published for each route', () => {
  for (const { route } of PAGES) {
    it(`${route}: exactly fr + it + x-default (en and ar are not published), reciprocal on both versions`, () => {
      for (const locale of ['fr', 'it']) {
        const links = hreflangLinksFor({ route, locale });
        expect(links.map((l) => l.hreflang).sort()).toEqual(['fr', 'it', 'x-default']);
        expect(links.find((l) => l.hreflang === 'it').href).toBe(`${ORIGIN}/it${route}`);
        expect(links.find((l) => l.hreflang === 'fr').href).toBe(`${ORIGIN}/fr${route}`);
        expect(links.find((l) => l.hreflang === 'x-default').href).toBe(`${ORIGIN}${route}`);
      }
      expect(ogLocaleFor({ route, locale: 'it' })).toEqual({ primary: 'it_IT', alternates: ['fr_FR'] });
      expect(ogLocaleFor({ route, locale: 'fr' })).toEqual({ primary: 'fr_FR', alternates: ['it_IT'] });
    });
  }
});

describe('/it/enroll stays unpublished (ENROLL_BLOCKED_PRERENDER_PERSONALIZATION)', () => {
  it('has no manifest entry, no sitemap URL and no Italian alternate on /fr/enroll', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(0);
    expect(locs.some((u) => u.includes('/it/enroll'))).toBe(false);
    for (const locale of ['en', 'ar', 'fr']) {
      expect(hreflangLinksFor({ route: '/enroll', locale }).some((l) => l.hreflang === 'it'), locale).toBe(false);
      expect(ogLocaleFor({ route: '/enroll', locale }).alternates, locale).not.toContain('it_IT');
    }
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll').map((e) => e.locale)).toEqual(['fr']);
  });

  it.skipIf(!distExists)('has no Italian file in dist, and /fr/enroll carries no Italian alternate', () => {
    expect(fs.existsSync(path.join(distDir, 'it/enroll/index.html'))).toBe(false);
    const fr = fs.readFileSync(path.join(distDir, 'fr/enroll/index.html'), 'utf8');
    expect(fr).not.toContain('hreflang="it"');
  });
});

describe('the other unpublished Italian tools stay out', () => {
  it('quran-reader, qibla, islamic-calendar, verse-of-the-day, hifz-review and blog have no Italian entry or URL', () => {
    for (const r of ['/tools/quran-reader', '/tools/qibla', '/tools/islamic-calendar', '/tools/verse-of-the-day', '/tools/hifz-review', '/resources/blog']) {
      expect(PRERENDER_MANIFEST.filter((e) => e.route === r && e.locale === 'it'), r).toHaveLength(0);
      expect(locs.some((u) => u === `${ORIGIN}/it${r}`), r).toBe(false);
    }
  });
});

describe.skipIf(!distExists)('raw prerendered HTML (dist/public) — before any JavaScript', () => {
  const read = (f) => fs.readFileSync(path.join(distDir, f), 'utf8');
  const attr = (html, re) => (html.match(re) || [])[1];
  const mainText = (html) => {
    const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
    return (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  };

  for (const page of PAGES) {
    describe(`/it${page.route}`, () => {
      const html = fs.existsSync(path.join(distDir, page.file)) ? read(page.file) : '';

      it('exists, with lang=it dir=ltr, self canonical, index/follow and it_IT', () => {
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain('<html lang="it" dir="ltr">');
        expect(attr(html, /rel="canonical" href="([^"]*)"/)).toBe(`${ORIGIN}/it${page.route}`);
        expect(html.match(/rel="canonical"/g)).toHaveLength(1);
        expect(attr(html, /name="robots" content="([^"]*)"/)).toMatch(/^index, follow/);
        expect(html).toContain('property="og:locale" content="it_IT"');
        expect(html).toContain('property="og:locale:alternate" content="fr_FR"');
        expect(html).not.toMatch(/og:locale:alternate" content="(en_GB|ar_EG|es_ES|de_DE)"/);
      });

      it('has the Italian title, description, og tags and a single Italian H1', () => {
        expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(page.title);
        expect(attr(html, /name="description" content="([^"]*)"/)).toBe(page.description);
        expect(attr(html, /property="og:title" content="([^"]*)"/)).toBe(page.title);
        expect(attr(html, /property="og:description" content="([^"]*)"/)).toBe(page.description);
        expect([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())).toEqual([page.h1]);
      });

      it('has exactly fr + it + x-default hreflang, with the right URLs', () => {
        const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => [m[1], m[2]]);
        expect(Object.fromEntries(links)).toEqual({
          fr: `${ORIGIN}/fr${page.route}`,
          it: `${ORIGIN}/it${page.route}`,
          'x-default': `${ORIGIN}${page.route}`,
        });
        expect(links).toHaveLength(3);
      });

      it('has the Italian breadcrumb and only the JSON-LD the page already had, with no user data', () => {
        const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
        const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
        expect(crumb.itemListElement.map((i) => i.name)).toEqual(page.crumbs);
        expect(crumb.itemListElement.at(-1).item).toBe(`${ORIGIN}/it${page.route}`);
        const types = blocks.map((b) => (Array.isArray(b['@type']) ? b['@type'].join('+') : b['@type'])).sort();
        expect(types).toEqual(['BreadcrumbList', 'EducationalOrganization+LocalBusiness', 'WebSite']);
        // The shared Organization block is business data: no per-page or per-user extras.
        expect(JSON.stringify(blocks)).not.toMatch(/Question|Answer|Person|Review|PrayerTime/);
      });

      it('is not the English SPA shell, and does not canonicalise to the home page', () => {
        expect(html).not.toContain('<html lang="en"');
        expect(html).not.toContain(`rel="canonical" href="${ORIGIN}/"`);
        expect(attr(html, /<title>([^<]*)<\/title>/)).not.toMatch(/Learn the Quran Online/);
        expect(mainText(html)).not.toMatch(/Hadith Library|Prayer Times|Prayer Tools|Also try/);
      });
    });
  }

  describe('/it/tools/hadith: nothing dynamic or fetched is frozen in', () => {
    const html = fs.existsSync(path.join(distDir, PAGES[0].file)) ? read(PAGES[0].file) : '';
    it('shows the ten collection cards and no hadith, list, loading state, narration or CDN data', () => {
      expect((html.match(/class="hl__card[ "]/g) || []).length).toBe(10);
      expect(html).not.toMatch(/hl__hadith|hl__list|hl__loading|hl__error/);
      expect(mainText(html)).not.toMatch(/Narrated|narrated by|Caricamento|Loading/);
      expect(html).not.toMatch(/cdn\.jsdelivr|fawazahmed0|hadith-api/);
    });
    it('keeps the Italian card text and the source terms', () => {
      const t = mainText(html);
      expect(t).toContain('I 42 hadith più essenziali');
      expect(t).toContain('(d. 256 AH)');
      expect(t).toContain('صحيح البخاري');
    });
  });

  describe('/it/tools/prayer-times: no location, time, date or timezone is frozen in', () => {
    const html = fs.existsSync(path.join(distDir, PAGES[1].file)) ? read(PAGES[1].file) : '';
    it('has no prayer list, clock, coordinates, city, timezone or countdown', () => {
      const t = mainText(html);
      expect(html).not.toMatch(/it__prayer-list|it__countdown|it__next|it__month/);
      expect(t).not.toMatch(/\b\d{1,2}:\d{2}\b/);
      expect(t).not.toMatch(/-?\d{1,3}\.\d{3,}/);
      expect(t).not.toMatch(/\b(Africa|America|Asia|Europe|Pacific|Atlantic|Indian|Australia|Etc)\/[A-Z]/);
      expect(t).not.toMatch(/\b(GMT|UTC)[+-]?\d*\b/);
      expect(t).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(html).not.toMatch(/api\.aladhan|nominatim|geocod/i);
    });
    it('shows only the neutral Italian empty state and the source method names', () => {
      const t = mainText(html);
      expect(t).toContain('Metodo di calcolo');
      expect(t).toContain('Egyptian Authority');
      expect(t).toContain('Prova anche:');
    });
  });

  describe('EN/AR/FR pages are unchanged apart from the expected Italian hreflang/og alternate', () => {
    for (const route of ['/tools/hadith', '/tools/prayer-times']) {
      it(`/fr${route} now also lists it, and nothing else about its alternates changed`, () => {
        const html = read(`fr${route}/index.html`);
        const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => m[1]);
        expect(links.sort()).toEqual(['fr', 'it', 'x-default']);
        expect(html).toContain('<html lang="fr" dir="ltr">');
        expect(html).toContain(`rel="canonical" href="${ORIGIN}/fr${route}"`);
      });
    }
  });
});
