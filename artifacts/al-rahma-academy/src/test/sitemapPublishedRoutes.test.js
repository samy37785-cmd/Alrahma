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
//
// Islamic Studies SEO Publication Gate (2026-09-30): /courses/islamic-studies
// joined as a 30th route, en+ar+fr all at once, once a dedicated readiness
// audit confirmed its content was already complete and policy-compliant in
// all three locales and CourseIslamicStudies.jsx's "Hadith of the Day" no
// longer freezes a Date.now()-computed value into the prerendered file (see
// scripts/prerender-routes.mjs's own comment on this entry).
//
// Tajweed Checker SEO Publication Gate (2026-09-30): /tools/tajweed-checker
// joined as a 31st route, en+ar+fr all at once, once a dedicated readiness
// audit found no real blocker at all — no fetch/geolocation/localStorage/
// session/Date.now() affecting initial render, and the SpeechRecognition mic
// flow only ever starts on a real user's own click, never during prerender's
// own automated page load (see scripts/prerender-routes.mjs's own comment).
const ROUTES = [
  '/',
  '/courses',
  '/courses/quran',
  '/courses/arabic',
  '/courses/ijazah',
  '/courses/islamic-studies',
  '/academy',
  '/academy/about',
  '/academy/teachers',
  '/resources',
  '/tools',
  '/tools/tajweed-checker',
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

// French SEO Publication Wave (2026-09-30): these 5 routes join the
// sitemap for fr ONLY — never en/ar/it, per scripts/prerender-routes.mjs's
// own comment on this exact wave. A separate list from ROUTES above (which
// is always published in 3 locales, soon to be joined by a 4th for some
// entries) rather than folding these into it with a per-route locale
// exception, so a future en/ar publication of any one of them is a plain
// addition to ROUTES instead of first having to be un-excepted here.
const FR_ONLY_ROUTES = [
  '/tools/verse-of-the-day',
  '/tools/quran-reader',
  '/tools/hadith',
  '/tools/prayer-times',
  '/enroll',
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
// French SEO Publication Wave (2026-09-30): FR_ONLY_ROUTES' 5 routes are
// appended here, fr-only — this is the one and only place they affect the
// expected URL set at all; EXPECTED_EN_URLS/EXPECTED_AR_URLS/
// EXPECTED_IT_URLS above and below are deliberately untouched.
const EXPECTED_FR_URLS = [...ROUTES, ...FR_ONLY_ROUTES].map((route) => ORIGIN + pathForLocale(route, 'fr'));
// Italian SEO waves: it now publishes every route above (the Ijazah, Tajweed
// Checker and Islamic Studies waves each joined after the main Italian wave),
// so nothing is excluded here; routes outside this list (Blog, Enroll, the
// remaining individual tools) stay out via the forbidden-route test below.
const IT_EXCLUDED_ROUTES = [];
const IT_ROUTES = ROUTES.filter((route) => !IT_EXCLUDED_ROUTES.includes(route));
const EXPECTED_IT_URLS = IT_ROUTES.map((route) => ORIGIN + pathForLocale(route, 'it'));
const EXPECTED_URLS = [...EXPECTED_EN_URLS, ...EXPECTED_AR_URLS, ...EXPECTED_FR_URLS, ...EXPECTED_IT_URLS];

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

describe('sitemap.xml — exact published-routes whitelist', () => {
  it('contains exactly the whitelisted <loc> entries (count derived, not hardcoded)', () => {
    expect(getLocUrls()).toHaveLength(EXPECTED_URLS.length);
  });

  it('splits into exactly 31 EN, 31 AR, 36 FR and 31 IT URLs', () => {
    const locs = getLocUrls();
    const byPrefix = (l) => locs.filter((u) => u.startsWith(`${ORIGIN}/${l}/`) || u === `${ORIGIN}/${l}`);
    const arUrls = byPrefix('ar');
    const frUrls = byPrefix('fr');
    const itUrls = byPrefix('it');
    const enUrls = locs.filter((u) => !arUrls.includes(u) && !frUrls.includes(u) && !itUrls.includes(u));
    expect(enUrls).toHaveLength(EXPECTED_EN_URLS.length);
    expect(arUrls).toHaveLength(EXPECTED_AR_URLS.length);
    expect(frUrls).toHaveLength(EXPECTED_FR_URLS.length);
    expect(itUrls).toHaveLength(EXPECTED_IT_URLS.length);
    expect(enUrls).toHaveLength(31);
    expect(arUrls).toHaveLength(31);
    // French SEO Publication Wave (2026-09-30): 31 (the pre-existing French
    // wave, same route set as EN/AR) + 5 fr-only routes (FR_ONLY_ROUTES).
    expect(frUrls).toHaveLength(36);
    // Italian Islamic Studies SEO Publication (2026-09-30, concurrent PR):
    // it now publishes every route in ROUTES, IT_EXCLUDED_ROUTES is empty.
    expect(itUrls).toHaveLength(31);
  });

  it('has no duplicate URLs', () => {
    const locs = getLocUrls();
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('matches the exact literal whitelist, with nothing extra and nothing missing', () => {
    const locs = getLocUrls();
    expect([...locs].sort()).toEqual([...EXPECTED_URLS].sort());
  });

  it('does not contain /es/, /de/, the remaining individual tools, Blog, or any other unpublished route', () => {
    const locs = getLocUrls();
    for (const forbidden of [
      '/es/',
      '/de/',
      '/resources/blog',
      '/tools/qibla',
      '/tools/islamic-calendar',
      '/tools/hifz-review',
    ]) {
      expect(locs.some((u) => u.includes(forbidden))).toBe(false);
    }
    // Belt-and-suspenders: every URL must be one of the whitelisted ones.
    for (const loc of locs) {
      expect(EXPECTED_URLS).toContain(loc);
    }
  });

  // French SEO Publication Wave (2026-09-30): FR_ONLY_ROUTES must appear
  // for /fr/ ONLY — never en (unprefixed), /ar/ or /it/, since none of
  // those locales have a real published PRERENDER_MANIFEST entry for any
  // of these 5 routes (see scripts/prerender-routes.mjs's own comment on
  // this exact wave for why: en/ar/it publication of these routes is a
  // separate, un-revisited decision).
  it('publishes verse-of-the-day, quran-reader, hadith, prayer-times and enroll for /fr/ only, never en/ar/it', () => {
    const locs = getLocUrls();
    for (const route of FR_ONLY_ROUTES) {
      expect(locs).toContain(`${ORIGIN}/fr${route}`);
      expect(locs).not.toContain(`${ORIGIN}${route}`);
      expect(locs).not.toContain(`${ORIGIN}/ar${route}`);
      expect(locs).not.toContain(`${ORIGIN}/it${route}`);
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
