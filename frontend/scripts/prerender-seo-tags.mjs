/**
 * Shared URL/hreflang math for the prerender pipeline (scripts/prerender.mjs)
 * and the sitemap generator (scripts/gen-sitemap.mjs), so the two can never
 * drift into disagreeing about what a given {route, lang} pair's real URL or
 * hreflang set is. Pure Node ESM — no browser globals, no JSX.
 */
import translations, { LANGS } from '../src/i18n/index.js';
import { pathFor } from '../src/utils/localePath.js';

export { LANGS };

export const ORIGIN = 'https://al-rahmaacademy.com';

// Routes that would stay in seoRoutes.mjs (real, indexable, in the sitemap)
// but get excluded from prerender.mjs's headless-capture matrix specifically
// — for content that's genuinely time-varying enough that freezing one
// capture-time snapshot into the static file would misrepresent the page
// (e.g. a "today's X" feature) *and* has no reasonable stable placeholder.
// Currently empty: /tools/verse-of-the-day used to be excluded outright, but
// that left it with no prerendered file at all — Vercel's SPA catch-all then
// served it dist/index.html, which is now the real prerendered *homepage*
// (wrong title/canonical/JSON-LD for that URL, not a neutral shell). It's
// prerendered like every other route now; prerender.mjs blocks its one
// live verse-fetch during capture instead, so the written file gets the
// page's real, correct chrome without baking in a specific day's verse.
export const PRERENDER_EXCLUDED_ROUTES = new Set();

// pathFor itself now lives in src/utils/localePath.js — the same module
// LangContext/BrowserRouter's basename/LangSwitcher use at runtime — so the
// build-time URL scheme and the live router's URL scheme are structurally
// the same code, not two independent implementations that happen to agree.
export { pathFor };

export function urlFor(route, lang) {
  return ORIGIN + pathFor(route, lang);
}

// The 6-language + x-default hreflang set for one route. Backs both the
// in-page <link rel=alternate> injection (prerender.mjs) and the sitemap's
// <xhtml:link> children (gen-sitemap.mjs) — one function, so reciprocity is
// structural rather than something two separate scripts have to agree on by
// convention.
export function hreflangSetFor(route) {
  const entries = LANGS.map((lang) => ({ hreflang: lang, href: urlFor(route, lang) }));
  entries.push({ hreflang: 'x-default', href: urlFor(route, 'en') });
  return entries;
}

// Mirrors LangContext.jsx's own dir-attribute logic exactly (translations[lang]?.dir
// || 'ltr') rather than hardcoding a lang→dir map, so the prerendered output can
// never disagree with what the live client-rendered app actually does.
export function dirFor(lang) {
  return translations[lang]?.dir || 'ltr';
}

// Filesystem output path (relative to dist/) for a given {route, lang} pair.
// Mirrors pathFor's URL shape: home becomes an index.html directly under the
// language prefix, everything else nests one directory per path segment.
export function outputRelPathFor(route, lang) {
  const p = pathFor(route, lang);
  if (p === '/' || p === `/${lang}/`) {
    return lang === 'en' ? 'index.html' : `${lang}/index.html`;
  }
  return `${p.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}
