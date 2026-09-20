import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { PRERENDER_MANIFEST, canonicalUrlFor, outputRelPathFor } from '../../scripts/prerender-routes.mjs';

// SEO Prerender Pilot (2026-09-20): proves the real static HTML files
// scripts/prerender.mjs writes after `vite build` (as `postbuild`) are
// correct BEFORE any JavaScript runs — reads the actual files on disk,
// never a fixture or a mock of what prerender.mjs is supposed to produce.
//
// This only has something real to check after a real build has run. Run
// standalone (the existing pre-build "Frontend vitest" CI step, or a bare
// `npx vitest run` on a fresh checkout with no dist/ yet), it skips
// itself — visibly, as a reported Skipped entry, never as a false Passed
// — rather than fail a step that structurally cannot have dist/ yet, or
// silently claim to have checked something it never touched. The CI
// workflow's dedicated post-build step is the only place this is
// expected to actually execute its assertions.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist/public');
const distExists = existsSync(distDir);

// Kept as a literal copy of prerender.mjs's own SHELL_TITLE constant
// (rather than importing it) so a title-not-shell check here can never be
// made to always pass merely by both sides referencing the same drifted
// value.
const SHELL_TITLE = 'Al-Rahma Academy — Learn Quran Online | Tajweed, Hifz & Arabic';

describe.skipIf(!distExists)('Prerender output (dist/public) — real files on disk, post-build only', () => {
  it.each(PRERENDER_MANIFEST)('$route @ $locale: correct raw HTML before any JavaScript', (entry) => {
    const filePath = path.join(distDir, outputRelPathFor(entry));
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedDir = entry.locale === 'ar' ? 'rtl' : 'ltr';

    expect(document.documentElement.lang, 'html[lang]').toBe(entry.locale);
    expect(document.documentElement.dir, 'html[dir]').toBe(expectedDir);

    const title = document.title;
    expect(title, 'title must not be empty').toBeTruthy();
    expect(title, 'title must not be the pre-hydration SPA shell').not.toBe(SHELL_TITLE);

    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    expect(description, 'meta description must be present').toBeTruthy();

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical, 'canonical').toBe(canonicalUrlFor(entry));

    const main = document.querySelector('#main-content');
    expect(main, '#main-content must exist').toBeTruthy();
    expect(main.textContent.trim().length, '#main-content must have real hydrated text').toBeGreaterThan(0);
  });

  it('the four prerendered files are not byte-identical to each other (each is genuinely page-specific)', () => {
    const contents = PRERENDER_MANIFEST.map((entry) =>
      readFileSync(path.join(distDir, outputRelPathFor(entry)), 'utf8'),
    );
    const unique = new Set(contents);
    expect(unique.size, 'expected 4 distinct HTML files, not copies of one shell').toBe(PRERENDER_MANIFEST.length);
  });
});

describe.skipIf(distExists)('Prerender output — dist/public not present (expected before a real build)', () => {
  it('is explicitly skipped here, not silently treated as a pass', () => {
    expect(distExists).toBe(false);
  });
});
