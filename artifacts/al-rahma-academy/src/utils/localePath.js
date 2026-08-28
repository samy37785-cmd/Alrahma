// Single source of truth for the app's language-prefix URL scheme: English
// is unprefixed, every other language gets a leading /{lang} segment (e.g.
// /fr/courses/ijazah). Used both by the live SPA (BrowserRouter's basename,
// LangContext, LangSwitcher, breadcrumbs, route prefetching) and, in a
// future stage, by the build-time prerender/sitemap pipeline — the two must
// never drift, since the router's basename is what makes a prerendered
// /fr/... file actually render instead of 404ing.
//
// Ported from the feat/seo-prerendering-phase2 branch (frontend/src/utils/localePath.js),
// where this exact model was built, broken, fixed, and verified live in a
// browser against a real deployment. Kept intentionally unchanged except for
// the two "not yet true here" pieces called out below — see
// docs/localization-audit.md Priority 1 and the plan history for why.
//
// Explicit /index.js: this module is imported both by Vite-bundled browser
// code (where a directory import resolves fine) and, in a later stage, by
// plain Node ESM prerender/sitemap scripts, which require the extension and
// can't resolve a bare directory import.
import { LANGS } from '../i18n/index.js';

const PREFIXED_LANGS = LANGS.filter((l) => l !== 'en');

export const ORIGIN = 'https://al-rahmaacademy.com';

// Open Graph locale codes per language — not yet consumed anywhere in this
// app (useSEO.js here doesn't set og:locale per-language yet, that's Stage
// 1b). Exported now so Stage 1b doesn't need to touch this file again.
export const OG_LOCALE_MAP = {
  en: 'en_GB',
  ar: 'ar_EG',
  it: 'it_IT',
  fr: 'fr_FR',
  de: 'de_DE',
  es: 'es_ES',
};

// Reads the leading path segment; returns the recognized language and the
// basename to hand to <BrowserRouter>, or { lang: null, basename: '' } when
// the URL is unprefixed (English, or not a recognized language segment at
// all — e.g. a plain 404 path falls through here too, which is correct).
export function langFromPath(pathname) {
  const seg = pathname.split('/').filter(Boolean)[0];
  if (seg && PREFIXED_LANGS.includes(seg)) {
    return { lang: seg, basename: `/${seg}` };
  }
  return { lang: null, basename: '' };
}

export function pathFor(route, lang) {
  if (lang === 'en') return route;
  return route === '/' ? `/${lang}/` : `/${lang}${route}`;
}

export function urlFor(route, lang) {
  return ORIGIN + pathFor(route, lang);
}

// The 6-language + x-default hreflang set for one route. Not yet consumed —
// useSEO.js doesn't inject <link rel=alternate hreflang> here yet (Stage 1b).
// Exported now so that stage is a pure useSEO.js/prerender change, not
// another pass through this file.
export function hreflangSetFor(route) {
  const entries = LANGS.map((lang) => ({ hreflang: lang, href: urlFor(route, lang) }));
  entries.push({ hreflang: 'x-default', href: urlFor(route, 'en') });
  return entries;
}

// The URL to navigate to when going "home" from anywhere, optionally with a
// same-page hash (e.g. "#trial"). Returns the full locale-prefixed path
// (e.g. "/fr/", "/fr/#trial", "/") — the canonical href for the home page
// in the current language.
//
// MUST be used with a raw `<a href={homeHref()}>`, NOT with
// `<Link to={homeHref()}>`. When a `<Link>` renders under a non-English
// `<BrowserRouter basename="/fr">`, react-router's useHref/useResolvedPath
// special-cases a literal "/" (skips joinPaths → "/fr" without trailing
// slash) and normal-joins "/fr/" → "/fr/fr/" (duplicate prefix, real 404).
// No value of `to` can produce the correct "/fr/" via `<Link>` under a
// basename — the only href that is both duplicate-free and
// trailing-slash-canonical is the raw `<a href>`, which bypasses the
// basename join entirely. This was verified live in a browser on the
// feat/seo-prerendering-phase2 branch before this fix existed there: two
// home links rendered as "/fr/fr/" and clicked to a 404.
// Reads the current language from the URL itself so callers never need to
// thread lang through — same self-contained pattern as switchLanguageHref.
export function homeHref(hash) {
  const { lang } = langFromPath(window.location.pathname);
  return pathFor('/', lang || 'en') + (hash ? `#${hash}` : '');
}

// Inverse of pathFor: given a full pathname (with or without a language
// prefix), returns the underlying route as react-router sees it once
// basename strips the prefix — i.e. what pathFor(route, 'en') would be.
export function stripLangPrefix(pathname) {
  const { basename } = langFromPath(pathname);
  if (!basename) return pathname;
  const stripped = pathname.slice(basename.length);
  return stripped === '' ? '/' : stripped;
}

// The URL to navigate to when switching language on the current page. A full
// navigation target (not a client-side route), because <BrowserRouter>'s
// basename is fixed at initial mount from whatever URL main.jsx first saw —
// only a fresh page load recomputes it for the new language.
//
// Persists the choice to localStorage right here rather than leaving it to
// each caller: every current (and realistically, future) call site does a
// full window.location.assign(...) immediately after computing this href,
// bypassing setLang()/React state entirely — without this, localStorage['lang']
// would go stale relative to the URL the visitor actually lands on. Also
// strips a legacy ?lang= param (this app used ?lang= as its whole URL model
// until this stage, so an old bookmarked/shared link may still carry one;
// naively concatenating `search` would produce a self-contradictory
// /fr/page?lang=de) and preserves the hash, which a direct string-concat
// approach would otherwise drop (e.g. #hifz, #trial).
export function switchLanguageHref(pathname, search, hash, lang) {
  try {
    localStorage.setItem('lang', lang);
  } catch {
    // Private browsing / storage disabled — navigation still works below.
  }
  const params = new URLSearchParams(search || '');
  params.delete('lang');
  const qs = params.toString();
  return pathFor(stripLangPrefix(pathname), lang) + (qs ? `?${qs}` : '') + (hash || '');
}
