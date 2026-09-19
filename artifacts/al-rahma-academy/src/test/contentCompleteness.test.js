import { describe, it, expect } from 'vitest';
import { LANGS } from '../i18n';
import { TRANSLATION_STATUS } from '../data/translationStatus';
import { PLAN_TEXT, VALUES_TEXT, UI_TEXT, TOOLS_TEXT, TOOLS_HUB_TEXT } from '../i18n/content';
import faqItems from '../data/faqItems';
import { ADHKAR_TR } from '../i18n/adhkarText';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data/marketing/teachers';
import { IJAZAH_TEXT } from '../i18n/courses/ijazah';
import { ISLAMIC_STUDIES_TEXT } from '../i18n/courses/islamic-studies';
import { PRAYER_TIMES_TEXT } from '../i18n/tools/prayerTimes';
import { QIBLA_TEXT } from '../i18n/tools/qibla';
import { ISLAMIC_CALENDAR_TEXT } from '../i18n/tools/islamicCalendar';
import { TASBEEH_TEXT } from '../i18n/tools/tasbeeh';
import { TAJWEED_CHECKER_TEXT } from '../i18n/tools/tajweedChecker';
import { HIFZ_REVIEW_TEXT } from '../i18n/tools/hifzReview';
import { RELATED_TOOLS_TEXT } from '../i18n/tools/relatedTools';
import { QUALITY_LEVELS } from '../pages/tools/HifzReviewPage';
import { HADITH_COLLECTIONS } from '../data/hadith/collections';
import { HADITH_COLLECTIONS_TEXT } from '../i18n/hadith/collections';

// Phase 2a: generalizes i18nParity.test.js's keyPaths/leafValues approach
// (which only covers src/i18n/{lang}.js + experience.js) to the data/*
// content modules referenced from src/data/translationStatus.js's
// contentSources. Per the approved rule: a language's ABSENCE from an item
// is legitimate (a route can be 'draft'/'legacy' for a language with no
// content written yet) -- what must never happen is a language being
// PRESENT but structurally incomplete (missing keys, or empty values) while
// something claims it's 'published'.

function keyPaths(obj, prefix = '') {
  // Base case: a leaf value (string/number/...), not a container. Needed
  // because a language's value at this point in the tree can itself BE the
  // leaf (e.g. teachers.js's title.en is a plain string, not a nested
  // object) -- without this, Object.entries() on a string iterates its
  // characters and produces bogus per-character "paths".
  if (obj === null || typeof obj !== 'object') return [`${prefix}:${typeof obj}`];
  const paths = [];
  if (Array.isArray(obj)) {
    paths.push(`${prefix}:array(${obj.length})`);
    obj.forEach((value, index) => {
      const path = `${prefix}[${index}]`;
      if (value !== null && typeof value === 'object') paths.push(...keyPaths(value, path));
      else paths.push(`${path}:${typeof value}`);
    });
    return paths;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) paths.push(...keyPaths(value, path));
    else if (value !== null && typeof value === 'object') paths.push(...keyPaths(value, path));
    else paths.push(`${path}:${typeof value}`);
  }
  return paths;
}

function leafValues(obj, prefix = '', leaves = {}) {
  if (Array.isArray(obj)) {
    obj.forEach((value, index) => leafValues(value, `${prefix}[${index}]`, leaves));
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) leafValues(value, prefix ? `${prefix}.${key}` : key, leaves);
  } else {
    leaves[prefix] = obj;
  }
  return leaves;
}

// items: an array of "language dicts" -- objects whose own keys are
// language codes (e.g. faqItems.js's [{ en: {...}, ar: {...}, ... }, ...],
// or a single-element array wrapping a whole content.js export like
// PLAN_TEXT which IS one language dict). A present language must
// structurally match `en` (same key paths) and have no empty-string leaves;
// an absent language is not an error.
function langParityIssues(items, { label }) {
  const issues = [];
  items.forEach((item, index) => {
    const enPaths = new Set(keyPaths(item.en));
    const enLeaves = leafValues(item.en);
    for (const lang of LANGS) {
      if (lang === 'en' || !(lang in item)) continue;
      const langPaths = new Set(keyPaths(item[lang]));
      const missing = [...enPaths].filter((p) => !langPaths.has(p));
      const extra = [...langPaths].filter((p) => !enPaths.has(p));
      if (missing.length || extra.length) {
        issues.push({ label, index, lang, missing, extra });
      }
      const langLeaves = leafValues(item[lang]);
      const empty = Object.keys(langLeaves).filter((path) => {
        const v = langLeaves[path];
        return typeof v === 'string' && v.trim() === '' && typeof enLeaves[path] === 'string' && enLeaves[path].trim() !== '';
      });
      if (empty.length) issues.push({ label, index, lang, emptyValues: empty });
    }
  });
  return issues;
}

describe('content module structural completeness (src/i18n/content.js)', () => {
  it.each([
    ['PLAN_TEXT', PLAN_TEXT],
    ['VALUES_TEXT', VALUES_TEXT],
    ['UI_TEXT', UI_TEXT],
    ['TOOLS_TEXT', TOOLS_TEXT],
    ['TOOLS_HUB_TEXT', TOOLS_HUB_TEXT],
  ])('%s: every present language matches en structurally, no empty values', (name, mod) => {
    expect(langParityIssues([mod], { label: name })).toEqual([]);
  });
});

describe('content module structural completeness (src/data/faqItems.js)', () => {
  it('every FAQ item: every present language matches en structurally, no empty values', () => {
    expect(langParityIssues(faqItems, { label: 'faqItems' })).toEqual([]);
  });
});

describe('content module structural completeness (src/i18n/adhkarText.js)', () => {
  it('every ADHKAR_TR item: every present language matches en structurally, no empty values (ar is legitimately absent by design -- see sourceTr())', () => {
    const items = Object.values(ADHKAR_TR);
    const issues = langParityIssues(items, { label: 'ADHKAR_TR' });
    expect(issues.filter((i) => i.lang === 'ar')).toEqual([]); // sanity: ar truly never present, not silently broken
    expect(issues).toEqual([]);
  });
});

describe('content module structural completeness (src/data/marketing/teachers.js)', () => {
  it('every teacher\'s title/bio/specialties: every present language matches en structurally, no empty values', () => {
    const titleIssues = langParityIssues(TEACHERS.map((t) => t.title), { label: 'TEACHERS[].title' });
    const bioIssues = langParityIssues(TEACHERS.map((t) => t.bio), { label: 'TEACHERS[].bio' });
    const specialtyIssues = langParityIssues(TEACHERS.map((t) => t.specialties), { label: 'TEACHERS[].specialties' });
    expect([...titleIssues, ...bioIssues, ...specialtyIssues]).toEqual([]);
  });

  it('every shared TEACHER_CREDENTIALS label: every present language matches en structurally, no empty values', () => {
    const issues = langParityIssues(TEACHER_CREDENTIALS.map((c) => c.label), { label: 'TEACHER_CREDENTIALS[].label' });
    expect(issues).toEqual([]);
  });

  // Teachers.jsx/Teachers page -- Phase 2c small fix (2026-09-18): unlike
  // title/specialties (checked above since Phase 2a), bio was rendered
  // (teacher.bio[lang] || teacher.bio.en) but never structurally checked.
  // Confirmed here it/es/de/fr/ar were ALREADY genuinely present and
  // complete for all 11 teachers and all 4 credentials -- this sanity check
  // documents that this is a real finding, not a silent no-op.
  it('sanity: bio and credentials genuinely have all 6 languages present for every item (this check is not vacuous)', () => {
    const langs = ['en', 'ar', 'it', 'es', 'de', 'fr'];
    for (const teacher of TEACHERS) {
      expect(Object.keys(teacher.bio).sort()).toEqual([...langs].sort());
    }
    for (const cred of TEACHER_CREDENTIALS) {
      expect(Object.keys(cred.label).sort()).toEqual([...langs].sort());
    }
  });
});

describe('content module structural completeness (src/i18n/courses/ijazah.js -- Phase 2b)', () => {
  it('ar matches en structurally, no empty values (it/es/de/fr are legitimately absent -- not migrated yet, stay draft)', () => {
    const issues = langParityIssues([IJAZAH_TEXT], { label: 'IJAZAH_TEXT' });
    expect(issues.filter((i) => ['it', 'es', 'de', 'fr'].includes(i.lang))).toEqual([]); // sanity: genuinely absent, not silently broken
    expect(issues).toEqual([]);
  });
});

describe('content module structural completeness (src/i18n/courses/islamic-studies.js -- Phase 2c)', () => {
  it('ar matches en structurally, no empty values (it/es/de/fr are legitimately absent -- not migrated yet, stay draft)', () => {
    const issues = langParityIssues([ISLAMIC_STUDIES_TEXT], { label: 'ISLAMIC_STUDIES_TEXT' });
    expect(issues.filter((i) => ['it', 'es', 'de', 'fr'].includes(i.lang))).toEqual([]); // sanity: genuinely absent, not silently broken
    expect(issues).toEqual([]);
  });
});

describe('content module structural completeness (src/i18n/tools/*.js -- Phase 4)', () => {
  it.each([
    ['PRAYER_TIMES_TEXT', PRAYER_TIMES_TEXT],
    ['QIBLA_TEXT', QIBLA_TEXT],
    ['ISLAMIC_CALENDAR_TEXT', ISLAMIC_CALENDAR_TEXT],
    ['TASBEEH_TEXT', TASBEEH_TEXT],
    ['TAJWEED_CHECKER_TEXT', TAJWEED_CHECKER_TEXT],
    ['HIFZ_REVIEW_TEXT', HIFZ_REVIEW_TEXT],
    ['RELATED_TOOLS_TEXT', RELATED_TOOLS_TEXT],
  ])('%s: ar matches en structurally, no empty values (it/es/de/fr are legitimately absent -- not migrated, stay legacy)', (name, mod) => {
    const issues = langParityIssues([mod], { label: name });
    expect(issues.filter((i) => ['it', 'es', 'de', 'fr'].includes(i.lang))).toEqual([]); // sanity: genuinely absent, not silently broken
    expect(issues).toEqual([]);
  });

  it('HifzReviewPage.jsx\'s structural QUALITY_LEVELS keys exactly match HIFZ_REVIEW_TEXT.quality -- no orphaned structural id, no orphaned text', () => {
    const structuralKeys = QUALITY_LEVELS.map((l) => l.key).sort();
    expect(Object.keys(HIFZ_REVIEW_TEXT.en.quality).sort()).toEqual(structuralKeys);
    expect(Object.keys(HIFZ_REVIEW_TEXT.ar.quality).sort()).toEqual(structuralKeys);
  });
});

describe('content module structural completeness (src/i18n/hadith/collections.js -- Hadith Library Source Recovery)', () => {
  it('HADITH_COLLECTIONS_TEXT: ar matches en structurally, no empty values (it/es/de/fr are legitimately absent -- not started, stay legacy)', () => {
    const issues = langParityIssues([HADITH_COLLECTIONS_TEXT], { label: 'HADITH_COLLECTIONS_TEXT' });
    expect(issues.filter((i) => ['it', 'es', 'de', 'fr'].includes(i.lang))).toEqual([]); // sanity: genuinely absent, not silently broken
    expect(issues).toEqual([]);
  });

  it('every HADITH_COLLECTIONS[].id has a matching entry in HADITH_COLLECTIONS_TEXT.en and .ar -- no orphaned structural id, no orphaned text', () => {
    const structuralIds = HADITH_COLLECTIONS.map((c) => c.id).sort();
    const { dir: _enDir, ...enEntries } = HADITH_COLLECTIONS_TEXT.en;
    const { dir: _arDir, ...arEntries } = HADITH_COLLECTIONS_TEXT.ar;
    expect(Object.keys(enEntries).sort()).toEqual(structuralIds);
    expect(Object.keys(arEntries).sort()).toEqual(structuralIds);
  });
});

// Ties the registry's 'published' claims to the actual checked modules
// above, generically -- so this activates automatically the moment a
// future phase promotes a module-backed route/language to 'published',
// without needing this file edited again.
const KNOWN_MODULE_CHECKS = {
  'src/i18n/content.js': () => langParityIssues(
    [PLAN_TEXT, VALUES_TEXT, UI_TEXT, TOOLS_TEXT, TOOLS_HUB_TEXT],
    { label: 'content.js' },
  ),
  'src/data/faqItems.js': () => langParityIssues(faqItems, { label: 'faqItems' }),
  'src/i18n/adhkarText.js': () => langParityIssues(Object.values(ADHKAR_TR), { label: 'adhkarText' }),
  'src/i18n/courses/ijazah.js': () => langParityIssues([IJAZAH_TEXT], { label: 'IJAZAH_TEXT' }),
  'src/i18n/courses/islamic-studies.js': () => langParityIssues([ISLAMIC_STUDIES_TEXT], { label: 'ISLAMIC_STUDIES_TEXT' }),
  'src/data/marketing/teachers.js': () => [
    ...langParityIssues(TEACHERS.map((t) => t.title), { label: 'teachers.title' }),
    ...langParityIssues(TEACHERS.map((t) => t.bio), { label: 'teachers.bio' }),
    ...langParityIssues(TEACHERS.map((t) => t.specialties), { label: 'teachers.specialties' }),
    ...langParityIssues(TEACHER_CREDENTIALS.map((c) => c.label), { label: 'teachers.credentials' }),
  ],
};

describe('registry cross-check: a module-backed "published" language must pass its module\'s structural check', () => {
  it('every route/language published on the strength of a known content module has zero structural issues in that module', () => {
    const failures = [];
    for (const [route, entry] of Object.entries(TRANSLATION_STATUS)) {
      const moduleSource = entry.contentSources.find((f) => f in KNOWN_MODULE_CHECKS);
      if (!moduleSource) continue;
      for (const [lang, { status }] of Object.entries(entry.languages)) {
        if (lang === 'en' || status !== 'published') continue;
        const issues = KNOWN_MODULE_CHECKS[moduleSource]().filter((i) => i.lang === lang);
        if (issues.length) failures.push({ route, lang, moduleSource, issues });
      }
    }
    expect(failures).toEqual([]);
  });

  it('sanity: the module-backed "published" set is exactly what remains published -- documents current state so the test above isn\'t silently vacuous, and catches an unreviewed promotion elsewhere', () => {
    // Arabic Cross-Page Shell Repair (2026-09-xx): '/courses/ijazah/ar' and
    // '/courses/islamic-studies/ar' were REMOVED from this list -- their
    // content modules are still structurally complete (IJAZAH_TEXT.ar /
    // ISLAMIC_STUDIES_TEXT.ar pass the checks above), but translationStatus.js
    // downgraded both routes' ar status to 'legacy' because the page SHELL
    // around that content (breadcrumb, JSON-LD/meta description) was found
    // to still leak English -- see translationStatus.js's own comment on
    // each route and translationStatus.test.js's dedicated test for this.
    const moduleBackedPublished = Object.entries(TRANSLATION_STATUS).flatMap(([route, entry]) => {
      const moduleSource = entry.contentSources.find((f) => f in KNOWN_MODULE_CHECKS);
      if (!moduleSource) return [];
      return Object.entries(entry.languages)
        .filter(([lang, { status }]) => lang !== 'en' && status === 'published')
        .map(([lang]) => `${route}/${lang}`);
    });
    expect(moduleBackedPublished).toEqual([
      '/academy/teachers/ar', '/academy/teachers/it', '/academy/teachers/es', '/academy/teachers/de', '/academy/teachers/fr',
    ]);
  });
});
