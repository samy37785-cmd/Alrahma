import { describe, expect, it } from 'vitest';
import { LANGS } from '../i18n';
import { TRANSLATION_STATUS, KNOWN_OUT_OF_SCOPE, isPublished } from '../data/translationStatus';

const VALID_STATUSES = new Set(['published', 'draft', 'legacy']);

describe('translationStatus registry shape', () => {
  it('every entry has en explicitly published and only real language codes from LANGS', () => {
    for (const [route, entry] of Object.entries(TRANSLATION_STATUS)) {
      expect(entry.languages.en?.status, `${route} must mark en published`).toBe('published');
      for (const code of Object.keys(entry.languages)) {
        expect(LANGS, `${route} has an unknown language code ${code}`).toContain(code);
      }
      for (const code of LANGS) {
        expect(entry.languages, `${route} is missing a ${code} entry`).toHaveProperty(code);
      }
    }
  });

  it('every status value is one of published/draft/legacy', () => {
    for (const [route, entry] of Object.entries(TRANSLATION_STATUS)) {
      for (const [code, { status }] of Object.entries(entry.languages)) {
        expect(VALID_STATUSES, `${route}/${code} has an invalid status "${status}"`).toContain(status);
      }
    }
  });

  it('every entry lists at least one contentSources file', () => {
    for (const [route, entry] of Object.entries(TRANSLATION_STATUS)) {
      expect(Array.isArray(entry.contentSources), `${route} must have contentSources`).toBe(true);
      expect(entry.contentSources.length, `${route}'s contentSources must not be empty`).toBeGreaterThan(0);
    }
  });

  it('a non-English "published" status backed by a page-inline source (not yet an importable content module) requires evidence', () => {
    // Content modules (importable, structurally checkable by
    // contentCompleteness.test.js) end in a shared/data-style filename
    // pattern; anything else backing a 'published' claim is an inline
    // const inside a page .jsx, which can't be structurally verified yet --
    // so it must carry a human attestation instead.
    const KNOWN_MODULE_FILES = new Set([
      'src/i18n/content.js', 'src/i18n/experience.js', 'src/data/faqItems.js',
      'src/data/siteFacts.js', 'src/i18n/adhkarText.js', 'src/data/marketing/teachers.js',
      'src/i18n/courses/ijazah.js', 'src/i18n/courses/islamic-studies.js',
    ]);
    for (const [route, entry] of Object.entries(TRANSLATION_STATUS)) {
      const hasModuleSource = entry.contentSources.some((f) => KNOWN_MODULE_FILES.has(f));
      for (const [code, langEntry] of Object.entries(entry.languages)) {
        if (code === 'en' || langEntry.status !== 'published') continue;
        if (hasModuleSource) continue;
        expect(
          typeof langEntry.evidence === 'string' && langEntry.evidence.length > 0,
          `${route}/${code} is published from a page-inline source with no evidence field`,
        ).toBe(true);
      }
    }
  });

  it('KNOWN_OUT_OF_SCOPE entries each have a non-empty documented reason', () => {
    for (const [route, reason] of Object.entries(KNOWN_OUT_OF_SCOPE)) {
      expect(typeof reason === 'string' && reason.length > 0, `${route} has no reason`).toBe(true);
    }
  });
});

describe('isPublished()', () => {
  it('treats en as published for every route, listed or not', () => {
    expect(isPublished('/courses/ijazah', 'en')).toBe(true);
    expect(isPublished('/some/unlisted/route', 'en')).toBe(true);
  });

  it('returns true (no opinion) for a route outside the registry entirely -- this system does not govern it', () => {
    for (const code of LANGS) {
      expect(isPublished('/dashboard', code)).toBe(true);
      expect(isPublished('/some/unlisted/route', code)).toBe(true);
    }
  });

  it('marks the evidenced draft gaps as unpublished', () => {
    expect(isPublished('/courses/ijazah', 'it')).toBe(false);
    expect(isPublished('/courses/ijazah', 'es')).toBe(false);
    expect(isPublished('/courses/ijazah', 'de')).toBe(false);
    expect(isPublished('/courses/ijazah', 'fr')).toBe(false);
    expect(isPublished('/courses/islamic-studies', 'it')).toBe(false);
    expect(isPublished('/courses/islamic-studies', 'es')).toBe(false);
    expect(isPublished('/courses/islamic-studies', 'de')).toBe(false);
    expect(isPublished('/courses/islamic-studies', 'fr')).toBe(false);
  });

  // Arabic Cross-Page Shell Repair (2026-09-xx): ar on these two routes was
  // downgraded from 'published' to 'legacy'. Their content modules
  // (IJAZAH_TEXT.ar / ISLAMIC_STUDIES_TEXT.ar) are still structurally
  // complete -- contentCompleteness.test.js still proves that -- but a
  // full-page browser+code audit found the page SHELL around that content
  // still leaked English on /ar/: both pages' Breadcrumbs rendered a
  // hardcoded English 'Courses' as the first item (fixed this same phase),
  // and both still carry a hardcoded-English JSON-LD schema.description and
  // meta description (SEO is explicitly out of scope for this phase, so
  // that part of the gap is not fixed yet). 'published' is defined
  // elsewhere in this file as "the whole page is done", not "one content
  // module is done" -- so 'legacy' is the accurate status here until a
  // later, SEO-scoped phase closes the remaining JSON-LD/meta-description
  // gap. This test proves the downgrade actually took effect (not a stale
  // comment with no real change behind it).
  it('downgrades Ijazah/Islamic Studies ar to legacy (shell/SEO gaps remain) rather than leaving a stale "published" claim', () => {
    expect(TRANSLATION_STATUS['/courses/ijazah'].languages.ar.status).toBe('legacy');
    expect(TRANSLATION_STATUS['/courses/islamic-studies'].languages.ar.status).toBe('legacy');
    // legacy still renders normally (no visitor-facing regression) -- this
    // is a bookkeeping downgrade, not a new block.
    expect(isPublished('/courses/ijazah', 'ar')).toBe(true);
    expect(isPublished('/courses/islamic-studies', 'ar')).toBe(true);
  });

  it('renders legacy pages normally (no visitor-facing change) while not counting them as published', () => {
    expect(isPublished('/', 'ar')).toBe(true);
    expect(TRANSLATION_STATUS['/'].languages.ar.status).toBe('legacy');
    expect(isPublished('/resources/faq', 'de')).toBe(true);
    expect(TRANSLATION_STATUS['/resources/faq'].languages.de.status).toBe('legacy');
  });
});
