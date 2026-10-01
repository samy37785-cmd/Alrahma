// SEO Prerender Pilot manifest (2026-09-20): the single list of which
// (route, locale) pairs are prerendered to static HTML after `vite build`.
// Deliberately tiny and explicit — no route is ever prerendered just
// because it exists in scripts/seoRoutes.mjs or has a locale directory
// under src/i18n/. Only en/ar/fr are "published" (see
// docs/localization-audit.md — it/es/de still have real, undocumented
// content gaps, not just missing routes, so they stay out entirely).
//
// French SEO Publication Gate (2026-09-30): fr joins every route that was
// already published for en+ar, once the "French Localization Batch
// 1A-1E" work (PRs already on main — main i18n dict at 952/952 key parity
// with en, all 11 teacher bios/titles/specialties, every legal page, every
// hub, every static tool page, CourseIjazah's isFr branching including its
// JSON-LD schema) gave every one of those routes real, already-reviewed
// French content — the exact precondition every prior en/ar wave above
// required before joining this manifest. No route is added here that
// wasn't already 'published' for en/ar; every other still-unpublished
// route (Blog, individual /tools/* pages, Enroll) stays out for the same
// pre-existing reasons those comments already give, regardless of French —
// this PR does not touch en/ar publication status or revisit those
// exclusions. (/courses/islamic-studies later joined in its own dedicated
// en+ar+fr wave — see the Islamic Studies SEO Publication Gate comment
// below — once its own real blocker, a build-time-frozen "Hadith of the
// Day", was fixed.)
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

  // Adhkar (2026-09-26): /tools/adhkar, en+ar. A read-only discovery pass
  // found the only real blocker was Adhkar.jsx mounting just the selected
  // category's cards (`filteredCats` defaulted to one category), so a
  // crawler's initial render only ever saw 1 of the 8 real categories (10
  // of the 49 real adhkar). fix/adhkar-initial-content (PR #117, already on
  // main) removed that blocker — every category's cards are now always in
  // the DOM, with only the non-selected ones hidden via the standard
  // `hidden` attribute, the same mechanism FAQ and static tools already
  // rely on. No fetch/date/geolocation/login; the `done`/`counts`
  // localStorage state only affects progress badges/classes, never the
  // recited Arabic text, translations, H1, or SEO metadata.
  { route: '/tools/adhkar', locale: 'en', status: 'published', indexable: true },
  { route: '/tools/adhkar', locale: 'ar', status: 'published', indexable: true },

  // French wave (2026-09-30, 29 pages): fr for every route already
  // published above for en/ar — see this file's top-of-manifest comment
  // for the content precondition and exclusions. Listed in the same order
  // as the en/ar blocks above for easy side-by-side review.
  { route: '/', locale: 'fr', status: 'published', indexable: true },
  { route: '/courses/ijazah', locale: 'fr', status: 'published', indexable: true },
  { route: '/courses', locale: 'fr', status: 'published', indexable: true },
  { route: '/courses/quran', locale: 'fr', status: 'published', indexable: true },
  { route: '/courses/arabic', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/about', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers', locale: 'fr', status: 'published', indexable: true },
  { route: '/resources', locale: 'fr', status: 'published', indexable: true },
  { route: '/tools', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/1', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/2', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/3', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/4', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/5', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/6', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/7', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/8', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/9', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/10', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/teachers/11', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/privacy', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/terms', locale: 'fr', status: 'published', indexable: true },
  { route: '/academy/refund-policy', locale: 'fr', status: 'published', indexable: true },
  { route: '/resources/faq', locale: 'fr', status: 'published', indexable: true },
  { route: '/tools/prayer', locale: 'fr', status: 'published', indexable: true },
  { route: '/tools/tasbeeh', locale: 'fr', status: 'published', indexable: true },
  { route: '/tools/arabic-alphabet', locale: 'fr', status: 'published', indexable: true },
  { route: '/tools/adhkar', locale: 'fr', status: 'published', indexable: true },

  // Islamic Studies SEO Publication Gate (2026-09-30): /courses/islamic-studies,
  // en+ar+fr, the first single-route wave to include fr from day one (every
  // prior wave started en+ar and added fr later as a separate pass). A
  // dedicated read-only readiness audit found the page fully content-complete
  // and religious-content-policy-compliant in all three locales already, with
  // exactly one real blocker: "Hadith of the Day" was chosen from
  // Date.now() during render, which this prerender step (a REAL headless
  // Chromium session, not a JS-free server render) would have baked into
  // the static file at whichever day the build ran on. CourseIslamicStudies.jsx
  // now starts that section as a locale-aware loading placeholder and only
  // ever resolves it to a real hadith client-side, gated on the absence of
  // navigator.webdriver (Playwright's own browser launch applies no stealth
  // args, so this script's own capture always sees the placeholder) — so the
  // static HTML this manifest entry produces is stable and hydration-safe
  // regardless of how long ago the site was last built.
  { route: '/courses/islamic-studies', locale: 'en', status: 'published', indexable: true },
  { route: '/courses/islamic-studies', locale: 'ar', status: 'published', indexable: true },
  { route: '/courses/islamic-studies', locale: 'fr', status: 'published', indexable: true },

  // Italian wave (28 pages): it for every route below that already has real,
  // reviewed Italian content. /courses/islamic-studies (it), Blog, Enroll and
  // every other /tools/* page stay out of scope. /courses/ijazah (it) joined
  // afterwards in its own wave — see the Italian Ijazah entry below.
  { route: '/', locale: 'it', status: 'published', indexable: true },
  { route: '/courses', locale: 'it', status: 'published', indexable: true },
  { route: '/courses/quran', locale: 'it', status: 'published', indexable: true },
  { route: '/courses/arabic', locale: 'it', status: 'published', indexable: true },
  { route: '/academy', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/about', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/1', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/2', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/3', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/4', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/5', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/6', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/7', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/8', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/9', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/10', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/teachers/11', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/privacy', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/terms', locale: 'it', status: 'published', indexable: true },
  { route: '/academy/refund-policy', locale: 'it', status: 'published', indexable: true },
  { route: '/resources', locale: 'it', status: 'published', indexable: true },
  { route: '/resources/faq', locale: 'it', status: 'published', indexable: true },
  { route: '/tools', locale: 'it', status: 'published', indexable: true },
  { route: '/tools/prayer', locale: 'it', status: 'published', indexable: true },
  { route: '/tools/tasbeeh', locale: 'it', status: 'published', indexable: true },
  { route: '/tools/arabic-alphabet', locale: 'it', status: 'published', indexable: true },
  { route: '/tools/adhkar', locale: 'it', status: 'published', indexable: true },

  // Italian Ijazah SEO Publication (2026-09-30): /courses/ijazah, it, joined
  // once its real Italian content landed on main (PR #158: hero, stats,
  // lists, stage points, SEO metadata and Course JSON-LD text; religious
  // source material — titles, authors, publisher, Arabic, terms — kept in
  // source form, book descriptions/topics the literal English source, same
  // as French). The page has no fetch/date/geolocation/localStorage
  // dependency at initial render, so it prerenders like its en/ar/fr
  // siblings. /courses/islamic-studies stays unpublished in Italian.
  { route: '/courses/ijazah', locale: 'it', status: 'published', indexable: true },

  // Italian Tajweed Checker SEO Publication (2026-09-30): /tools/tajweed-checker,
  // it, once its shell text (title, description, breadcrumb, hero, buttons,
  // status/error messages, feedback) got real Italian copy. Same prerender
  // safety as en/ar/fr: the SpeechRecognition mic only ever starts on a
  // user's own click and prerender.mjs never clicks, so no transcript, score,
  // listening state or device permission can reach the static HTML. Quran
  // text, transliteration and the English gloss are untouched. Islamic
  // Studies stays unpublished in Italian.
  { route: '/tools/tajweed-checker', locale: 'it', status: 'published', indexable: true },

  // Tajweed Checker SEO Publication Gate (2026-09-30): /tools/tajweed-checker,
  // en+ar+fr all at once. A dedicated read-only readiness audit found no real
  // blocker at all -- no fetch/geolocation/localStorage/session, and no
  // Date.now() or other auto-running per-visit computation affecting initial
  // render (unlike the Hadith-of-the-Day case above). The SpeechRecognition
  // mic feature only ever starts on a user's own onClick; prerender.mjs never
  // clicks anything, so transcript/score/listening state stays at its neutral
  // initial value for the entire capture, every time -- nothing to freeze.
  // French UI text was already complete (French Localization Batch 1E); the
  // verse's English translation gloss is unconditionally shown on en+fr and
  // hidden on ar by existing, already-reviewed policy (same "don't invent an
  // unlicensed French translation of Quran text" rule CourseIslamicStudies.jsx
  // follows for Hadith) -- untouched here. Absence from every earlier wave
  // was a real gap, not a documented technical exclusion (confirmed: no
  // prior mention of tajweed-checker anywhere in this file).
  { route: '/tools/tajweed-checker', locale: 'en', status: 'published', indexable: true },
  { route: '/tools/tajweed-checker', locale: 'ar', status: 'published', indexable: true },
  { route: '/tools/tajweed-checker', locale: 'fr', status: 'published', indexable: true },
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

// Every locale actually 'published' for one exact route, e.g. ['en','ar']
// or ['en','ar','fr'] — never a fixed/hardcoded set, so hreflang and
// og:locale automatically stay in sync with PRERENDER_MANIFEST as routes
// gain (or lose) a published locale, with no second list to keep in sync.
function publishedLocalesForRoute(route) {
  return PRERENDER_MANIFEST.filter((e) => e.route === route && e.status === 'published').map((e) => e.locale);
}

// The hreflang alternates a prerendered page must carry: one per locale
// actually published for this exact route (reciprocal — every locale
// version of a route shares this same set, since it depends only on
// entry.route, not entry.locale), plus x-default pointing at the English
// version (the established convention already used in index.html's own
// static block). A locale never appears here unless PRERENDER_MANIFEST has
// a real 'published' entry for that (route, locale) pair — no alternate is
// ever claimed for a page that has no real HTML behind it.
export function hreflangLinksFor(entry) {
  const enHref = ORIGIN + pathFor(entry.route, 'en');
  const links = publishedLocalesForRoute(entry.route).map((locale) => ({
    hreflang: locale,
    href: ORIGIN + pathFor(entry.route, locale),
  }));
  links.push({ hreflang: 'x-default', href: enHref });
  return links;
}

// Open Graph locale tags per locale this pilot ever publishes. Kept as an
// explicit map (not derived from src/i18n's LANGS) so adding a new
// unpublished i18n locale file never silently changes prerendered og:locale
// output — only a real PRERENDER_MANIFEST entry can do that, same guarantee
// hreflangLinksFor already gives.
const OG_LOCALE_BY_LANG = { en: 'en_GB', ar: 'ar_EG', fr: 'fr_FR', it: 'it_IT' };

// The self og:locale plus every reciprocal og:locale:alternate for one
// prerendered page — same "only real published (route, locale) pairs"
// guarantee as hreflangLinksFor, and depends on entry.locale (unlike
// hreflangLinksFor) since og:locale has no separate x-default concept.
export function ogLocaleFor(entry) {
  const others = publishedLocalesForRoute(entry.route).filter((locale) => locale !== entry.locale);
  return {
    primary: OG_LOCALE_BY_LANG[entry.locale],
    alternates: others.map((locale) => OG_LOCALE_BY_LANG[locale]),
  };
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
