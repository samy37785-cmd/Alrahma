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

// The static shell's meta description (index.html), same rationale as
// SHELL_TITLE above — a literal, not an import, so both sides can never
// silently drift together.
const SHELL_DESCRIPTION =
  'Learn the Holy Quran online with certified Egyptian tutors. One-to-one live lessons in Tajweed, Hifz, Ijazah and Arabic for kids and adults — anywhere in the world. Book your free trial lesson today.';

// Verification strengthening (2026-09-20): the four real dist/public
// output paths, written as literal strings rather than derived through
// outputRelPathFor() — so a bug in that helper (wrong slug, wrong
// trailing-slash handling, ...) can never make this block "pass" by
// checking the wrong file, or by sharing the same wrong path logic as the
// primary describe block above. expectedCanonical is likewise a literal,
// not canonicalUrlFor(entry). h1Text is the real page heading rendered in
// the body (verified against Hero.jsx/src/i18n/en.js+ar.js's hero.title
// for Home, and CourseIjazah.jsx's own <h1> for Ijazah) — not the <title>
// tag, so this proves genuine hydrated body content, not just metadata.
// expectedEnHref/expectedArHref (added for the hreflang fix, 2026-09-21):
// the reciprocal en/ar alternates BOTH locale entries of the same route
// must share — literal strings, not derived via hreflangLinksFor(), for
// the same reason expectedCanonical is literal above: this file must be
// able to catch a bug in that helper, not just confirm it agrees with
// itself.
const LITERAL_FILES = [
  {
    route: '/',
    locale: 'en',
    relPath: 'index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/',
    h1Text: 'Give Your Child the Gift of the Quran',
    expectedEnHref: 'https://al-rahmaacademy.com/',
    expectedArHref: 'https://al-rahmaacademy.com/ar/',
  },
  {
    route: '/',
    locale: 'ar',
    relPath: 'ar/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/',
    h1Text: 'امنح طفلك هدية القرآن الكريم',
    expectedEnHref: 'https://al-rahmaacademy.com/',
    expectedArHref: 'https://al-rahmaacademy.com/ar/',
  },
  {
    route: '/courses/ijazah',
    locale: 'en',
    relPath: 'courses/ijazah/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses/ijazah',
    h1Text: 'Quran Ijazah Course',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/ijazah',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/ijazah',
  },
  {
    route: '/courses/ijazah',
    locale: 'ar',
    relPath: 'ar/courses/ijazah/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses/ijazah',
    h1Text: 'دورة إجازة القرآن الكريم',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/ijazah',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/ijazah',
  },
];

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

// Same "skip before build, run after" rule as the primary describe block
// above — this reads real files too, so it needs dist/public to exist
// just as much.
describe.skipIf(!distExists)('Prerender output — literal dist/public paths (independent of outputRelPathFor)', () => {
  it.each(LITERAL_FILES)('$relPath: correct raw HTML at the literal path', ({ locale, relPath, expectedCanonical, h1Text, expectedEnHref, expectedArHref }) => {
    const filePath = path.join(distDir, relPath);
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
    expect(document.documentElement.lang, 'html[lang]').toBe(locale);
    expect(document.documentElement.dir, 'html[dir]').toBe(expectedDir);

    const title = document.title;
    expect(title, 'title must not be empty').toBeTruthy();
    expect(title, 'title must not be the pre-hydration SPA shell').not.toBe(SHELL_TITLE);

    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    expect(description, 'meta description must not be empty').toBeTruthy();
    expect(description, 'meta description must not be the pre-hydration SPA shell').not.toBe(SHELL_DESCRIPTION);

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical, 'canonical').toBe(expectedCanonical);

    const heading = document.querySelector('h1');
    expect(heading, 'h1 must exist in body').toBeTruthy();
    expect(heading.textContent.trim(), 'h1 must be the real page-specific heading, not empty/placeholder').toBe(h1Text);

    // hreflang fix (2026-09-21): the static SPA shell's inherited en/it/fr
    // block (no ar) must be fully replaced by the real, reciprocal en/ar
    // pair + x-default — nothing else, and nothing missing.
    const hreflangEls = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(hreflangEls.length, 'exactly 3 hreflang alternates (en, ar, x-default), no more').toBe(3);

    const byHreflang = Object.fromEntries(hreflangEls.map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]));
    expect(byHreflang.en, 'hreflang=en must point at the English version of this same page').toBe(expectedEnHref);
    expect(byHreflang.ar, 'hreflang=ar must point at the Arabic version of this same page').toBe(expectedArHref);
    expect(byHreflang['x-default'], 'hreflang=x-default must point at the English version').toBe(expectedEnHref);

    expect(byHreflang.it, 'no hreflang=it — it is not a published language').toBeUndefined();
    expect(byHreflang.fr, 'no hreflang=fr — fr is not a published language').toBeUndefined();
    expect(byHreflang.es, 'no hreflang=es — es is not a published language').toBeUndefined();
    expect(byHreflang.de, 'no hreflang=de — de is not a published language').toBeUndefined();
  });
});

// Unconditional — pure logic, no filesystem access, so it runs both
// before and after a build. Proves outputRelPathFor() can never silently
// drift from the literal paths the block above (and prerender.mjs itself,
// via the same shared helper) actually depend on.
describe('outputRelPathFor() matches the literal dist/public paths above (no drift)', () => {
  it.each(LITERAL_FILES)('$route @ $locale -> $relPath', ({ route, locale, relPath }) => {
    expect(outputRelPathFor({ route, locale })).toBe(relPath);
  });
});
