/**
 * Shared URL/hreflang math for the prerender pipeline (scripts/prerender.mjs)
 * and the sitemap generator (scripts/gen-sitemap.mjs), so the two can never
 * drift into disagreeing about what a given {route, lang} pair's real URL or
 * hreflang set is. Pure Node ESM — no browser globals, no JSX.
 */
import translations, { LANGS } from '../src/i18n/index.js';

export { LANGS };

export const ORIGIN = 'https://al-rahmaacademy.com';

// Routes that stay in seoRoutes.mjs (real, indexable, in the sitemap) but
// are excluded from prerender.mjs's headless-capture matrix specifically.
// /tools/verse-of-the-day fetches a live "today's verse" from api.quran.com
// on mount — freezing that into a static prerendered file would show every
// future visitor the verse from the day this build ran, not the real day's
// verse, until the next deploy. It keeps shipping today's normal SPA-shell
// behavior instead (client-fetches the correct verse on load), so it's
// never wrong, just not pre-rendered.
export const PRERENDER_EXCLUDED_ROUTES = new Set(['/tools/verse-of-the-day']);

// English is unprefixed (matches the pre-existing convention already live in
// production for '/'); the other five languages get a /{lang} path prefix so
// each has its own real, self-canonical, indexable URL — the fix this phase
// makes for ar/es/de, which previously had no indexable URL at all (only
// ?lang= query-param switching, which useSEO.js's path-only canonical can
// never treat as self-canonical).
export function pathFor(route, lang) {
  if (lang === 'en') return route;
  return route === '/' ? `/${lang}/` : `/${lang}${route}`;
}

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
