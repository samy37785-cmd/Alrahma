import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { PRERENDER_MANIFEST, canonicalUrlFor } from '../../scripts/prerender-routes.mjs';

// Sitemap fix (2026-09-26): public/sitemap.xml must contain exactly the
// (route, locale) pairs that are actually published and prerendered — no
// more, no less. Before this fix it was generated from scripts/seoRoutes.mjs
// (a stale, EN-only, non-prerender-aware list, plus hardcoded /it/ and
// /fr/), so half its 42 entries served Home-shell content with a wrong
// canonical, and it carried zero /ar/ URLs at all.
//
// This reads the real file on disk and parses it as actual XML (via
// jsdom's JSDOM, the same tool prerenderOutput.test.js already uses for
// this repo's other "read real output, not a mock" checks) rather than
// scanning the raw text with regex, so a structural problem (bad
// namespace, malformed XML, wrong tag) is caught the same way a missing or
// extra URL would be.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sitemapPath = path.resolve(__dirname, '../../public/sitemap.xml');
const xml = readFileSync(sitemapPath, 'utf8');
const dom = new JSDOM(xml, { contentType: 'text/xml' });
const doc = dom.window.document;

const ORIGIN = 'https://al-rahmaacademy.com';

// The 29 published route "slugs" (en path), written literally here rather
// than imported — this suite must be able to catch a bug in
// PRERENDER_MANIFEST or canonicalUrlFor() (a wrong route, a missing
// teacher id, a locale mix-up), not merely confirm the sitemap agrees with
// whatever those currently say. The second describe block below adds the
// complementary manifest-derived check, so a real drift between the two
// sources is caught either way.
//
// Legal/policy pages (2026-09-26): /academy/privacy, /academy/terms and
// /academy/refund-policy joined the published set once
// fix/legal-page-main-landmarks (PR #112) added the id="main-content"
// prerequisite and this PR's PRERENDER_MANIFEST entries prerendered them.
//
// FAQ (2026-09-26): /resources/faq joined the published set once
// fix/faq-render-initial-content (PR #114) made every answer's text
// always present in the DOM (previously conditionally unmounted when its
// question was closed), removing the only real prerender blocker.
//
// Static tools (2026-09-26): /tools/prayer, /tools/tasbeeh and
// /tools/arabic-alphabet joined the published set once a read-only SEO
// discovery pass confirmed all three are genuinely static per-locale (no
// fetch/date/geolocation/localStorage affecting initial content). Every
// other tool page (tajweed-checker, quran-reader, hadith, prayer-times,
// qibla, islamic-calendar, verse-of-the-day, hifz-review) remains
// unpublished and out of scope, same as Blog, Islamic Studies and Enroll.
//
// Adhkar (2026-09-26): /tools/adhkar joined the published set once
// fix/adhkar-initial-content (PR #117) fixed Adhkar.jsx to always mount
// every category's cards (hiding only the non-selected ones), removing the
// only real prerender blocker a read-only discovery pass had found.
//
// French SEO Publication Gate (2026-09-30): this same 29-route list gained
// a third locale (fr) once French Localization Batch 1A-1E gave every one
// of them real, reviewed French content — no route was added to or removed
// from this list itself.
const ROUTES = [
  '/',
  '/courses',
  '/courses/quran',
  '/courses/arabic',
  '/courses/ijazah',
  '/academy',
  '/academy/about',
  '/academy/teachers',
  '/resources',
  '/tools',
  ...Array.from({ length: 11 }, (_, i) => `/academy/teachers/${i + 1}`),
  '/academy/privacy',
  '/academy/terms',
  '/academy/refund-policy',
  '/resources/faq',
  '/tools/prayer',
  '/tools/tasbeeh',
  '/tools/arabic-alphabet',
  '/tools/adhkar',
];

function pathForLocale(route, locale) {
  if (locale === 'en') return route;
  return route === '/' ? `/${locale}/` : `/${locale}${route}`;
}

// French SEO Publication Gate (2026-09-30): fr joined every one of these 29
// routes (see scripts/prerender-routes.mjs's own "French wave" comment) —
// the exact same ROUTES list above, now with a third locale, not a new/
// different route set. it/es/de remain unpublished, unchanged.
const EXPECTED_EN_URLS = ROUTES.map((route) => ORIGIN + pathForLocale(route, 'en'));
const EXPECTED_AR_URLS = ROUTES.map((route) => ORIGIN + pathForLocale(route, 'ar'));
const EXPECTED_FR_URLS = ROUTES.map((route) => ORIGIN + pathForLocale(route, 'fr'));
const EXPECTED_URLS = [...EXPECTED_EN_URLS, ...EXPECTED_AR_URLS, ...EXPECTED_FR_URLS];

function getLocUrls() {
  return [...doc.getElementsByTagName('loc')].map((node) => node.textContent);
}

describe('sitemap.xml — structure', () => {
  it('parses as well-formed XML with no parser errors', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('has a single <urlset> root with the correct sitemap namespace', () => {
    const urlsets = doc.getElementsByTagName('urlset');
    expect(urlsets).toHaveLength(1);
    expect(urlsets[0].getAttribute('xmlns')).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
  });

  it('every <url> has exactly one <loc> that is an absolute al-rahmaacademy.com URL', () => {
    const urls = doc.getElementsByTagName('url');
    expect(urls.length).toBeGreaterThan(0);
    for (const url of [...urls]) {
      const locs = url.getElementsByTagName('loc');
      expect(locs).toHaveLength(1);
      expect(locs[0].textContent.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });
});

describe('sitemap.xml — exact 87-URL published-routes whitelist', () => {
  it('contains exactly 87 <loc> entries', () => {
    expect(getLocUrls()).toHaveLength(87);
  });

  it('splits into exactly 29 EN, 29 AR and 29 FR URLs', () => {
    const locs = getLocUrls();
    const arUrls = locs.filter((u) => u.startsWith(`${ORIGIN}/ar/`) || u === `${ORIGIN}/ar`);
    const frUrls = locs.filter((u) => u.startsWith(`${ORIGIN}/fr/`) || u === `${ORIGIN}/fr`);
    const enUrls = locs.filter((u) => !arUrls.includes(u) && !frUrls.includes(u));
    expect(enUrls).toHaveLength(29);
    expect(arUrls).toHaveLength(29);
    expect(frUrls).toHaveLength(29);
  });

  it('has no duplicate URLs', () => {
    const locs = getLocUrls();
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('matches the exact literal 87-URL whitelist, with nothing extra and nothing missing', () => {
    const locs = getLocUrls();
    expect([...locs].sort()).toEqual([...EXPECTED_URLS].sort());
  });

  it('does not contain /it/, /es/, /de/, /enroll, the remaining individual tools, Blog, Islamic Studies, or any other unpublished route', () => {
    const locs = getLocUrls();
    for (const forbidden of [
      '/it/',
      '/es/',
      '/de/',
      '/enroll',
      '/resources/blog',
      '/courses/islamic-studies',
      '/tools/quran-reader',
      '/tools/hadith',
      '/tools/prayer-times',
      '/tools/qibla',
      '/tools/islamic-calendar',
      '/tools/verse-of-the-day',
      '/tools/tajweed-checker',
      '/tools/hifz-review',
    ]) {
      expect(locs.some((u) => u.includes(forbidden))).toBe(false);
    }
    // Belt-and-suspenders: every URL must be one of the 87 whitelisted ones.
    for (const loc of locs) {
      expect(EXPECTED_URLS).toContain(loc);
    }
  });
});

describe('sitemap.xml — stays in sync with PRERENDER_MANIFEST', () => {
  it('contains exactly the canonical URLs of every "published" manifest entry, and nothing else', () => {
    const locs = getLocUrls();
    const publishedCanonicals = PRERENDER_MANIFEST.filter((entry) => entry.status === 'published').map(
      canonicalUrlFor,
    );

    expect([...locs].sort()).toEqual([...publishedCanonicals].sort());
  });
});
