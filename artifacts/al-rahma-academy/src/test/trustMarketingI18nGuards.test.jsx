import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import en from '../i18n/en';
import ar from '../i18n/ar';
import itLocale from '../i18n/it';
import es from '../i18n/es';
import de from '../i18n/de';
import fr from '../i18n/fr';
import JoinCTA from '../components/features/marketing/JoinCTA';
import TrustBar from '../components/features/marketing/TrustBar';
import Pricing from '../components/features/marketing/Pricing';

// Trust/marketing remediation §8/§11: structural parity across the six
// legal languages for the sections this task touched, plus a static guard
// (spec §3's "add a guard preventing known unsupported Trust numbers from
// returning to marketing files without a documented source") that scans
// every marketing component AND every locale file for the specific figures
// that were removed as unsupported: 32 tutors, 4.9★ rating, 9,000+ lessons,
// 40+ countries, 1,200+ students/families. This is deliberately scoped to
// the marketing/trust surface — it does not forbid these numbers anywhere
// else in the app (e.g. real course/session counts, prices, dates).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = { en, ar, it: itLocale, es, de, fr };
const LOCALE_PATH = { en: '/', ar: '/ar', it: '/it', es: '/es', de: '/de', fr: '/fr' };

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function keysOf(obj) {
  return Object.keys(obj).sort();
}

// Strips comments so these guards check actual code/CSS rules, not this
// task's own explanatory comments (which legitimately name the removed
// selectors/figures for documentation). CSS has no `//` comment syntax —
// stripping it there would also eat "http://..." in url()s — so JS/JSX
// gets both block and line comments stripped, CSS only block comments.
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('i18n structural parity across the six languages for touched sections (spec §8)', () => {
  const sections = ['pricing', 'trial', 'newsletter', 'joinCta', 'trust', 'trustBar'];

  it.each(sections)('every locale has the same top-level keys as en for "%s"', (section) => {
    const expected = keysOf(en[section]);
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(keysOf(dict[section]), `locale "${code}" section "${section}"`).toEqual(expected);
    }
  });

  it('trial.fields and trial.trustRow have parity across all locales', () => {
    for (const sub of ['fields', 'trustRow', 'placeholders']) {
      const expected = keysOf(en.trial[sub]);
      for (const [code, dict] of Object.entries(LOCALES)) {
        expect(keysOf(dict.trial[sub]), `locale "${code}" trial.${sub}`).toEqual(expected);
      }
    }
  });

  it('trust.items, trustBar.badges, joinCta.stats and newsletter.benefits have the same length everywhere', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(dict.trust.items.length, `${code} trust.items`).toBe(en.trust.items.length);
      expect(dict.trustBar.badges.length, `${code} trustBar.badges`).toBe(en.trustBar.badges.length);
      expect(dict.joinCta.stats.length, `${code} joinCta.stats`).toBe(en.joinCta.stats.length);
      expect(dict.newsletter.benefits.length, `${code} newsletter.benefits`).toBe(en.newsletter.benefits.length);
    }
  });

  it('no locale has an empty-string value for any touched key (would render as blank/undefined)', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      for (const section of sections) {
        for (const [key, value] of Object.entries(dict[section])) {
          if (typeof value === 'string') {
            expect(value.length, `${code}.${section}.${key}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('JoinCTA and Pricing render without English-only literals in non-English locales (spec §8)', () => {
  const NON_EN = ['ar', 'it', 'es', 'de', 'fr'];

  it.each(NON_EN)('JoinCTA does not fall back to English secondary-CTA/guarantee text in %s', (locale) => {
    const { container } = renderWithLang(<JoinCTA onTrialClick={() => {}} />, LOCALE_PATH[locale]);
    expect(container.textContent).not.toContain('Browse courses first');
    expect(container.textContent).not.toContain('14-day money-back guarantee · No credit card required · Cancel anytime');
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it.each(NON_EN)('Pricing does not fall back to English trust-signal text in %s', (locale) => {
    const { container } = renderWithLang(<Pricing />, LOCALE_PATH[locale]);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it.each(NON_EN)('TrustBar does not fall back to the English WhatsApp aria-label in %s', (locale) => {
    const { container } = renderWithLang(<TrustBar />, LOCALE_PATH[locale]);
    const link = container.querySelector('.trust-bar__wa');
    expect(link.getAttribute('aria-label')).not.toBe('WhatsApp support status');
  });

  it('renders JoinCTA right-to-left for Arabic', () => {
    renderWithLang(<JoinCTA onTrialClick={() => {}} />, '/ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });
});

describe('removed unsupported Trust numbers do not return anywhere in the marketing surface (spec §3/§11)', () => {
  const REMOVED_PATTERNS = [
    /\b32\s*(Al-Azhar)?\s*(certified\s*)?tutors?\b/i,
    /\b4[.,]9\s*★/,
    /\b9,?000\+?\s*lessons\b/i,
    /\b40\+?\s*countries\b/i,
    /\b1,?200\+?\s*(families|students)\b/i,
  ];

  const marketingDir = path.resolve(__dirname, '../components/features/marketing');
  const marketingFiles = fs
    .readdirSync(marketingDir)
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => path.join(marketingDir, f));

  // Note: i18n/content.js deliberately excluded here — it still carries an
  // unrelated "1,200+ students" figure inside TOOLS_HUB_TEXT (ToolsHub.jsx's
  // CTA), which is the same category of unsupported claim but sits in a
  // component this task's authorized scope did not cover (see "Deferred
  // items" in docs/trust-marketing-remediation.md). TESTIMONIAL_TEXT's
  // removal from that same file is covered separately in
  // trustMarketingContent.test.jsx.
  const i18nDir = path.resolve(__dirname, '../i18n');
  const i18nFiles = ['en.js', 'ar.js', 'it.js', 'es.js', 'de.js', 'fr.js'].map((f) =>
    path.join(i18nDir, f),
  );

  it.each([...marketingFiles, path.resolve(__dirname, '../pages/Home.jsx'), ...i18nFiles])(
    '%s does not contain a removed unsupported figure',
    (file) => {
      const src = stripJsComments(fs.readFileSync(file, 'utf8'));
      for (const pattern of REMOVED_PATTERNS) {
        expect(src, `${path.basename(file)} matched ${pattern}`).not.toMatch(pattern);
      }
    },
  );
});

describe('no orphaned imports/CSS from the removals in this task (spec §11 item 28)', () => {
  it('JoinCTA.jsx no longer imports the deleted LiveCounter component', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/JoinCTA.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/LiveCounter/);
  });

  it('no CSS file still styles the deleted .live-counter* or .join-cta__live selectors', () => {
    const stylesDir = path.resolve(__dirname, '../styles');
    const offenders = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.css')) {
          const text = stripCssComments(fs.readFileSync(full, 'utf8'));
          if (/\.live-counter|\.join-cta__live\b/.test(text)) offenders.push(full);
        }
      }
    }
    walk(stylesDir);
    expect(offenders).toEqual([]);
  });

  it('no CSS file still styles the deleted newsletter guide-cover or pricing urgency/countdown selectors', () => {
    const stylesDir = path.resolve(__dirname, '../styles');
    const offenders = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.css')) {
          const text = stripCssComments(fs.readFileSync(full, 'utf8'));
          if (
            /\.newsletter__guide-cover|\.pricing__countdown|\.pricing__spots\b|\.trial__urgency\b/.test(text)
          ) {
            offenders.push(full);
          }
        }
      }
    }
    walk(stylesDir);
    expect(offenders).toEqual([]);
  });
});
