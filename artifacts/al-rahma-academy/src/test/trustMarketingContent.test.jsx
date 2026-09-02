import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import TrustBar from '../components/features/marketing/TrustBar';
import * as socialProof from '../data/marketing/socialProof';
import * as content from '../i18n/content';
import { LANGS } from '../i18n/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Trust/marketing remediation (see docs/trust-marketing-remediation.md):
// this file guards against fabricated testimonials, unsupported stats and
// a synthetic live-activity counter ever coming back into the marketing
// surface. Section references below are to that task's spec.

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

// Names/labels that only ever existed in the deleted fabricated
// TESTIMONIALS array / TESTIMONIAL_TEXT quotes / fake video-story cards.
const KNOWN_PLACEHOLDER_STRINGS = [
  'Aisha R.',
  'Yusuf K.',
  'Sarah M.',
  'Mariam O.',
  'Thomas B.',
  'Fatima C.',
  'Ahmed, 9',
  'Johnson Family',
  'Watch Real Student Stories',
  '✓ Verified',
];

describe('fabricated testimonials no longer render (spec §2)', () => {
  it('Testimonials.jsx has been deleted, not left as a dormant null-returning placeholder', () => {
    const p = path.resolve(
      __dirname,
      '../components/features/marketing/Testimonials.jsx',
    );
    expect(fs.existsSync(p)).toBe(false);
  });

  it('none of the known placeholder names/labels appear anywhere in tracked marketing source', () => {
    const dirs = [
      path.resolve(__dirname, '../components/features/marketing'),
      path.resolve(__dirname, '../i18n'),
    ];
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(jsx?|css)$/.test(file)) continue;
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const needle of KNOWN_PLACEHOLDER_STRINGS) {
          expect(text, `${file} should not contain "${needle}"`).not.toContain(needle);
        }
      }
    }
  });

  it('there is no production toggle left that can silently re-enable the fabricated data', () => {
    // socialProof.js used to export SHOW_TESTIMONIALS / TESTIMONIALS /
    // SHOW_STATS / STATS / HAPPY_STUDENTS. They must be gone from the
    // module's exports entirely — not merely defaulted to false — so
    // there is nothing to flip back to `true` and republish.
    expect(socialProof.SHOW_TESTIMONIALS).toBeUndefined();
    expect(socialProof.TESTIMONIALS).toBeUndefined();
    expect(socialProof.SHOW_STATS).toBeUndefined();
    expect(socialProof.STATS).toBeUndefined();
    expect(socialProof.HAPPY_STUDENTS).toBeUndefined();
  });

  it('the fabricated per-language testimonial quotes are gone from i18n/content.js', () => {
    expect(content.TESTIMONIAL_TEXT).toBeUndefined();
  });
});

describe('unsupported statistics no longer render (spec §3)', () => {
  it('StatsBanner.jsx has been deleted (32 tutors / 4.9★ / 9,000+ / 40+ countries had no real source, and it must not remain as a dormant place to re-add them)', () => {
    const p = path.resolve(
      __dirname,
      '../components/features/marketing/StatsBanner.jsx',
    );
    expect(fs.existsSync(p)).toBe(false);
  });

  it('TrustBar no longer shows the unsupported "40+ countries" / "1,200+ active students" figures', () => {
    const { container } = renderWithLang(<TrustBar />);
    const text = container.textContent;
    expect(text).not.toContain('40+');
    expect(text).not.toContain('1,200+');
    expect(text).not.toContain('1200+');
  });

  it('TrustBar shows the owner-confirmed 24-day refund guarantee and de-numbers the Al-Azhar tutor count', () => {
    const { container } = renderWithLang(<TrustBar />);
    const text = container.textContent;
    expect(text).toContain('24-day');
    expect(text).not.toContain('14-day');
    // "32" must not appear as a standalone tutor-count figure anymore.
    expect(container.querySelector('.trust-bar__stat-num')?.textContent).not.toBe('32');
  });
});

describe('ToolsHub no longer shows unsupported usage stats or a fake social-proof avatar row', () => {
  // Integration review finding (docs/stage1-trust-integration-review.md):
  // this was the one known-deferred item from the trust-marketing spec -
  // TOOLS_HUB_TEXT in i18n/content.js was never touched by the original
  // remediation pass, despite carrying the exact same category of
  // unsupported figures (six per-tool "X+ users/read/checked/counted"
  // claims, plus a "Join 1,200+ students" line) already removed everywhere
  // else (TrustBar, StatsBanner, Hero, Footer, About, Teachers).
  it.each(LANGS)('%s: no per-tool stat line remains (none had a real data source)', (lang) => {
    const hubText = content.pick(content.TOOLS_HUB_TEXT, lang);
    expect(hubText.stats).toEqual([]);
  });

  it.each(LANGS)('%s: the cta object no longer carries a socialProof headcount claim', (lang) => {
    const hubText = content.pick(content.TOOLS_HUB_TEXT, lang);
    expect(hubText.cta.socialProof).toBeUndefined();
  });

  it('ToolsHub.jsx no longer renders the fake avatar-initials social-proof row', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/hubs/ToolsHub.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/tools-enroll-cta__social-proof/);
    expect(src).not.toMatch(/tools-enroll-cta__avatar/);
    expect(src).not.toMatch(/socialProof/);
  });
});

describe('Enroll.jsx no longer shows a fabricated testimonial or unsupported stats', () => {
  // Integration review finding: Enroll.jsx (the actual enrollment/checkout
  // page) was outside the trust-marketing branch's diff entirely and still
  // hardcoded a fabricated named quote ("Fatima K., Manchester") plus three
  // unsourced statistics (500+ families, 40+ countries, 4.9★) directly in
  // JSX - the same category of fabricated content already removed from
  // Testimonials.jsx/TrustBar/Hero elsewhere, just missed on this page.
  it('no fabricated quote, name, or unsupported stat remains in source', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/Enroll.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/Fatima K/);
    expect(src).not.toMatch(/completed her first Surah/);
    expect(src).not.toMatch(/enroll__trust-strip/);
    expect(src).not.toMatch(/500\+/);
    expect(src).not.toMatch(/40\+/);
    expect(src).not.toMatch(/4\.9/);
  });
});

describe('synthetic live counter no longer renders (spec §4)', () => {
  it('LiveCounter.jsx has been deleted from the marketing components directory', () => {
    const p = path.resolve(
      __dirname,
      '../components/features/marketing/LiveCounter.jsx',
    );
    expect(fs.existsSync(p)).toBe(false);
  });

  it('no marketing/trust component computes a fake live headcount via Math.random or date-derived formulas for that purpose', () => {
    const dir = path.resolve(__dirname, '../components/features/marketing');
    const offenders = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.jsx')) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      if (/Math\.random/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('nothing in the rendered trust surface claims students are "learning right now" or reports synthetic "lessons this month"', () => {
    const { container } = renderWithLang(<TrustBar />);
    const text = container.textContent;
    expect(text).not.toContain('learning right now');
    expect(text).not.toContain('lessons this month');
  });
});

describe('Home metadata no longer repeats removed unsupported numbers (spec §3)', () => {
  it('Home.jsx SEO description does not contain the removed "1,200+ families" claim', () => {
    const homeSrc = fs.readFileSync(
      path.resolve(__dirname, '../pages/Home.jsx'),
      'utf8',
    );
    const descMatch = homeSrc.match(/description:\s*[`']([^`']*)[`']/);
    expect(descMatch).not.toBeNull();
    expect(descMatch[1]).not.toContain('1,200+');
    expect(descMatch[1]).not.toContain('1200+');
  });

  it('Home.jsx no longer imports or renders the deleted Testimonials/StatsBanner components', () => {
    const homeSrc = fs.readFileSync(
      path.resolve(__dirname, '../pages/Home.jsx'),
      'utf8',
    );
    expect(homeSrc).not.toMatch(/import Testimonials/);
    expect(homeSrc).not.toMatch(/<Testimonials\s*\/>/);
    expect(homeSrc).not.toMatch(/import StatsBanner/);
    expect(homeSrc).not.toMatch(/<StatsBanner\s*\/>/);
  });
});
