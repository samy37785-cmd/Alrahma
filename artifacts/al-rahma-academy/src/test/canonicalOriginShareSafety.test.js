import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../data/site';

// Canonical Origin and Share-Link Safety — Final Corrective Before Stage 2D
// (2026-09-03). Before this round, three wrong domain variants had drifted
// into live share surfaces: `al-rahma.academy` (dot-academy TLD) in
// MilestoneCelebration.jsx and Dashboard.jsx, and `alrahmaacademy.com`
// (missing the hyphen) in ReferralCard.jsx and ShareAchievement.jsx. The
// only real domain is https://al-rahmaacademy.com, now sourced from a
// single place — site.origin in src/data/site.js — and re-exported as
// ORIGIN from src/utils/localePath.js for useSEO.js/the sitemap pipeline.
// This file guards both that unification and that every window.open(...)
// call which navigates to an external URL carries noopener/noreferrer.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const srcDir = path.resolve(__dirname, '..');

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

const PRODUCTION_FILES = walk(srcDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS).filter(
  (f) => !f.includes(`${path.sep}test${path.sep}`),
);

// Non-src production surfaces that also carry the domain: the static
// <head>, the prebuild-generated sitemap, robots.txt, and llms.txt.
const EXTRA_PRODUCTION_FILES = [
  path.join(REPO_ROOT, 'index.html'),
  path.join(REPO_ROOT, 'public', 'sitemap.xml'),
  path.join(REPO_ROOT, 'public', 'robots.txt'),
  path.join(REPO_ROOT, 'public', 'llms.txt'),
].filter((f) => fs.existsSync(f));

const ALL_PRODUCTION_FILES = [...PRODUCTION_FILES, ...EXTRA_PRODUCTION_FILES];

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

  it('the four share surfaces build their share link/message from site.origin, not a hardcoded literal', () => {
    const shareFiles = [
      'components/ui/MilestoneCelebration.jsx',
      'pages/Dashboard.jsx',
      'components/ui/ReferralCard.jsx',
      'components/ui/ShareAchievement.jsx',
    ];
    for (const rel of shareFiles) {
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(content, rel).toMatch(/site\.origin/);
    }
  });
});

// Index-based (not single-line-regex) scan, same technique as
// officialContactSocial.test.js's wa.me/ classifier: immune to reformatting.
// Skips window.open('', ...) calls, which open a same-origin blank window
// the app itself writes into (CertificateCard.jsx, VerseCardModal.jsx,
// Profile.jsx print/preview flows) — those never navigate to an external
// URL, so noopener/noreferrer is not a meaningful requirement for them.
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

describe('every external window.open(...) carries noopener (Share-window safety, Part D)', () => {
  it.each(ALL_PRODUCTION_FILES.filter((f) => !f.endsWith('.html') && !f.endsWith('.xml') && !f.endsWith('.txt')))(
    '%s has no unsafe external window.open',
    (file) => {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(srcDir, file).split(path.sep).join('/');
      const unsafe = findUnsafeExternalWindowOpens(content);
      expect(unsafe, `${rel} has unsafe window.open at index/indices ${JSON.stringify(unsafe)}`).toEqual([]);
    },
  );

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
});
