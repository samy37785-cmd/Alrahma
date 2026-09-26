import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seoRoutes } from '../../scripts/seoRoutes.mjs';
import { PRERENDER_MANIFEST, canonicalUrlFor } from '../../scripts/prerender-routes.mjs';

// Guardrail for scripts/gen-sitemap.mjs + scripts/seoRoutes.mjs: seoRoutes is
// the single source of truth for what's publicly indexable, and
// public/sitemap.xml is generated from it at build time (npm `prebuild`
// hook) — this locks in three things that have regressed before: real
// public pages missing from the list, fabricated blog-post URLs sneaking
// back in once posts don't exist, and a build-time lastmod that isn't real.
//
// Sitemap fix (2026-09-26): public/sitemap.xml is now generated from
// PRERENDER_MANIFEST (only published, actually-prerendered en/ar pairs),
// not from seoRoutes.mjs anymore — seoRoutes.mjs's list included many
// routes (individual /tools/*, /resources/blog, /resources/faq,
// /academy/privacy|terms|refund-policy, /enroll, /courses/islamic-studies)
// that serve Home-shell content with a wrong canonical when visited
// directly, which is exactly the bug this fix removes. seoRoutes.mjs
// itself is untouched and still governs a separate, broader concern (see
// the 'seoRoutes' describe block below); it is simply no longer the
// sitemap's source.

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemapPath = join(__dirname, '..', '..', 'public', 'sitemap.xml');
const sitemapXml = readFileSync(sitemapPath, 'utf8');

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

describe('public/sitemap.xml (generated from PRERENDER_MANIFEST)', () => {
  it('contains exactly the canonical URL of every published PRERENDER_MANIFEST (route, locale) pair, and nothing else', () => {
    const expectedLocs = PRERENDER_MANIFEST.filter((entry) => entry.status === 'published').map(canonicalUrlFor);
    const actualLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    const missing = expectedLocs.filter((loc) => !actualLocs.includes(loc));
    const extra = actualLocs.filter((loc) => !expectedLocs.includes(loc));

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('contains no <lastmod> tag anywhere (no real per-page source exists yet)', () => {
    expect(sitemapXml).not.toContain('<lastmod>');
  });

  it('contains no /resources/blog/<slug> post URLs', () => {
    expect(sitemapXml).not.toMatch(/<loc>[^<]*\/resources\/blog\/[^<]+<\/loc>/);
  });
});
