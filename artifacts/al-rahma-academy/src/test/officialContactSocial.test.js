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
  const files = walk(srcDir, ['.js', '.jsx'], ['test']).filter(
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
  const files = walk(srcDir, ['.js', '.jsx'], ['test']).filter(
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

describe('legitimate non-account links are untouched (Part 9 — no blind replacement)', () => {
  it('a real WhatsApp share-with-a-chosen-recipient link (wa.me/?text=) still exists somewhere in the app', () => {
    const srcDir = path.resolve(__dirname, '..');
    const files = walk(srcDir, ['.js', '.jsx'], ['test']);
    const combined = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(combined).toMatch(/wa\.me\/\?text=/);
  });
});
