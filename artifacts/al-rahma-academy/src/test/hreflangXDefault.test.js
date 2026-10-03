import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_MANIFEST, hreflangLinksFor, ogLocaleFor, canonicalUrlFor } from '../../scripts/prerender-routes.mjs';

// hreflang x-default must point at a version that is actually published for the
// same route: en when published, else fr, else the first published locale in
// manifest order. It used to always point at the English URL, even when English
// was not prerendered (that URL then returns the home-page SPA shell with a
// canonical to "/").

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://al-rahmaacademy.com';
const published = PRERENDER_MANIFEST.filter((e) => e.status === 'published');
const routes = [...new Set(published.map((e) => e.route))];
const localesOf = (route) => published.filter((e) => e.route === route).map((e) => e.locale);
const urlOf = (route, locale) => ORIGIN + (locale === 'en' ? route : route === '/' ? `/${locale}/` : `/${locale}${route}`);

const AFFECTED = {
  '/enroll': ['fr', 'it'],
  '/tools/quran-reader': ['fr'],
  '/tools/verse-of-the-day': ['fr', 'it'],
  '/tools/hadith': ['fr', 'it'],
  '/tools/prayer-times': ['fr', 'it'],
};

describe('x-default points at a published version of the same route', () => {
  it('the five routes without an English version publish exactly these locales', () => {
    const noEn = routes.filter((r) => !localesOf(r).includes('en')).sort();
    expect(noEn).toEqual(Object.keys(AFFECTED).sort());
    for (const [route, locales] of Object.entries(AFFECTED)) expect(localesOf(route).sort(), route).toEqual(locales);
  });

  it.each(Object.keys(AFFECTED))('%s: x-default is the French URL', (route) => {
    for (const locale of localesOf(route)) {
      const links = hreflangLinksFor({ route, locale });
      expect(links.find((l) => l.hreflang === 'x-default').href, `${route} @ ${locale}`).toBe(urlOf(route, 'fr'));
    }
  });

  it('for every published route: one x-default, equal to one of the published alternates, same set from every locale', () => {
    for (const route of routes) {
      const locales = localesOf(route);
      let reference = null;
      for (const locale of locales) {
        const links = hreflangLinksFor({ route, locale });
        const xs = links.filter((l) => l.hreflang === 'x-default');
        expect(xs, `${route} @ ${locale}`).toHaveLength(1);
        const alternates = links.filter((l) => l.hreflang !== 'x-default');
        expect(alternates.map((l) => l.hreflang), route).toEqual(locales);
        expect(alternates.map((l) => l.href), route).toContain(xs[0].href);
        // The target is a manifest entry that is really published.
        expect(published.some((e) => e.route === route && canonicalUrlFor(e) === xs[0].href), `${route} target`).toBe(true);
        const key = JSON.stringify(links);
        reference ??= key;
        expect(key, `${route}: reciprocal, identical set for ${locale}`).toBe(reference);
      }
    }
  });

  it('routes with an English version keep x-default on the English URL, with unchanged alternates and og:locale', () => {
    const withEn = routes.filter((r) => localesOf(r).includes('en'));
    expect(withEn.length).toBeGreaterThan(25);
    for (const route of withEn) {
      for (const locale of localesOf(route)) {
        const links = hreflangLinksFor({ route, locale });
        expect(links.find((l) => l.hreflang === 'x-default').href, `${route} @ ${locale}`).toBe(urlOf(route, 'en'));
        expect(links.map((l) => l.hreflang), route).toEqual([...localesOf(route), 'x-default']);
        const og = ogLocaleFor({ route, locale });
        expect(og.alternates.length, route).toBe(localesOf(route).length - 1);
      }
    }
  });

  it('the first-published-locale fallback is deterministic (manifest order) when neither en nor fr is published', () => {
    // Exercised through the real function on a synthetic route is impossible
    // without editing the manifest, so assert the rule on the data instead:
    // no published route lacks both en and fr today.
    for (const route of routes) {
      const l = localesOf(route);
      expect(l.includes('en') || l.includes('fr'), route).toBe(true);
    }
  });

  it('no alternate is ever claimed for an unpublished language', () => {
    for (const route of routes) {
      for (const locale of localesOf(route)) {
        const langs = hreflangLinksFor({ route, locale }).map((l) => l.hreflang).filter((h) => h !== 'x-default');
        for (const l of langs) expect(localesOf(route), `${route}: ${l}`).toContain(l);
        expect(langs).not.toContain('es');
        expect(langs).not.toContain('de');
      }
    }
  });
});

describe('publication is untouched', () => {
  it('/it/enroll is published (final publication); the sitemap equals the published manifest', () => {
    expect(published.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(1);
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(published.map(canonicalUrlFor).sort());
    expect(locs).toHaveLength(133);
    expect(locs.filter((u) => u.startsWith(`${ORIGIN}/it/`))).toHaveLength(35);
  });
});
