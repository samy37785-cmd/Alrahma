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

  // Academy trust pages (2026-09-22): /academy, /academy/about and
  // /academy/teachers joined the pilot once a read-only audit confirmed
  // all three are genuinely static (real, already-reviewed en/ar useSEO
  // metadata; no date/time, external API, geolocation, localStorage or
  // per-user state at initial render) — the same precondition every prior
  // wave met. /academy/teachers here is the LIST page only; the 11
  // individual /academy/teachers/:id profiles are a separate, deliberately
  // deferred product decision (no internal links point at them yet) and
  // are NOT part of this manifest. it/es/de/fr remain unpublished and out
  // of scope, same as every entry above.
  { route: '/academy', locale: 'en', status: 'published', indexable: true },
  { route: '/academy', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/about', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/about', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers', locale: 'ar', status: 'published', indexable: true },

  // Resources + Tools hubs (2026-09-22): the second wave, same audit
  // shape as the Academy wave above. Both are hub/aggregator pages only
  // (real, already-reviewed en/ar useSEO metadata; no date/time, external
  // API, geolocation, localStorage or per-user state at initial render).
  // /resources/blog, /resources/faq, and every individual /tools/* page
  // are NOT part of this manifest — each has its own real blocker (async
  // fetch, geolocation, localStorage, or date-dependent content) or is a
  // separate, deferred product decision, per the read-only audit this PR
  // implements. it/es/de/fr remain unpublished and out of scope, same as
  // every entry above.
  { route: '/resources', locale: 'en', status: 'published', indexable: true },
  { route: '/resources', locale: 'ar', status: 'published', indexable: true },
  { route: '/tools', locale: 'en', status: 'published', indexable: true },
  { route: '/tools', locale: 'ar', status: 'published', indexable: true },

  // Teacher profiles (Phase 3, 22 pages): all 11 teachers currently in
  // src/data/marketing/teachers.js's TEACHERS array (ids 1-11), en+ar.
  // Real, already-reviewed useSEO/Breadcrumbs metadata (PR #89
  // title/breadcrumb, PR #97 Arabic bio, PR #108 H1-by-locale); no
  // date/time, external API, geolocation, localStorage or per-user state
  // at initial render -- same precondition every prior wave met.
  // fix/teacher-profile-main-content (PR #109, already on main) is the
  // prerequisite this wave depends on: TeacherProfile.jsx's <main> now has
  // id="main-content", which prerender.mjs's waitForHydratedSeo() requires
  // of every prerendered page -- confirmed empirically to be the sole
  // blocker (a build attempt without that fix timed out on the very first
  // teacher entry).
  { route: '/academy/teachers/1', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/1', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/2', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/2', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/3', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/3', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/4', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/4', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/5', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/5', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/6', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/6', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/7', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/7', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/8', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/8', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/9', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/9', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/10', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/10', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/teachers/11', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/teachers/11', locale: 'ar', status: 'published', indexable: true },

  // Legal/policy pages (2026-09-26, 6 pages): Privacy, Terms and
  // Refund-policy, en+ar. A read-only SEO discovery pass found all three
  // fully static per-locale (Privacy.jsx/TermsOfService.jsx/
  // RefundPolicy.jsx), no date/time, external API, geolocation,
  // localStorage or per-user state at initial render -- same precondition
  // every prior wave met. fix/legal-page-main-landmarks (PR #112, already
  // on main) is the prerequisite this wave depends on: each page's <main>
  // now has id="main-content", which prerender.mjs's waitForHydratedSeo()
  // requires -- the same single blocker the Teacher profiles wave had
  // before PR #109. FAQ, Blog, tools and Islamic Studies remain
  // unpublished and out of scope, same as every entry above.
  { route: '/academy/privacy', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/privacy', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/terms', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/terms', locale: 'ar', status: 'published', indexable: true },
  { route: '/academy/refund-policy', locale: 'en', status: 'published', indexable: true },
  { route: '/academy/refund-policy', locale: 'ar', status: 'published', indexable: true },

  // FAQ (2026-09-26): /resources/faq joined the pilot once
  // fix/faq-render-initial-content (PR #114, already on main) removed the
  // only real blocker — every answer's text is now always in the DOM
  // (hidden via the standard `hidden` attribute when its question is
  // closed, never conditionally unmounted), so a crawler or prerendered
  // snapshot sees the real content instead of only the open question's
  // answer. Otherwise fully static per-locale (real, already-reviewed
  // en/ar useSEO metadata via faqItems.js; no date/time, external API,
  // geolocation, localStorage or per-user state at initial render) --
  // same precondition every prior wave met. Blog, tools and Islamic
  // Studies remain unpublished and out of scope, same as every entry
  // above.
  { route: '/resources/faq', locale: 'en', status: 'published', indexable: true },
  { route: '/resources/faq', locale: 'ar', status: 'published', indexable: true },

  // Static tools (2026-09-26, 3 pages): /tools/prayer, /tools/tasbeeh and
  // /tools/arabic-alphabet, en+ar. A read-only SEO discovery pass across
  // every remaining public route found these three genuinely static
  // per-locale (real, already-reviewed en/ar useSEO metadata; no
  // date/time, external API, geolocation, localStorage, or per-user state
  // affecting initial content) — IslamicTools.jsx (/tools/prayer) is a
  // static hub linking to 4 sub-tools; TasbeehPage.jsx's counter starts at
  // 0 deterministically and reads localStorage inside a try/catch that
  // safely falls back when unavailable; ArabicAlphabetPage.jsx has no
  // fetch/date/localStorage at all. Every other tool page was found
  // BLOCKED (fetch: quran-reader, hadith; geolocation: prayer-times,
  // qibla, islamic-calendar; date-dependent content: verse-of-the-day;
  // localStorage-dependent visible content: hifz-review) and stays out of
  // scope, same as Blog and Islamic Studies (date-dependent daily hadith)
  // and Enroll (known AR content gap).
  { route: '/tools/prayer', locale: 'en', status: 'published', indexable: true },
  { route: '/tools/prayer', locale: 'ar', status: 'published', indexable: true },
  { route: '/tools/tasbeeh', locale: 'en', status: 'published', indexable: true },
  { route: '/tools/tasbeeh', locale: 'ar', status: 'published', indexable: true },
  { route: '/tools/arabic-alphabet', locale: 'en', status: 'published', indexable: true },
  { route: '/tools/arabic-alphabet', locale: 'ar', status: 'published', indexable: true },
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
