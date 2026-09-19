// @vitest-environment node
//
// Hadith Library Cleanup: Keep Only Working Collections (2026-09-18).
// Guards the product decision that the visitor-facing library lists ONLY
// collections that work end-to-end in-app -- no "blocked"/"not available
// yet" card, no external read link, no book that isn't actually backed by
// a working, documented data source.
//
// Also retains (unchanged in spirit) the original Source Recovery phase's
// guards:
// - src/data/hadith/collections.js: structural ids/links.
// - src/i18n/hadith/collections.js: visible en/ar author/note text
//   (structural parity already covered by contentCompleteness.test.js).
// - src/data/hadith/sources.js: source/license/provenance documentation.
// - HadithLibrary.jsx no longer contains the isAr/lang==='ar' content-fork
//   pattern.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HADITH_COLLECTIONS } from '../data/hadith/collections';
import { HADITH_CDN_SOURCE, HADITH_COLLECTION_SOURCES, HADITH_REMOVED_FROM_UI } from '../data/hadith/sources';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import it_ from '../i18n/it.js';
import es from '../i18n/es.js';
import de from '../i18n/de.js';
import fr from '../i18n/fr.js';
const SRC_ROOT = join(import.meta.dirname, '..');
const REMOVED_IDS = ['riyadussalihin', 'adab', 'bulugh'];

describe('src/data/hadith/collections.js: structural integrity', () => {
  it('lists exactly 10 collections -- every previously "blocked" book is gone from product data, not just hidden', () => {
    expect(HADITH_COLLECTIONS).toHaveLength(10);
  });

  it('every collection has a unique id', () => {
    const ids = HADITH_COLLECTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every collection has a non-empty slug and a positive count (a working "Browse" action)', () => {
    for (const c of HADITH_COLLECTIONS) {
      expect(typeof c.slug === 'string' && c.slug.trim() !== '', `${c.id}: missing slug`).toBe(true);
      expect(c.count, `${c.id}: count must be a positive number`).toBeGreaterThan(0);
    }
  });

  it('none of the 3 removed collections appear in product data', () => {
    const ids = HADITH_COLLECTIONS.map((c) => c.id);
    for (const removedId of REMOVED_IDS) {
      expect(ids).not.toContain(removedId);
    }
  });

  it('no entry carries a "blocked"/"status" field or an officialReadUrl -- the whole concept is gone from structural data, not just unused', () => {
    for (const c of HADITH_COLLECTIONS) {
      expect(c.status, `${c.id}: unexpected leftover status field`).toBeUndefined();
      expect(c.officialReadUrl, `${c.id}: unexpected leftover officialReadUrl`).toBeUndefined();
    }
  });
});

describe('src/data/hadith/sources.js: every listed collection is documented with a real source', () => {
  it('HADITH_CDN_SOURCE (the source backing every collection) has real license documentation, framed as the source repo\'s own declaration', () => {
    expect(HADITH_CDN_SOURCE.licenseName).toBeTruthy();
    expect(HADITH_CDN_SOURCE.licenseUrl).toMatch(/^https:\/\//);
    expect(HADITH_CDN_SOURCE.allowsRedistribution).toBe(true);
    expect(HADITH_CDN_SOURCE.verifiedOn).toBeTruthy();
    // Must not overclaim an independent legal review it never performed.
    expect(HADITH_CDN_SOURCE.independentLegalReview).toBe(false);
    expect(HADITH_CDN_SOURCE.verificationNotes).toMatch(/independent legal opinion/);
  });

  it('every HADITH_COLLECTIONS entry has a matching HADITH_COLLECTION_SOURCES entry documenting its CDN slug and a verification date', () => {
    for (const c of HADITH_COLLECTIONS) {
      const src = HADITH_COLLECTION_SOURCES[c.id];
      expect(src, `${c.id}: no entry in HADITH_COLLECTION_SOURCES`).toBeTruthy();
      expect(src.cdnSlug, `${c.id}: missing cdnSlug`).toBeTruthy();
      expect(src.verifiedOn, `${c.id}: missing verifiedOn`).toBeTruthy();
      expect(typeof src.liveHadithCount === 'number' && src.liveHadithCount > 0, `${c.id}: missing liveHadithCount`).toBe(true);
    }
  });

  it('HADITH_COLLECTION_SOURCES has exactly 10 entries -- no leftover blocked-book source entries', () => {
    expect(Object.keys(HADITH_COLLECTION_SOURCES)).toHaveLength(10);
    for (const removedId of REMOVED_IDS) {
      expect(HADITH_COLLECTION_SOURCES[removedId]).toBeUndefined();
    }
  });

  it('the 3 removed collections are preserved as an internal-only audit record, not silently erased without a trace', () => {
    for (const removedId of REMOVED_IDS) {
      const entry = HADITH_REMOVED_FROM_UI[removedId];
      expect(entry, `${removedId}: missing from HADITH_REMOVED_FROM_UI`).toBeTruthy();
      expect(entry.reason).toBe('BLOCKED_BY_LICENSE_OR_SOURCE');
      expect(entry.removedOn).toBeTruthy();
      expect(Array.isArray(entry.rejectedSources) && entry.rejectedSources.length > 0).toBe(true);
    }
  });
});

describe('HadithLibrary.jsx: no isAr/lang===\'ar\' ternary content fork remains', () => {
  const source = readFileSync(join(SRC_ROOT, 'pages', 'HadithLibrary.jsx'), 'utf8');
  // Same regex as toolsPagesNoIsArFork.test.js -- requires the literal `?`
  // that only a real ternary has, so it never flags this file's own
  // "isAr"-mentioning comments.
  const IS_AR_TERNARY = /(isAr|lang\s*===\s*['"]ar['"])\s*\?/;

  it('does not match the isAr-ternary fork pattern', () => {
    expect(source).not.toMatch(IS_AR_TERNARY);
  });

  it('sanity: the regex actually matches the old anti-pattern (not vacuously passing)', () => {
    expect("isAr ? selected.ar : selected.label").toMatch(IS_AR_TERNARY);
  });

  it('imports the structural and text data modules', () => {
    expect(source).toMatch(/from ['"].*data\/hadith\/collections['"]/);
    expect(source).toMatch(/from ['"].*i18n\/hadith\/collections['"]/);
  });

  it('contains no "blocked" concept, no officialReadUrl, and no ids of the 3 removed collections -- the removal is real, not cosmetic', () => {
    expect(source).not.toMatch(/blocked/i);
    expect(source).not.toMatch(/officialReadUrl/);
    for (const removedId of REMOVED_IDS) {
      expect(source).not.toMatch(new RegExp(removedId));
    }
  });

  it('never links out to an external site (no target="_blank" / rel="noopener") -- every card is a working in-app "Browse" action', () => {
    expect(source).not.toMatch(/target=["']_blank["']/);
  });
});

// Text-entry id parity (src/i18n/hadith/collections.js vs.
// src/data/hadith/collections.js) is already covered generically by
// contentCompleteness.test.js's "content module structural completeness"
// block -- not duplicated here.

describe('src/i18n/{en,ar}.js hadith section: no false "hosted here" claim for live-fetched, externally-sourced content', () => {
  it('en.js heroSub does not claim the content is "hosted right here"', () => {
    const source = readFileSync(join(SRC_ROOT, 'i18n', 'en.js'), 'utf8');
    expect(source).not.toMatch(/hosted right here/i);
  });

  it('ar.js heroSub does not claim the content is hosted "directly inside the site" (مباشرة/مباشرةً داخل الموقع)', () => {
    const source = readFileSync(join(SRC_ROOT, 'i18n', 'ar.js'), 'utf8');
    expect(source).not.toMatch(/مباشرة[ً]?\s*داخل الموقع/);
  });

  it('no longer defines notAvailable/readOnOfficialSite keys anywhere (unused now that no book is ever blocked) -- checked across all 6 locales so i18nParity.test.js never has to catch a leftover key first', () => {
    for (const file of ['en.js', 'ar.js', 'it.js', 'es.js', 'de.js', 'fr.js']) {
      const source = readFileSync(join(SRC_ROOT, 'i18n', file), 'utf8');
      const hadithSection = source.slice(source.indexOf('"hadith": {'), source.indexOf('"hadith": {') + 1200);
      expect(hadithSection, `${file}: notAvailable`).not.toMatch(/"notAvailable"/);
      expect(hadithSection, `${file}: readOnOfficialSite`).not.toMatch(/"readOnOfficialSite"/);
    }
  });
});

// Phase H1 (2026-09-19): it/es/de/fr's hadith.pageDesc/heroSub -- the exact
// strings HadithLibrary.jsx feeds into useSEO() and renders as the hero
// sub-heading (`const h = t.hadith`, `h.pageDesc`, `h.heroSub`) -- used to
// say "13 collections" and imply the text was hosted locally, both false:
// the library lists exactly 10 working collections (see the structural
// integrity block above) and fetches every hadith live from an external,
// documented CDN (HadithLibrary.jsx's `fetch(`${CDN}/...`)`, CDN = the same
// jsDelivr URL HADITH_CDN_SOURCE documents in data/hadith/sources.js).
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
