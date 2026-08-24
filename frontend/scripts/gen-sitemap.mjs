/**
 * Auto-generate public/sitemap.xml from a single source of truth: the
 * `seoRoutes` list in scripts/seoRoutes.mjs (the public, indexable routes).
 * Runs as the npm `prebuild` hook, so every deploy ships a complete, current
 * sitemap with no manual editing. Auth/admin routes are never in that list,
 * so they are never sitemapped (and robots.txt blocks them too).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seoRoutes as routes } from './seoRoutes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const ORIGIN = 'https://al-rahmaacademy.com';

// Standalone static language landing pages that live in public/{it,fr}/ and
// are not React routes, so they aren't in seoRoutes.mjs's list.
const extraStatic = ['/it/', '/fr/'];

const paths = [...new Set([...routes, ...extraStatic])];

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
const body = paths
  .map((p) => {
    const loc = p === '/' ? `${ORIGIN}/` : `${ORIGIN}${p}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <changefreq>${changefreqFor(p)}</changefreq>`,
      `    <priority>${priorityFor(p)}</priority>`,
      '  </url>',
    ].join('\n');
  })
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

writeFileSync(join(root, 'public', 'sitemap.xml'), xml, 'utf8');
console.log(`[sitemap] generated ${paths.length} URLs → public/sitemap.xml`);
