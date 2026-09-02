import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site, socials } from '../data/site';

// Teacher Source of Truth + Official Contact and Social Identity — Final
// Integration (2026-09-02). Guards the new phone/WhatsApp number and the
// five confirmed social accounts (Twitter removed). src/data/site.js is
// the single source for the phone/WhatsApp digits — do not duplicate them
// as a separate literal elsewhere (see contentTruthCorrective.test.js's
// "no longer carries a duplicate phoneDisplay" test for the siteFacts.js
// side of this guard).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const OLD_PHONE_PATTERNS = [
  '+20 101 605 4663',
  '+201016054663',
  '201016054663',
  '01016054663',
];

// Extension-complete: the R1 sweep only walked .js/.jsx, which is why its
// own inventory undercounted (it never looked at the handful of .js files
// like dashboardNav.js). This list covers everything Vite/TS actually
// compiles in this project.
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

describe('site.js is the single phone/WhatsApp source', () => {
  it('holds the exact owner-confirmed contact contract', () => {
    expect(site.phoneLocalDisplay).toBe('01039553264');
    expect(site.phoneInternationalDisplay).toBe('+20 103 955 3264');
    expect(site.phoneE164).toBe('+201039553264');
    expect(site.phoneHref).toBe('tel:+201039553264');
    expect(site.whatsapp).toBe('201039553264');
    expect(site.whatsappDisplay).toBe('+20 103 955 3264');
  });

  it('phoneHref is a ready-to-use tel: URI, not a bare number needing a prefix', () => {
    expect(site.phoneHref.startsWith('tel:')).toBe(true);
    expect(site.phoneHref).toBe(`tel:${site.phoneE164}`);
  });
});

describe('no old phone number remains in live application source (Part 11)', () => {
  const srcDir = path.resolve(__dirname, '..');
  const files = walk(srcDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS).filter(
    (f) => !f.includes(`${path.sep}test${path.sep}`),
  );

  it.each(files)('%s does not contain the old phone number in any form', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    for (const old of OLD_PHONE_PATTERNS) {
      expect(src, `${path.basename(file)} matched "${old}"`).not.toContain(old);
    }
  });

  it('index.html does not contain the old phone number', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    for (const old of OLD_PHONE_PATTERNS) {
      expect(html).not.toContain(old);
    }
    expect(html).toContain('"telephone": "+201039553264"');
  });

  it('public/llms.txt does not contain the old phone number', () => {
    const txt = fs.readFileSync(path.join(REPO_ROOT, 'public', 'llms.txt'), 'utf8');
    for (const old of OLD_PHONE_PATTERNS) {
      expect(txt).not.toContain(old);
    }
    expect(txt).toContain('+20 103 955 3264');
  });

  it('TrustBar.jsx, pages/FAQ.jsx and the live homepage marketing FAQ.jsx build their WhatsApp link from site.whatsapp, not a hardcoded literal', () => {
    const trustBarSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/TrustBar.jsx'), 'utf8',
    );
    const pagesFaqSrc = fs.readFileSync(path.resolve(__dirname, '../pages/FAQ.jsx'), 'utf8');
    const homeFaqSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/FAQ.jsx'), 'utf8',
    );
    expect(trustBarSrc).toMatch(/site\.whatsapp/);
    expect(pagesFaqSrc).toMatch(/site\.whatsapp/);
    expect(homeFaqSrc).toMatch(/site\.whatsapp/);
    expect(homeFaqSrc).toMatch(/import\s*\{\s*site\s*\}\s*from/);
  });

  it('resolves to the exact confirmed WhatsApp direct-contact URL', () => {
    expect(`https://wa.me/${site.whatsapp}`).toBe('https://wa.me/201039553264');
  });
});

// Content Truth Contract corrective (2026-09-02): an independent review
// found the LIVE homepage marketing FAQ component
// (components/features/marketing/FAQ.jsx, imported by pages/Home.jsx and
// actually rendered on "/") had its own separate, unapproved WhatsApp
// deep-link (wa.me/message/ALRAHMA) that the earlier round's tests never
// caught because they only checked pages/FAQ.jsx (the standalone
// /resources/faq page) and TrustBar.jsx — a different component sharing a
// similar name is exactly the kind of gap a plain grep across "FAQ.jsx"
// filenames misses. These tests specifically target every wa.me/message/*
// form and the live-rendered component, not just the page.
describe('no unapproved wa.me/message/ deep-link remains anywhere in live application source', () => {
  const srcDir = path.resolve(__dirname, '..');
  const files = walk(srcDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS).filter(
    (f) => !f.includes(`${path.sep}test${path.sep}`),
  );

  it.each(files)('%s does not contain wa.me/message/', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src, path.basename(file)).not.toMatch(/wa\.me\/message\//);
  });

  it('index.html does not contain wa.me/message/', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/wa\.me\/message\//);
  });

  it('public/llms.txt does not contain wa.me/message/', () => {
    const txt = fs.readFileSync(path.join(REPO_ROOT, 'public', 'llms.txt'), 'utf8');
    expect(txt).not.toMatch(/wa\.me\/message\//);
  });

  it('the specific old literal wa.me/message/ALRAHMA is gone from the live homepage FAQ component', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/FAQ.jsx'), 'utf8',
    );
    expect(src).not.toMatch(/wa\.me\/message\/ALRAHMA/);
    expect(src).not.toMatch(/wa\.me\/message\//);
  });
});

describe('socials — exactly five confirmed accounts, Twitter removed (Part 12)', () => {
  it('has exactly five entries', () => {
    expect(socials.length).toBe(5);
  });

  it('matches the exact confirmed labels and URLs', () => {
    const expected = {
      Facebook: 'https://www.facebook.com/alrahmaacademyonline/',
      Instagram: 'https://www.instagram.com/alrahmaacademyonline/',
      YouTube: 'https://www.youtube.com/@alrahmaacademyonline',
      TikTok: 'https://www.tiktok.com/@alrahmaacademyonline',
      Snapchat: 'https://www.snapchat.com/add/alrahmaacademy',
    };
    expect(Object.keys(expected).length).toBe(5);
    for (const s of socials) {
      expect(expected, `unexpected social label "${s.label}"`).toHaveProperty(s.label);
      expect(s.href, s.label).toBe(expected[s.label]);
    }
  });

  it('has no Twitter/X entry', () => {
    expect(socials.find((s) => /twitter|^x$/i.test(s.label))).toBeUndefined();
  });

  it('every entry has a non-empty 24x24-viewBox-ready SVG path', () => {
    for (const s of socials) {
      expect(typeof s.svg, s.label).toBe('string');
      expect(s.svg.length, s.label).toBeGreaterThan(10);
    }
  });

  it('index.html\'s JSON-LD sameAs matches the five social URLs exactly, no Twitter', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/twitter\.com\/alrahmaacademy/);
    for (const s of socials) {
      expect(html, s.label).toContain(s.href);
    }
    const sameAsMatch = html.match(/"sameAs":\s*\[([\s\S]*?)\]/);
    expect(sameAsMatch).toBeTruthy();
    const urlCount = (sameAsMatch[1].match(/https:\/\//g) || []).length;
    expect(urlCount).toBe(5);
  });

  it('index.html keeps twitter:card protocol metadata but drops the twitter:site/creator account handles', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/name="twitter:card"/);
    expect(html).not.toMatch(/name="twitter:site"/);
    expect(html).not.toMatch(/name="twitter:creator"/);
  });
});

describe('Footer.jsx and TopBar.jsx render all five socials with a safe target/rel contract (Part 12)', () => {
  it('Footer.jsx maps over socials with target="_blank" rel="noopener noreferrer"', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/layout/Footer.jsx'), 'utf8');
    expect(src).toMatch(/socials\.map/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
    expect(src).toMatch(/aria-label=\{s\.label\}/);
  });

  it('TopBar.jsx maps over socials with target="_blank" rel="noopener noreferrer"', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/layout/TopBar.jsx'), 'utf8');
    expect(src).toMatch(/socials\.map/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
    expect(src).toMatch(/aria-label=\{s\.label\}/);
  });

  it('Footer.jsx and TopBar.jsx use site.phoneHref/site.phoneInternationalDisplay, not the old field names', () => {
    const footerSrc = fs.readFileSync(path.resolve(__dirname, '../components/layout/Footer.jsx'), 'utf8');
    const topBarSrc = fs.readFileSync(path.resolve(__dirname, '../components/layout/TopBar.jsx'), 'utf8');
    expect(topBarSrc).toMatch(/site\.phoneHref/);
    expect(topBarSrc).toMatch(/site\.phoneInternationalDisplay/);
    expect(topBarSrc).not.toMatch(/site\.phoneDisplay\b/);
    // Footer.jsx doesn't render the phone number itself (only email/WhatsApp),
    // so it has no phone field reference to check either way.
    expect(footerSrc).toMatch(/site\.whatsapp\b/);
  });
});

// Teacher/Contact Final Corrective R2 (2026-09-02): the prior round's own
// "Full-application wa.me/social/phone sweep" undercounted the real
// inventory — it reported roughly 4 direct-contact files and 1 share file
// (this block's own predecessor above, "Part 9," only ever spot-checked
// that *a* share link existed "somewhere," never classifying or counting
// anything). A full extension-complete re-scan of src/ (js/jsx/ts/tsx/
// mjs/mts, excluding src/test/) found the true count: 15 unique production
// files, 17 total wa.me/ occurrences — 13 built from site.whatsapp (academy
// direct contact, including query-string variants like Trial's pre-filled
// message and RefundPolicy's refund-request text, which still carry the
// academy's own number and are therefore direct contact, not a share), and
// 4 using the bare, recipient-less wa.me/?text= share pattern. This block
// replaces the old spot-check with an exhaustive, per-occurrence classified
// inventory that fails on any new/missing/reclassified/hardcoded/third-form
// occurrence, not just the presence of one keyword.
const EXPECTED_WA_ME_INVENTORY = {
  'components/features/marketing/FAQ.jsx': { count: 1, classification: 'academy-direct' },
  'components/features/marketing/Trial.jsx': { count: 2, classification: 'academy-direct' },
  'components/features/marketing/TrustBar.jsx': { count: 1, classification: 'academy-direct' },
  'components/layout/dashboardNav.js': { count: 1, classification: 'academy-direct' },
  'components/layout/Footer.jsx': { count: 1, classification: 'academy-direct' },
  'components/ui/CancelSurvey.jsx': { count: 1, classification: 'academy-direct' },
  'components/ui/WhatsappFab.jsx': { count: 1, classification: 'academy-direct' },
  'pages/Dashboard.jsx': { count: 1, classification: 'academy-direct' },
  'pages/FAQ.jsx': { count: 1, classification: 'academy-direct' },
  'pages/RefundPolicy.jsx': { count: 1, classification: 'academy-direct' },
  'pages/TermsOfService.jsx': { count: 2, classification: 'academy-direct' },
  'components/ui/MilestoneCelebration.jsx': { count: 1, classification: 'user-choice-share' },
  'components/ui/ReferralCard.jsx': { count: 1, classification: 'user-choice-share' },
  'components/ui/ShareAchievement.jsx': { count: 1, classification: 'user-choice-share' },
  'pages/tools/VerseOfTheDayPage.jsx': { count: 1, classification: 'user-choice-share' },
};

const EXPECTED_TOTAL_FILES = 15;
const EXPECTED_TOTAL_OCCURRENCES = 17;
const EXPECTED_DIRECT_OCCURRENCES = 13;
const EXPECTED_SHARE_OCCURRENCES = 4;

// Classifies by index math on the raw file text (never a single-line
// regex), so a reformatted/wrapped href would still classify correctly:
// the wa.me/ deep-link format is either wa.me/?text=... (bare share, no
// recipient) or wa.me/<something-that-must-resolve-to-site.whatsapp>. The
// character immediately after "wa.me/" alone is enough to tell them apart;
// a short trailing window catches the site.whatsapp reference regardless
// of whether it's a template-literal interpolation or string concatenation.
function classifyWaMeOccurrence(content, matchIndex) {
  const afterMarker = matchIndex + 'wa.me/'.length;
  const immediateSuffix = content.slice(afterMarker, afterMarker + 30);
  if (immediateSuffix.startsWith('message/')) return 'legacy-message-deep-link';
  if (immediateSuffix.startsWith('?')) {
    return immediateSuffix.startsWith('?text=') ? 'user-choice-share' : 'unknown-query-form';
  }
  const nearbyWindow = content.slice(afterMarker, afterMarker + 60);
  return /site\.whatsapp/.test(nearbyWindow) ? 'academy-direct' : 'unknown';
}

function findWaMeOccurrences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const occurrences = [];
  const re = /wa\.me\//g;
  let m;
  while ((m = re.exec(content)) !== null) {
    occurrences.push(classifyWaMeOccurrence(content, m.index));
  }
  return occurrences;
}

describe('complete wa.me/ inventory across production source, every occurrence classified (Part 9 / R2)', () => {
  const srcDir = path.resolve(__dirname, '..');
  const files = walk(srcDir, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS).filter(
    (f) => !f.includes(`${path.sep}test${path.sep}`),
  );

  const inventory = {};
  for (const file of files) {
    const occurrences = findWaMeOccurrences(file);
    if (occurrences.length === 0) continue;
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    inventory[rel] = occurrences;
  }

  it('finds exactly the expected set of files containing wa.me/ — no new or missing file', () => {
    const actualFiles = Object.keys(inventory).sort();
    const expectedFiles = Object.keys(EXPECTED_WA_ME_INVENTORY).sort();
    expect(actualFiles).toEqual(expectedFiles);
  });

  it(`totals exactly ${EXPECTED_TOTAL_FILES} files and ${EXPECTED_TOTAL_OCCURRENCES} occurrences`, () => {
    const fileCount = Object.keys(inventory).length;
    const totalOccurrences = Object.values(inventory).reduce((sum, arr) => sum + arr.length, 0);
    expect(fileCount).toBe(EXPECTED_TOTAL_FILES);
    expect(totalOccurrences).toBe(EXPECTED_TOTAL_OCCURRENCES);
  });

  it.each(Object.entries(EXPECTED_WA_ME_INVENTORY))(
    '%s has the expected occurrence count and classification',
    (rel, expected) => {
      const occurrences = inventory[rel];
      expect(occurrences, rel).toBeTruthy();
      expect(occurrences.length, `${rel} occurrence count`).toBe(expected.count);
      for (const classification of occurrences) {
        expect(classification, rel).toBe(expected.classification);
      }
    },
  );

  it(`classifies exactly ${EXPECTED_DIRECT_OCCURRENCES} occurrences as academy-direct and ${EXPECTED_SHARE_OCCURRENCES} as user-choice-share, zero of any other form`, () => {
    const all = Object.values(inventory).flat();
    const direct = all.filter((c) => c === 'academy-direct');
    const share = all.filter((c) => c === 'user-choice-share');
    const other = all.filter((c) => c !== 'academy-direct' && c !== 'user-choice-share');
    expect(direct.length).toBe(EXPECTED_DIRECT_OCCURRENCES);
    expect(share.length).toBe(EXPECTED_SHARE_OCCURRENCES);
    expect(other, `unclassified/unknown wa.me forms found: ${JSON.stringify(other)}`).toEqual([]);
  });

  it('no file references the api.whatsapp.com domain form', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, path.relative(srcDir, file)).not.toMatch(/api\.whatsapp\.com/);
    }
  });

  it('the academy WhatsApp number never appears as a hardcoded literal in production source outside src/data/site.js', () => {
    for (const file of files) {
      const rel = path.relative(srcDir, file).split(path.sep).join('/');
      if (rel === 'data/site.js') continue;
      const content = fs.readFileSync(file, 'utf8');
      expect(content, rel).not.toMatch(/201039553264/);
    }
  });

  it('every academy-direct occurrence resolves through site.whatsapp — none is a bare/hardcoded number', () => {
    for (const [rel, expected] of Object.entries(EXPECTED_WA_ME_INVENTORY)) {
      if (expected.classification !== 'academy-direct') continue;
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(content, rel).toMatch(/site\.whatsapp/);
    }
  });

  it('every user-choice-share occurrence uses the bare, recipient-less wa.me/?text= form — none embeds the academy number', () => {
    for (const [rel, expected] of Object.entries(EXPECTED_WA_ME_INVENTORY)) {
      if (expected.classification !== 'user-choice-share') continue;
      const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      expect(content, rel).toMatch(/wa\.me\/\?text=/);
      expect(content, `${rel} should not embed site.whatsapp — that would make it a direct-contact link, not a user-choice share`).not.toMatch(/wa\.me\/\$\{?site\.whatsapp/);
    }
  });
});
