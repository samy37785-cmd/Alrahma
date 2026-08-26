/**
 * Shared URL/hreflang math for the prerender pipeline (scripts/prerender.mjs)
 * and the sitemap generator (scripts/gen-sitemap.mjs), so the two can never
 * drift into disagreeing about what a given {route, lang} pair's real URL or
 * hreflang set is. Pure Node ESM — no browser globals, no JSX.
 */
import { LANGS } from '../src/i18n/index.js';
import { pathFor, ORIGIN, urlFor, hreflangSetFor } from '../src/utils/localePath.js';

export { LANGS, ORIGIN, urlFor, hreflangSetFor };

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

// urlFor/hreflangSetFor now live in src/utils/localePath.js (re-exported
// above) so useSEO.js can compute the identical runtime hreflang set React
// itself renders — this file used to define its own copies, which is how a
// prior version of the app shipped hreflang that only ever got set at build
// time and went stale after a client-side navigation.

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
