/**
 * Auto-generate public/sitemap.xml from a single source of truth: the
 * `seoRoutes` list in scripts/seoRoutes.mjs (the public, indexable routes)
 * crossed with every supported language (scripts/prerender-seo-tags.mjs).
 * Runs as the npm `prebuild` hook, so every deploy ships a complete, current
 * sitemap with no manual editing. Auth/admin routes are never in seoRoutes,
 * so they are never sitemapped (and robots.txt blocks them too).
 *
 * One <url> block per {route, lang} pair (seoRoutes.length × LANGS.length),
 * each carrying the full reciprocal hreflang set via <xhtml:link> — per
 * Google's sitemap-hreflang convention, alternates must be annotated on
 * every language variant's own entry, not just once on a single "canonical"
 * entry. urlFor/hreflangSetFor
 * come from prerender-seo-tags.mjs, the same module scripts/prerender.mjs
 * uses to decide what URL each prerendered file actually gets, so the
 * sitemap and the prerendered output can't drift apart.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seoRoutes as routes } from './seoRoutes.mjs';
import { LANGS, urlFor, hreflangSetFor } from './prerender-seo-tags.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const priorityFor = (p) => {
  if (p === '/') return '1.0';
  if (p.startsWith('/courses')) return '0.9';
  if (p.startsWith('/tools')) return '0.85';
  if (p.startsWith('/academy')) return '0.8';
  if (p.startsWith('/resources')) return '0.8';
  if (p.startsWith('/blog/')) return '0.6';
  return '0.8';
};
const changefreqFor = (p) => (p === '/' ? 'weekly' : 'monthly');

// No <lastmod> is emitted: there is no real per-route last-modified source
// in this codebase (no file-mtime tracking, no CMS timestamp for static
// routes), and a build-time "today" on every URL is worse than omitting the
// tag — Google explicitly discounts a lastmod it can't verify as accurate.
// Reintroduce per-URL once a real source exists (e.g. Blog posts' updatedAt).
const body = routes
  .flatMap((route) =>
    LANGS.map((lang) => {
      const loc = urlFor(route, lang);
      const alternates = hreflangSetFor(route)
        .map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`)
        .join('\n');
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <changefreq>${changefreqFor(route)}</changefreq>`,
        `    <priority>${priorityFor(route)}</priority>`,
        alternates,
        '  </url>',
      ].join('\n');
    }),
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;

writeFileSync(join(root, 'public', 'sitemap.xml'), xml, 'utf8');
console.log(`[sitemap] generated ${routes.length * LANGS.length} URLs (${routes.length} routes × ${LANGS.length} languages) → public/sitemap.xml`);
