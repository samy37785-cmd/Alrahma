import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../data/site';

// Canonical Origin and Share-Link Safety — Final Corrective Before Stage 2D
// (2026-09-03), corrected 2026-09-03 (Canonical Origin Evidence + Windows
// Migration Gate + GitHub Integration — Final Closure). Before this round,
// two wrong domain variants had drifted into live share surfaces —
// `al-rahma.academy` (dot-academy TLD) and `alrahmaacademy.com` (missing
// the hyphen) — appearing across **11 occurrences** in 4 files
// (MilestoneCelebration.jsx ×3, Dashboard.jsx ×1, ReferralCard.jsx ×1,
// ShareAchievement.jsx ×6). Do not conflate "2 wrong variant forms" with
// "11 occurrences" — this file's first draft undercounted the occurrence
// total as 9 by missing ShareAchievement.jsx's `getShareText` fallback
// default message. The only real domain is https://al-rahmaacademy.com,
// now sourced from a single place — site.origin in src/data/site.js — and
// re-exported as ORIGIN from src/utils/localePath.js for
// useSEO.js/the sitemap pipeline. This file guards: the single-source
// contract, zero occurrences of either wrong variant, the exact 11-
// occurrence inventory across the four share files (so a future
// undercount/miscount is a test failure, not just a report typo), that
// no OTHER production JS file redeclares the domain literal outside a
// narrow documented exception, that the static SEO mirrors carry only the
// approved domain, and that every external window.open(...) call carries
// noopener/noreferrer.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const srcDir = path.resolve(__dirname, '..');
const scriptsDir = path.join(REPO_ROOT, 'scripts');

const PRODUCTION_SOURCE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'];
const WALK_EXCLUDE_DIRS = ['test', 'node_modules', 'coverage', 'dist', 'generated'];

function walk(dir, exts, exclude) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.some((x) => entry.name === x)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts, exclude));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// All production JS/JSX/TS/TSX/MJS/MTS: the Vite-bundled src/ tree PLUS
// the plain-Node build scripts/ directory (scripts/gen-sitemap.mjs is
// production code too — it writes public/sitemap.xml, a real SEO
// artifact — even though it isn't bundled by Vite).
const SRC_PRODUCTION_FILES = walk(srcDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS).filter(
  (f) => !f.includes(`${path.sep}test${path.sep}`),
);
const SCRIPTS_PRODUCTION_FILES = walk(scriptsDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS);
const ALL_PRODUCTION_JS_FILES = [...SRC_PRODUCTION_FILES, ...SCRIPTS_PRODUCTION_FILES];

// Non-JS production surfaces that mirror the domain as static/declarative
// content: the static <head>, and the three prebuild-generated/curated
// public SEO artifacts. These are documented as VALIDATED STATIC MIRRORS
// of site.origin, not independent sources of truth — see the "static
// mirrors carry the official domain" describe block below, and
// docs/trust-marketing-remediation.md's Canonical Origin entries.
const STATIC_MIRROR_FILES = [
  path.join(REPO_ROOT, 'index.html'),
  path.join(REPO_ROOT, 'public', 'sitemap.xml'),
  path.join(REPO_ROOT, 'public', 'robots.txt'),
  path.join(REPO_ROOT, 'public', 'llms.txt'),
].filter((f) => fs.existsSync(f));

const ALL_PRODUCTION_FILES = [...ALL_PRODUCTION_JS_FILES, ...STATIC_MIRROR_FILES];

// Verified false-positive-free: "al-rahmaacademy.com" (the real domain)
// does not contain either wrong variant as a contiguous substring, because
// the hyphen in "al-rahmaacademy.com" breaks both patterns — a plain
// substring/regex check is safe with no lookaround needed.
const WRONG_DOMAIN_PATTERNS = [
  { label: 'al-rahma.academy (wrong TLD)', re: /al-rahma\.academy/ },
  { label: 'alrahmaacademy.com (missing hyphen)', re: /alrahmaacademy\.com/ },
];

describe('site.origin is the single canonical-domain source (Canonical Origin corrective)', () => {
  it('is the exact approved domain', () => {
    expect(site.origin).toBe('https://al-rahmaacademy.com');
  });

  it('src/utils/localePath.js re-exports ORIGIN from site.origin rather than redeclaring the literal', () => {
    const localePathSrc = fs.readFileSync(path.join(srcDir, 'utils', 'localePath.js'), 'utf8');
    expect(localePathSrc).toMatch(/export const ORIGIN = site\.origin/);
    expect(localePathSrc).not.toMatch(/export const ORIGIN = ['"]https:\/\//);
  });

  it('src/hooks/useSEO.js imports ORIGIN from localePath.js rather than redeclaring the literal', () => {
    const useSeoSrc = fs.readFileSync(path.join(srcDir, 'hooks', 'useSEO.js'), 'utf8');
    expect(useSeoSrc).toMatch(/import\s*\{[^}]*\bORIGIN\b[^}]*\}\s*from\s*['"]\.\.\/utils\/localePath['"]/);
    expect(useSeoSrc).not.toMatch(/const ORIGIN = ['"]https:\/\//);
  });
});

describe('zero occurrences of any wrong domain variant in production source (Canonical Origin corrective)', () => {
  it.each(ALL_PRODUCTION_FILES)('%s contains no wrong domain variant', (file) => {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    for (const { label, re } of WRONG_DOMAIN_PATTERNS) {
      expect(content, `${rel} matched ${label}`).not.toMatch(re);
    }
  });
});

// Exact per-file occurrence inventory of site.origin usage in the four
// share surfaces — mirrors officialContactSocial.test.js's wa.me/
// inventory pattern, deliberately: a soft "contains site.origin
// somewhere" check cannot catch a future undercount the way an exact
// count can. 3 + 1 + 1 + 6 = 11, matching the corrected count in
// docs/trust-marketing-remediation.md.
const EXPECTED_SITE_ORIGIN_SHARE_INVENTORY = {
  'components/ui/MilestoneCelebration.jsx': 3,
  'pages/Dashboard.jsx': 1,
  'components/ui/ReferralCard.jsx': 1,
  'components/ui/ShareAchievement.jsx': 6,
};
const EXPECTED_TOTAL_SHARE_OCCURRENCES = 11;

function countSiteOriginOccurrences(content) {
  return (content.match(/site\.origin/g) || []).length;
}

describe('exact site.origin occurrence inventory across the four share surfaces (corrected count, 2026-09-03)', () => {
  it.each(Object.entries(EXPECTED_SITE_ORIGIN_SHARE_INVENTORY))(
    '%s references site.origin exactly %s time(s)',
    (rel, expectedCount) => {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(countSiteOriginOccurrences(content), rel).toBe(expectedCount);
    },
  );

  it(`totals exactly ${EXPECTED_TOTAL_SHARE_OCCURRENCES} site.origin occurrences across the four share files`, () => {
    const total = Object.keys(EXPECTED_SITE_ORIGIN_SHARE_INVENTORY).reduce((sum, rel) => {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      return sum + countSiteOriginOccurrences(content);
    }, 0);
    expect(total).toBe(EXPECTED_TOTAL_SHARE_OCCURRENCES);
  });
});

// No canonical-domain literal duplicated in production JS source outside
// a narrow, justified exception list. The only file allowed to spell the
// domain as a string literal is src/data/site.js itself — every other
// production JS/JSX/TS/TSX/MJS/MTS consumer (including
// scripts/gen-sitemap.mjs, and the JSON-LD blocks in BlogPost.jsx,
// CourseIjazah.jsx, CourseIslamicStudies.jsx) must read site.origin (or
// ORIGIN re-exported from it) instead of redeclaring the string. This is
// deliberately scoped to production JS source only — it does NOT claim
// site.js is the only literal in the entire repository: the static
// mirrors (index.html, public/robots.txt, public/llms.txt,
// public/sitemap.xml) are documented, separately-guarded exceptions
// below, since they cannot `import` a JS module.
const CANONICAL_LITERAL_EXCEPTIONS = new Set(['src/data/site.js']);

describe('no duplicated canonical-domain literal in production JS source outside the one permitted file', () => {
  it.each(ALL_PRODUCTION_JS_FILES)('%s does not redeclare the domain as a literal, unless it is the one permitted source file', (file) => {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (CANONICAL_LITERAL_EXCEPTIONS.has(rel)) return;
    const content = fs.readFileSync(file, 'utf8');
    expect(content, rel).not.toMatch(/['"`]https:\/\/al-rahmaacademy\.com/);
  });

  it('exactly one production JS file contains the domain as a string literal: src/data/site.js', () => {
    const filesWithLiteral = ALL_PRODUCTION_JS_FILES
      .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'))
      .filter((rel) => {
        const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        return /['"`]https:\/\/al-rahmaacademy\.com/.test(content);
      });
    expect(filesWithLiteral).toEqual(['src/data/site.js']);
  });

  it('scripts/gen-sitemap.mjs imports site.origin rather than defining an independently-drifting constant', () => {
    const content = fs.readFileSync(path.join(scriptsDir, 'gen-sitemap.mjs'), 'utf8');
    expect(content).toMatch(/import\s*\{\s*site\s*\}\s*from\s*['"]\.\.\/src\/data\/site\.js['"]/);
    expect(content).toMatch(/const origin = site\.origin/);
    expect(content).not.toMatch(/['"`]https:\/\/al-rahmaacademy\.com/);
  });

  it('BlogPost.jsx, CourseIjazah.jsx and CourseIslamicStudies.jsx read site.origin in their JSON-LD blocks', () => {
    const files = ['pages/BlogPost.jsx', 'pages/CourseIjazah.jsx', 'pages/CourseIslamicStudies.jsx'];
    for (const rel of files) {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(content, rel).toMatch(/site\.origin/);
      expect(content, rel).not.toMatch(/['"`]https:\/\/al-rahmaacademy\.com/);
    }
  });
});

// Static/declarative surfaces that cannot `import` src/data/site.js are
// documented, validated mirrors of site.origin — not independent sources
// of truth. "Validated" means: this describe block proves every one of
// them actually carries the one approved domain, not just that it lacks
// the wrong ones.
describe('static SEO mirrors (index.html, robots.txt, llms.txt, sitemap.xml) carry only the official domain', () => {
  it.each(STATIC_MIRROR_FILES)('%s contains at least one reference to the approved domain', (file) => {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    expect(content, rel).toContain('https://al-rahmaacademy.com');
  });

  // Deliberately NOT executing scripts/gen-sitemap.mjs here: writing to a
  // tracked file (public/sitemap.xml) as a side effect of `vitest run`
  // would leave the working tree dirty after every test run and risk the
  // same CRLF-checkout-vs-generation noise this round already had to
  // investigate once for the real build. That gen-sitemap.mjs reads
  // site.origin rather than an independent literal is proven by source
  // inspection above ("scripts/gen-sitemap.mjs imports site.origin...");
  // that regenerating it produces byte-for-byte-equivalent output was
  // verified manually this round (see the final report) and is re-proven
  // every time `npm run build`'s prebuild step runs.
});

// Index-based (not single-line-regex) scan, same technique as
// officialContactSocial.test.js's wa.me/ classifier: immune to reformatting.
// Skips window.open('', ...) calls, which open a same-origin blank window
// the app itself writes into — NOT an external navigation, so
// noopener/noreferrer is not a meaningful requirement for them. This
// exception is intentionally narrow: the next describe block enumerates
// the exact, currently-known call sites so a NEW window.open('', ...)
// added anywhere else is a test failure requiring deliberate review, not
// a silent expansion of the exception.
function findUnsafeExternalWindowOpens(content) {
  const unsafe = [];
  const re = /window\.open\(/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const afterCall = m.index + m[0].length;
    const opensBlankSameOrigin = /^\s*(''|"")\s*,/.test(content.slice(afterCall, afterCall + 10));
    if (opensBlankSameOrigin) continue;
    const callWindow = content.slice(m.index, afterCall + 300);
    if (!/noopener/.test(callWindow)) unsafe.push(m.index);
  }
  return unsafe;
}

function countBlankSameOriginWindowOpens(content) {
  const re = /window\.open\(\s*(''|"")\s*,/g;
  return (content.match(re) || []).length;
}

describe('every external window.open(...) carries noopener (Share-window safety, Part D)', () => {
  it.each(SRC_PRODUCTION_FILES)('%s has no unsafe external window.open', (file) => {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    const unsafe = findUnsafeExternalWindowOpens(content);
    expect(unsafe, `${rel} has unsafe window.open at index/indices ${JSON.stringify(unsafe)}`).toEqual([]);
  });

  it('MilestoneCelebration.jsx, ReferralCard.jsx and ShareAchievement.jsx each have their external window.open calls present and safe', () => {
    const files = {
      'components/ui/MilestoneCelebration.jsx': 2,
      'components/ui/ReferralCard.jsx': 1,
      'components/ui/ShareAchievement.jsx': 2,
    };
    for (const [rel, expectedCount] of Object.entries(files)) {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      const opens = content.match(/window\.open\(/g) || [];
      expect(opens.length, rel).toBe(expectedCount);
      expect(findUnsafeExternalWindowOpens(content), rel).toEqual([]);
    }
  });

  it('MilestoneCelebration.jsx\'s LinkedIn window.open keeps its width/height dimensions alongside noopener/noreferrer', () => {
    const content = fs.readFileSync(path.join(srcDir, 'components/ui/MilestoneCelebration.jsx'), 'utf8');
    expect(content).toMatch(/window\.open\(url, '_blank', 'width=600,height=500,noopener,noreferrer'\)/);
  });

  // The documented, narrow same-origin-blank-window exception: exactly
  // these three files, one call each, currently. A new call site (or an
  // extra call in one of these files) changes this count and must be
  // reviewed deliberately — not silently swallowed by the exception.
  const KNOWN_BLANK_WINDOW_FILES = {
    'components/ui/CertificateCard.jsx': 1,
    'components/ui/VerseCardModal.jsx': 1,
    'pages/Profile.jsx': 1,
  };

  it('exactly the known files use the same-origin blank-window exception, each exactly once', () => {
    for (const [rel, expectedCount] of Object.entries(KNOWN_BLANK_WINDOW_FILES)) {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(countBlankSameOriginWindowOpens(content), rel).toBe(expectedCount);
    }
  });

  it('no production file outside the known list uses the same-origin blank-window exception', () => {
    const knownFiles = new Set(Object.keys(KNOWN_BLANK_WINDOW_FILES));
    for (const file of SRC_PRODUCTION_FILES) {
      const rel = path.relative(srcDir, file).split(path.sep).join('/');
      if (knownFiles.has(rel)) continue;
      const content = fs.readFileSync(file, 'utf8');
      expect(countBlankSameOriginWindowOpens(content), rel).toBe(0);
    }
  });

  it(`the known blank-window files' total window.open(...) call count is exactly ${Object.keys({ 'components/ui/CertificateCard.jsx': 1, 'components/ui/VerseCardModal.jsx': 1, 'pages/Profile.jsx': 1 }).length}, all blank/same-origin`, () => {
    const files = ['components/ui/CertificateCard.jsx', 'components/ui/VerseCardModal.jsx', 'pages/Profile.jsx'];
    for (const rel of files) {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      const totalOpens = (content.match(/window\.open\(/g) || []).length;
      const blankOpens = countBlankSameOriginWindowOpens(content);
      expect(totalOpens, `${rel} total window.open calls`).toBe(1);
      expect(blankOpens, `${rel} blank/same-origin window.open calls`).toBe(1);
    }
  });
});
