// Single source of truth for the app's language-prefix URL scheme: English
// is unprefixed, every other language gets a leading /{lang} segment (e.g.
// /fr/courses/ijazah). Used both by the live SPA (BrowserRouter's basename,
// LangContext, LangSwitcher, breadcrumbs, route prefetching) and mirrored by
// frontend/scripts/prerender-seo-tags.mjs for the build-time prerender/sitemap
// pipeline — the two must never drift, since the router's basename is what
// makes a prerendered /fr/... file actually render instead of 404ing.
// Explicit /index.js: this module is imported both by Vite-bundled browser
// code (where a directory import resolves fine) and directly by plain Node
// ESM in frontend/scripts/prerender-seo-tags.mjs, which requires the
// extension and can't resolve a bare directory import.
import { LANGS } from '../i18n/index.js';

const PREFIXED_LANGS = LANGS.filter((l) => l !== 'en');

export const ORIGIN = 'https://al-rahmaacademy.com';

// Open Graph locale codes per language — used by useSEO.js at runtime and by
// prerender.mjs to keep the static-file default (index.html's og:locale) and
// the live/prerendered per-language value from ever disagreeing.
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

// The 6-language + x-default hreflang set for one route. Backs both the
// in-page <link rel=alternate> injection (useSEO.js at runtime, prerender.mjs
// at build time) and the sitemap's <xhtml:link> children (gen-sitemap.mjs) —
// one function, so reciprocity is structural rather than three separate
// places that happen to agree by convention.
export function hreflangSetFor(route) {
  const entries = LANGS.map((lang) => ({ hreflang: lang, href: urlFor(route, lang) }));
  entries.push({ hreflang: 'x-default', href: urlFor(route, 'en') });
  return entries;
}

// The URL to navigate to when going "home" from anywhere, optionally with a
// same-page hash (e.g. "#trial"). Exists because a literal `to="/"` or
// `to="/#trial"` on a react-router <Link> resolves to a pathname of exactly
// "/", which react-router's useHref/useResolvedPath special-cases: it sets
// the joined path to the raw basename with no separator, skipping the
// joinPaths() call every other route goes through. Under a language prefix
// that produces "/fr#trial" instead of the canonical "/fr/#trial" — a real,
// confirmed bug (any other route is unaffected, since joinPaths only skips
// for this exact "/" case). Reads the current language from the URL itself
// so callers never need to thread lang through — same self-contained
// pattern as switchLanguageHref reading window.location directly.
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
// strips a legacy ?lang= param (naively concatenating `search` would produce
// a self-contradictory /fr/page?lang=de) and preserves the hash, which a
// direct string-concat approach previously dropped (e.g. #hifz, #trial).
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
