import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seoRoutes } from '../../scripts/seoRoutes.mjs';

// Guardrail for scripts/gen-sitemap.mjs + scripts/seoRoutes.mjs: seoRoutes is
// the single source of truth for what's publicly indexable, and
// public/sitemap.xml is generated from it at build time (npm `prebuild`
// hook) — this locks in three things that have regressed before: real
// public pages missing from the list, fabricated blog-post URLs sneaking
// back in once posts don't exist, and a build-time lastmod that isn't real.

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemapPath = join(__dirname, '..', '..', 'public', 'sitemap.xml');
const sitemapXml = readFileSync(sitemapPath, 'utf8');
const ORIGIN = 'https://al-rahmaacademy.com';

describe('seoRoutes', () => {
  it('includes the Tajweed Checker and Hifz Review tool pages', () => {
    expect(seoRoutes).toContain('/tools/tajweed-checker');
    expect(seoRoutes).toContain('/tools/hifz-review');
  });

  it('never includes an individual /resources/blog/<slug> post URL', () => {
    const blogPostRoutes = seoRoutes.filter((p) => /^\/resources\/blog\/.+/.test(p));
    expect(blogPostRoutes).toEqual([]);
  });
});

describe('vercel.json redirects', () => {
  const vercelJsonPath = join(__dirname, '..', '..', '..', 'vercel.json');
  const vercelConfig = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));

  it('every redirect preserves query parameters', () => {
    const withoutFlag = vercelConfig.redirects.filter((r) => r.preserveQueryParams !== true);
    expect(withoutFlag).toEqual([]);
  });
});

describe('public/sitemap.xml (generated from seoRoutes)', () => {
  it('contains a <loc> for every route in seoRoutes', () => {
    const missing = seoRoutes.filter((p) => {
      const loc = p === '/' ? `${ORIGIN}/` : `${ORIGIN}${p}`;
      return !sitemapXml.includes(`<loc>${loc}</loc>`);
    });
    expect(missing).toEqual([]);
  });

  it('contains no <lastmod> tag anywhere (no real per-page source exists yet)', () => {
    expect(sitemapXml).not.toContain('<lastmod>');
  });

  it('contains no /resources/blog/<slug> post URLs', () => {
    expect(sitemapXml).not.toMatch(/<loc>[^<]*\/resources\/blog\/[^<]+<\/loc>/);
  });
});
