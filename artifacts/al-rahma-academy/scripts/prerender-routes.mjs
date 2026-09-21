// SEO Prerender Pilot manifest (2026-09-20): the single list of which
// (route, locale) pairs are prerendered to static HTML after `vite build`.
// Deliberately tiny and explicit — no route is ever prerendered just
// because it exists in scripts/seoRoutes.mjs or has a locale directory
// under src/i18n/. Only en/ar are "published" for this pilot (see
// docs/localization-audit.md — it/es/de/fr have real, undocumented
// content gaps, not just missing routes, so they stay out entirely).
//
// No title/description/keywords here on purpose: those stay owned by
// each page's own useSEO() call (Home.jsx's pickHomeSeo(lang),
// CourseIjazah.jsx's inline isAr branch) so there is exactly one source
// of truth for page metadata. This manifest only says WHICH (route,
// locale) pairs get prerendered, never WHAT their content is.
// NOT imported from src/utils/localePath.js on purpose, despite that
// file's own comment inviting exactly this reuse: localePath.js imports
// LANGS from src/i18n/index.js, which imports every locale file
// (en.js/ar.js/it.js/es.js/de.js/fr.js) — and en.js imports
// src/data/siteFacts without a ".js" extension. Vite's bundler resolves
// that fine; plain `node scripts/prerender.mjs` (no bundler, this file's
// actual runtime) throws ERR_MODULE_NOT_FOUND on it. Fixing the missing
// extension is outside this PR's approved six-file scope (it lives in
// src/i18n/en.js), so this file instead imports only ORIGIN from the
// self-contained src/data/site.js (verified: zero relative imports of its
// own) and reimplements pathFor()'s exact three-line logic locally rather
// than pull in the whole i18n tree for one function.
import { site } from '../src/data/site.js';

const ORIGIN = site.origin;

function pathFor(route, lang) {
  if (lang === 'en') return route;
  return route === '/' ? `/${lang}/` : `/${lang}${route}`;
}

// Course hubs (2026-09-21): /courses, /courses/quran and /courses/arabic
// joined the pilot once fix/courses-ar-seo (PR #84) gave all three real,
// already-reviewed en/ar SEO metadata (src/i18n/courses/seo.js) — the same
// precondition Home and Ijazah already met. No new translation was written
// for this addition; it only prerenders content that already existed and
// was already reviewed. it/es/de/fr remain unpublished and out of scope,
// same as every entry above.
export const PRERENDER_MANIFEST = [
  { route: '/', locale: 'en', status: 'published', indexable: true },
  { route: '/', locale: 'ar', status: 'published', indexable: true },
  { route: '/courses/ijazah', locale: 'en', status: 'published', indexable: true },
  { route: '/courses/ijazah', locale: 'ar', status: 'published', indexable: true },
  { route: '/courses', locale: 'en', status: 'published', indexable: true },
  { route: '/courses', locale: 'ar', status: 'published', indexable: true },
  { route: '/courses/quran', locale: 'en', status: 'published', indexable: true },
  { route: '/courses/quran', locale: 'ar', status: 'published', indexable: true },
  { route: '/courses/arabic', locale: 'en', status: 'published', indexable: true },
  { route: '/courses/arabic', locale: 'ar', status: 'published', indexable: true },
];

// The URL path to navigate to for one manifest entry, e.g. "/ar/courses/ijazah".
export function urlPathFor(entry) {
  return pathFor(entry.route, entry.locale);
}

// The absolute canonical URL a prerendered page's <link rel="canonical">
// must equal. Shared by prerender.mjs's own readiness check and
// prerenderOutput.test.js's assertion, so the two can never independently
// drift on what "correct" means.
export function canonicalUrlFor(entry) {
  return ORIGIN + urlPathFor(entry);
}

// The exact 3 hreflang alternates a prerendered page must carry: en, ar,
// and x-default (pointing at the English version, the established
// convention already used in index.html's own static block). Depends only
// on entry.route, not entry.locale — the en and ar versions of the same
// route are reciprocal alternates of each other, so both locale entries
// for one route share this same set. No it/es/de/fr: this pilot only ever
// publishes en/ar (see PRERENDER_MANIFEST's own comment above), so those
// languages have no real alternate page to point to here.
export function hreflangLinksFor(entry) {
  const enHref = ORIGIN + pathFor(entry.route, 'en');
  const arHref = ORIGIN + pathFor(entry.route, 'ar');
  return [
    { hreflang: 'en', href: enHref },
    { hreflang: 'ar', href: arHref },
    { hreflang: 'x-default', href: enHref },
  ];
}

// Where prerender.mjs writes, and prerenderOutput.test.js reads, this
// entry's static HTML file, relative to the vite build's outDir
// (dist/public). A directory-style "<path>/index.html" so Vercel's
// static-file-first resolution (an exact file match always wins over the
// SPA catch-all rewrite in vercel.json) serves it for the directory URL
// with zero vercel.json changes.
export function outputRelPathFor(entry) {
  const p = urlPathFor(entry); // "/", "/ar/", "/courses/ijazah", "/ar/courses/ijazah"
  if (p === '/') return 'index.html';
  const trimmed = p.replace(/^\/+/, '').replace(/\/+$/, '');
  return `${trimmed}/index.html`;
}
