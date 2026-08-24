/**
 * Verifies scripts/prerender.mjs's output in dist/ is real, correct
 * prerendered HTML — not the bare SPA shell, and not silently missing a
 * route/language. Runs after `npm run build` (which already ran prebuild →
 * vite build → postbuild prerender). No browser, no backend — just parses
 * the written files with jsdom (already a frontend devDependency) and
 * checks their <head>/<body> content directly. Wired into CI as a step in
 * the existing, already-blocking `frontend` job (no new service deps).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { seoRoutes } from './seoRoutes.mjs';
import { LANGS, urlFor, outputRelPathFor, PRERENDER_EXCLUDED_ROUTES } from './prerender-seo-tags.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const pairs = [];
for (const route of seoRoutes) {
  if (PRERENDER_EXCLUDED_ROUTES.has(route)) continue;
  for (const lang of LANGS) pairs.push({ route, lang });
}

const errors = [];

// Pass 1: parse every file once, collect its hreflang links, so pass 2 can
// check reciprocity against a complete map rather than trusting each file's
// own claims in isolation (a partial/failed write is exactly what this
// two-pass structure is meant to catch).
const parsed = new Map(); // key: `${lang} ${route}` -> { dom, hreflangHrefs }
for (const { route, lang } of pairs) {
  const relPath = outputRelPathFor(route, lang);
  const absPath = join(distDir, relPath);
  const key = `${lang} ${route}`;
  if (!existsSync(absPath)) {
    errors.push(`MISSING: ${key} → expected dist/${relPath}`);
    continue;
  }
  const html = readFileSync(absPath, 'utf8');
  const dom = new JSDOM(html);
  parsed.set(key, { dom, relPath });
}

for (const [key, { dom }] of parsed) {
  const { document } = dom.window;
  const [lang, ...routeParts] = key.split(' ');
  const route = routeParts.join(' ');

  const title = document.title?.trim();
  if (!title) errors.push(`${key}: missing <title>`);

  const canonical = document.querySelector('link[rel="canonical"]');
  const expectedUrl = urlFor(route, lang);
  if (!canonical) {
    errors.push(`${key}: missing <link rel="canonical">`);
  } else if (canonical.href !== expectedUrl) {
    errors.push(`${key}: canonical is "${canonical.href}", expected "${expectedUrl}"`);
  }

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      JSON.parse(script.textContent);
    } catch {
      errors.push(`${key}: unparseable JSON-LD in <script data-seo="${script.getAttribute('data-seo') || ''}">`);
    }
  }

  const hreflangLinks = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
  const expectedCount = LANGS.length + 1; // + x-default
  if (hreflangLinks.length !== expectedCount) {
    errors.push(`${key}: expected ${expectedCount} hreflang links, found ${hreflangLinks.length}`);
  }
  for (const link of hreflangLinks) {
    const hl = link.getAttribute('hreflang');
    const targetLang = hl === 'x-default' ? 'en' : hl;
    if (!LANGS.includes(targetLang)) continue;
    const expectedHref = urlFor(route, targetLang);
    if (link.href !== expectedHref) {
      errors.push(`${key}: hreflang="${hl}" href is "${link.href}", expected "${expectedHref}"`);
    }
  }

  if (document.getElementById('app-loading')) {
    errors.push(`${key}: #app-loading still present — capture likely happened before React replaced the static shell`);
  }
  const bodyText = document.body?.textContent?.trim() || '';
  if (bodyText.length < 200) {
    errors.push(`${key}: body text is only ${bodyText.length} chars — looks like an empty shell, not real content`);
  }
}

if (errors.length > 0) {
  console.error(`[verify-prerender] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`[verify-prerender] OK — ${parsed.size}/${pairs.length} prerendered files verified.`);
