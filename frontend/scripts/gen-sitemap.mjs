/**
 * Auto-generate public/sitemap.xml from a single source of truth: the
 * react-snap `include` list in package.json (the public, prerendered routes).
 * Runs as the npm `prebuild` hook, so every deploy ships a complete, current
 * sitemap with no manual editing. Auth/admin routes are never in the include
 * list, so they are never sitemapped (and robots.txt blocks them too).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const ORIGIN = 'https://al-rahmaacademy.com';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const routes = pkg.reactSnap?.include ?? ['/'];

// Standalone static language landing pages that live in public/{it,fr}/ and
// are not React routes, so they aren't in the react-snap include list.
const extraStatic = ['/it/', '/fr/'];

const paths = [...new Set([...routes, ...extraStatic])];
const today = new Date().toISOString().slice(0, 10);

const priorityFor = (p) => {
  if (p === '/') return '1.0';
  if (p.startsWith('/course')) return '0.9';
  if (p.startsWith('/blog/')) return '0.6';
  return '0.8';
};
const changefreqFor = (p) => (p === '/' ? 'weekly' : 'monthly');

const body = paths
  .map((p) => {
    const loc = p === '/' ? `${ORIGIN}/` : `${ORIGIN}${p}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
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
