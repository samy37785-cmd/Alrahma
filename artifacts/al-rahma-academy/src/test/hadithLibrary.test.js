import { describe, it, expect } from 'vitest';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import it_ from '../i18n/it.js';
import es from '../i18n/es.js';
import de from '../i18n/de.js';
import fr from '../i18n/fr.js';

// Phase H1 (2026-09-19): it/es/de/fr's hadith.pageDesc/heroSub -- the exact
// strings HadithLibrary.jsx feeds into useSEO() and renders as the hero
// sub-heading (`const h = t.hadith`, `h.pageDesc`, `h.heroSub`) -- used to
// say "13 collections" and imply the text was hosted locally, both false:
// the library lists exactly 10 working collections and fetches every
// hadith live from an external, documented CDN (HadithLibrary.jsx's
// `fetch(`${CDN}/...`)`, the same jsDelivr URL HADITH_CDN_SOURCE documents
// in data/hadith/sources.js).
// These tests import the real locale modules (the same objects the page
// actually renders through `useLang()`/`t.hadith`), not file-source regex
// or an unused constant, so a regression here means the visitor-visible
// number/claim is wrong, not just a comment.
describe('src/i18n/{en,ar,it,es,de,fr}.js hadith.pageDesc / hadith.heroSub: real page-used strings say 10, never 13, never claim local hosting', () => {
  const locales = { en, ar, it: it_, es, de, fr };

  // Matches the specific "hosted locally" phrasings previously present in
  // en/it/es/de/fr/ar (now fixed) -- broad enough to catch a regression in
  // any of the six, narrow enough not to flag the correct "via a
  // documented, open data source" replacement wording.
  const HOSTING_CLAIM_PATTERNS = [
    /hosted right here/i,
    /right here on (this|the) site/i,
    /direkt auf dieser (Website|Seite)/i,
    /disponibles?\s+aqu[ií]\s+mismo/i,
    /disponibili\s+qui\b/i,
    /disponibles?\s+ici\s+m[êe]me/i,
    /مباشرة[ً]?\s*داخل الموقع/,
  ];

  for (const [name, locale] of Object.entries(locales)) {
    it(`${name}.js: hadith.pageDesc and hadith.heroSub are real, non-empty, coherent strings`, () => {
      expect(typeof locale.hadith.pageDesc).toBe('string');
      expect(locale.hadith.pageDesc.trim()).not.toBe('');
      expect(typeof locale.hadith.heroSub).toBe('string');
      expect(locale.hadith.heroSub.trim()).not.toBe('');
    });

    it(`${name}.js: hadith.pageDesc and hadith.heroSub never say "13" collections`, () => {
      expect(locale.hadith.pageDesc, `${name}.js pageDesc`).not.toMatch(/\b13\b/);
      expect(locale.hadith.heroSub, `${name}.js heroSub`).not.toMatch(/\b13\b/);
    });

    it(`${name}.js: hadith.pageDesc and hadith.heroSub never claim the content is hosted locally/here`, () => {
      for (const pattern of HOSTING_CLAIM_PATTERNS) {
        expect(locale.hadith.heroSub, `${name}.js heroSub matched ${pattern}`).not.toMatch(pattern);
        expect(locale.hadith.pageDesc, `${name}.js pageDesc matched ${pattern}`).not.toMatch(pattern);
      }
    });

    it(`${name}.js: hadith.pageDesc no longer names a removed collection (Riyad as-Salihin) as an example`, () => {
      expect(locale.hadith.pageDesc, `${name}.js pageDesc`).not.toMatch(/riyad\s*as-salihin/i);
    });
  }

  it('en.js was not regressed -- keeps its already-correct "10" figure', () => {
    expect(en.hadith.pageDesc).toMatch(/\b10\b/);
    expect(en.hadith.heroSub).toMatch(/\b10\b/);
  });

  it('ar.js was not regressed -- keeps its already-correct Arabic-numeral "١٠" figure', () => {
    expect(ar.hadith.pageDesc).toMatch(/١٠/);
    expect(ar.hadith.heroSub).toMatch(/١٠/);
  });

  for (const name of ['it', 'es', 'de', 'fr']) {
    it(`${name}.js now states the real figure of 10 collections in both pageDesc and heroSub`, () => {
      const locale = locales[name];
      expect(locale.hadith.pageDesc, `${name}.js pageDesc`).toMatch(/\b10\b/);
      expect(locale.hadith.heroSub, `${name}.js heroSub`).toMatch(/\b10\b/);
    });
  }
});
