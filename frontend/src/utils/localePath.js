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
export function switchLanguageHref(pathname, search, lang) {
  return pathFor(stripLangPrefix(pathname), lang) + (search || '');
}
