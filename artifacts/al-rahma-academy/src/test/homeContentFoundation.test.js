import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS } from '../i18n';
import { TRANSLATION_STATUS, isPublished } from '../data/translationStatus';
import { LEVEL_QUIZ_TEXT } from '../i18n/home/levelQuiz';
import { LEVEL_QUIZ_STEPS, LEVEL_QUIZ_RECOMMENDATIONS } from '../data/home/levelQuiz';
import { ISNAD_CHAIN_TEXT } from '../i18n/home/isnadChain';
import { ISNAD_CHAIN_NODES } from '../data/home/isnadChain';
import { COUNTRY_NAMES_TEXT } from '../i18n/home/countries';
import { TRUST_BAR_COUNTRIES } from '../data/home/countries';
import { HOME_LEAKED_STRINGS_TEXT, COURSE_OPTION_LABELS_TEXT, pickLeakedString, courseOptionLabel } from '../i18n/home/leakedStrings';
import { courseOptions } from '../data/marketing/courses';

// Home Content Foundation (2026-09-18): LevelQuiz.jsx and IsnadChain.jsx
// used to hardcode English content directly in JSX (no useLang import at
// all -- confirmed by search before this migration: neither file matched
// the isAr/lang==='ar' pattern noHardcodedBilingualContent.test.js already
// guards, because they had NO language handling whatsoever, not a binary
// English/Arabic fork). This file proves the four things this migration
// was required to establish, directly and by name -- not just relying on
// generic coverage elsewhere.
//
// Arabic Home Copy Implementation (2026-09-18): every content module below
// now has `en` AND `ar` -- ar sourced from docs/home-arabic-copy-approval-
// pack.md after a Claude editorial pass (Claude editorial approval pending
// human/Islamic review where applicable; NOT a human or Islamic-content
// reviewer sign-off). it/es/de/fr are still absent; nothing is invented for
// them. ISNAD_CHAIN_TEXT.ar.quote/citation are a deliberate, documented
// exception -- identical to the English strings, not translated, because no
// verified Arabic Hadith source exists yet (see that module's own comment).
// None of this promotes '/' to 'published' for `ar` -- see describe block 3.

const SRC_ROOT = join(import.meta.dirname, '..');
const LEVEL_QUIZ_JSX = readFileSync(join(SRC_ROOT, 'components/features/marketing/LevelQuiz.jsx'), 'utf8');
const ISNAD_CHAIN_JSX = readFileSync(join(SRC_ROOT, 'components/features/marketing/IsnadChain.jsx'), 'utf8');

function keyPaths(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') return [`${prefix}:${typeof obj}`];
  const paths = [];
  if (Array.isArray(obj)) {
    paths.push(`${prefix}:array(${obj.length})`);
    obj.forEach((value, index) => paths.push(...keyPaths(value, `${prefix}[${index}]`)));
    return paths;
  }
  for (const [key, value] of Object.entries(obj)) paths.push(...keyPaths(value, prefix ? `${prefix}.${key}` : key));
  return paths;
}

function leafValues(obj, prefix = '', leaves = {}) {
  if (Array.isArray(obj)) obj.forEach((v, i) => leafValues(v, `${prefix}[${i}]`, leaves));
  else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) leafValues(value, prefix ? `${prefix}.${key}` : key, leaves);
  } else leaves[prefix] = obj;
  return leaves;
}

describe('1. LevelQuiz.jsx / IsnadChain.jsx no longer contain hardcoded content outside the unified source', () => {
  // Exact strings that used to be inline literals in these two files,
  // before this migration -- if any of these text nodes reappear directly
  // in the component source, the migration regressed (content copy-pasted
  // back in instead of referenced from the content module).
  const LEVEL_QUIZ_FORMER_LITERALS = [
    'Find your course',
    '3 questions → your perfect lesson plan',
    'Can your child / you read Arabic?',
    'Not yet — starting from zero',
    'A few letters — needs practice',
    'Quran Memorization (Hifz)',
    'Start free trial — no card needed',
    '← Retake quiz',
  ];
  const ISNAD_CHAIN_FORMER_LITERALS = [
    'Our Legacy',
    'Every lesson is connected to',
    '1,400 years of unbroken transmission',
    'Received revelation in the Cave of Hira',
    'The best of you are those who learn the Quran and teach it.',
    'Sahih Al-Bukhari',
    'Give your child this gift',
    'Meet our Ijazah holders',
  ];

  it('LevelQuiz.jsx source contains none of its former hardcoded English text', () => {
    const found = LEVEL_QUIZ_FORMER_LITERALS.filter((s) => LEVEL_QUIZ_JSX.includes(s));
    expect(found).toEqual([]);
  });

  it('IsnadChain.jsx source contains none of its former hardcoded English text', () => {
    const found = ISNAD_CHAIN_FORMER_LITERALS.filter((s) => ISNAD_CHAIN_JSX.includes(s));
    expect(found).toEqual([]);
  });

  it('LevelQuiz.jsx now imports its text from the unified content module, not just structural data', () => {
    expect(LEVEL_QUIZ_JSX).toContain("from '../../../i18n/home/levelQuiz'");
    expect(LEVEL_QUIZ_JSX).toContain('useLang');
  });

  it('IsnadChain.jsx now imports its text from the unified content module, not just structural data', () => {
    expect(ISNAD_CHAIN_JSX).toContain("from '../../../i18n/home/isnadChain'");
    expect(ISNAD_CHAIN_JSX).toContain('useLang');
  });

  it('neither file has an isAr / lang===\'ar\' fork (also covered generically by noHardcodedBilingualContent.test.js now that both files are registered contentSources)', () => {
    expect(LEVEL_QUIZ_JSX).not.toMatch(/isAr|lang\s*===\s*'ar'/);
    expect(ISNAD_CHAIN_JSX).not.toMatch(/isAr|lang\s*===\s*'ar'/);
  });
});

describe('2. Every structural id has a matching English text entry, and vice versa', () => {
  it('LevelQuiz: every step id and every option id has English text', () => {
    for (const step of LEVEL_QUIZ_STEPS) {
      const stepText = LEVEL_QUIZ_TEXT.en.steps[step.id];
      expect(stepText, `missing en text for step "${step.id}"`).toBeDefined();
      expect(typeof stepText.question).toBe('string');
      expect(stepText.question.trim().length).toBeGreaterThan(0);
      for (const optId of step.optionIds) {
        expect(typeof stepText.options[optId], `missing en option text for ${step.id}.${optId}`).toBe('string');
        expect(stepText.options[optId].trim().length).toBeGreaterThan(0);
      }
      // no orphaned text entries with no matching structural option id
      expect(Object.keys(stepText.options).sort()).toEqual([...step.optionIds].sort());
    }
    // no orphaned step text entries with no matching structural step
    expect(Object.keys(LEVEL_QUIZ_TEXT.en.steps).sort()).toEqual(LEVEL_QUIZ_STEPS.map((s) => s.id).sort());
  });

  it('LevelQuiz: every recommendation id has English title/desc/badge, and a matching structural path entry', () => {
    for (const rec of LEVEL_QUIZ_RECOMMENDATIONS) {
      const recText = LEVEL_QUIZ_TEXT.en.recommendations[rec.id];
      expect(recText, `missing en text for recommendation "${rec.id}"`).toBeDefined();
      for (const field of ['title', 'desc', 'badge']) {
        expect(typeof recText[field], `${rec.id}.${field}`).toBe('string');
        expect(recText[field].trim().length).toBeGreaterThan(0);
      }
      expect(typeof rec.path).toBe('string');
      expect(rec.path.startsWith('/')).toBe(true);
    }
    expect(Object.keys(LEVEL_QUIZ_TEXT.en.recommendations).sort())
      .toEqual(LEVEL_QUIZ_RECOMMENDATIONS.map((r) => r.id).sort());
  });

  it('IsnadChain: every chain node id has English name/detail, and vice versa', () => {
    for (const node of ISNAD_CHAIN_NODES) {
      const nodeText = ISNAD_CHAIN_TEXT.en.nodes[node.id];
      expect(nodeText, `missing en text for node "${node.id}"`).toBeDefined();
      expect(nodeText.name.trim().length).toBeGreaterThan(0);
      expect(nodeText.detail.trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(ISNAD_CHAIN_TEXT.en.nodes).sort()).toEqual(ISNAD_CHAIN_NODES.map((n) => n.id).sort());
  });

  it('Countries: every ticker country id has an English display name, and vice versa', () => {
    for (const c of TRUST_BAR_COUNTRIES) {
      expect(typeof COUNTRY_NAMES_TEXT.en[c.id], `missing en name for country "${c.id}"`).toBe('string');
      expect(COUNTRY_NAMES_TEXT.en[c.id].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(COUNTRY_NAMES_TEXT.en).sort()).toEqual(TRUST_BAR_COUNTRIES.map((c) => c.id).sort());
  });

  it('no empty-string leaf anywhere in the English text of any new Home content module', () => {
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT.en', LEVEL_QUIZ_TEXT.en],
      ['ISNAD_CHAIN_TEXT.en', ISNAD_CHAIN_TEXT.en],
      ['COUNTRY_NAMES_TEXT.en', COUNTRY_NAMES_TEXT.en],
      ['HOME_LEAKED_STRINGS_TEXT.en', HOME_LEAKED_STRINGS_TEXT.en],
      ['COURSE_OPTION_LABELS_TEXT.en', COURSE_OPTION_LABELS_TEXT.en],
    ]) {
      const leaves = leafValues(mod);
      const empty = Object.entries(leaves).filter(([, v]) => typeof v === 'string' && v.trim() === '');
      expect(empty, label).toEqual([]);
    }
  });

  it('Trial course-of-interest: every canonical option value has an English display label, keyed by the exact submitted value (never renamed)', () => {
    for (const value of courseOptions) {
      expect(typeof COURSE_OPTION_LABELS_TEXT.en[value], `missing label for course option "${value}"`).toBe('string');
      expect(courseOptionLabel(value, 'en')).toBe(value); // en label == canonical value today, unchanged
    }
  });
});

describe('2b. Arabic structural parity (Arabic Home Copy Implementation, 2026-09-18)', () => {
  it('every new Home content module has exactly "en" and "ar" -- no it/es/de/fr key exists, nothing invented for them', () => {
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT', LEVEL_QUIZ_TEXT],
      ['ISNAD_CHAIN_TEXT', ISNAD_CHAIN_TEXT],
      ['COUNTRY_NAMES_TEXT', COUNTRY_NAMES_TEXT],
      ['HOME_LEAKED_STRINGS_TEXT', HOME_LEAKED_STRINGS_TEXT],
      ['COURSE_OPTION_LABELS_TEXT', COURSE_OPTION_LABELS_TEXT],
    ]) {
      expect(Object.keys(mod).sort(), label).toEqual(['ar', 'en']);
    }
  });

  it('ar has exactly the same key structure as en, for every new Home content module (no missing/extra keys)', () => {
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT', LEVEL_QUIZ_TEXT],
      ['ISNAD_CHAIN_TEXT', ISNAD_CHAIN_TEXT],
      ['COUNTRY_NAMES_TEXT', COUNTRY_NAMES_TEXT],
      ['HOME_LEAKED_STRINGS_TEXT', HOME_LEAKED_STRINGS_TEXT],
      ['COURSE_OPTION_LABELS_TEXT', COURSE_OPTION_LABELS_TEXT],
    ]) {
      const enPaths = new Set(keyPaths(mod.en));
      const arPaths = new Set(keyPaths(mod.ar));
      expect([...enPaths].filter((p) => !arPaths.has(p)), `${label}: ar missing keys`).toEqual([]);
      expect([...arPaths].filter((p) => !enPaths.has(p)), `${label}: ar has extra keys`).toEqual([]);
    }
  });

  it('no empty-string leaf anywhere in the Arabic text of any new Home content module', () => {
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT.ar', LEVEL_QUIZ_TEXT.ar],
      ['ISNAD_CHAIN_TEXT.ar', ISNAD_CHAIN_TEXT.ar],
      ['COUNTRY_NAMES_TEXT.ar', COUNTRY_NAMES_TEXT.ar],
      ['HOME_LEAKED_STRINGS_TEXT.ar', HOME_LEAKED_STRINGS_TEXT.ar],
      ['COURSE_OPTION_LABELS_TEXT.ar', COURSE_OPTION_LABELS_TEXT.ar],
    ]) {
      const leaves = leafValues(mod);
      const empty = Object.entries(leaves).filter(([, v]) => typeof v === 'string' && v.trim() === '');
      expect(empty, label).toEqual([]);
    }
  });

  it('every Arabic leaf actually contains Arabic-script characters (sanity check: catches an accidentally-left-English value)', () => {
    const ARABIC_RE = /[؀-ۿ]/;
    // quote/citation are the one documented, deliberate exception -- see
    // the next test, which proves that specific exception directly.
    const EXPECTED_ENGLISH = new Set(['ISNAD_CHAIN_TEXT.ar.quote', 'ISNAD_CHAIN_TEXT.ar.citation']);
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT.ar', LEVEL_QUIZ_TEXT.ar],
      ['ISNAD_CHAIN_TEXT.ar', ISNAD_CHAIN_TEXT.ar],
      ['COUNTRY_NAMES_TEXT.ar', COUNTRY_NAMES_TEXT.ar],
      ['HOME_LEAKED_STRINGS_TEXT.ar', HOME_LEAKED_STRINGS_TEXT.ar],
      ['COURSE_OPTION_LABELS_TEXT.ar', COURSE_OPTION_LABELS_TEXT.ar],
    ]) {
      const leaves = leafValues(mod);
      const nonArabic = Object.entries(leaves)
        .filter(([path, v]) => typeof v === 'string' && !ARABIC_RE.test(v))
        .map(([path]) => `${label}.${path}`)
        .filter((full) => !EXPECTED_ENGLISH.has(full));
      expect(nonArabic).toEqual([]);
    }
  });

  it('ISNAD_CHAIN_TEXT.ar.quote/citation are the documented exception: identical to en, not translated, not invented', () => {
    expect(ISNAD_CHAIN_TEXT.ar.quote).toBe(ISNAD_CHAIN_TEXT.en.quote);
    expect(ISNAD_CHAIN_TEXT.ar.citation).toBe(ISNAD_CHAIN_TEXT.en.citation);
  });

  it('Trial course-of-interest: every canonical option value has an Arabic display label, and the submitted value itself is untouched', () => {
    for (const value of courseOptions) {
      expect(typeof COURSE_OPTION_LABELS_TEXT.ar[value], `missing ar label for course option "${value}"`).toBe('string');
      expect(COURSE_OPTION_LABELS_TEXT.ar[value].trim().length).toBeGreaterThan(0);
      expect(courseOptionLabel(value, 'ar')).toBe(COURSE_OPTION_LABELS_TEXT.ar[value]);
      // the canonical value itself (what Trial.jsx submits) is unchanged by this phase
      expect(COURSE_OPTION_LABELS_TEXT.en[value]).toBe(value);
    }
  });

  it('pickLeakedString/courseOptionLabel return real Arabic text for lang="ar" (not the English fallback)', () => {
    expect(pickLeakedString('mostPopularCourseBadge', 'ar')).toBe('الأكثر طلبًا');
    expect(pickLeakedString('startFreeTrialLink', 'ar')).toBe('ابدأ تجربتك المجانية');
    expect(pickLeakedString('featuredTutorBadge', 'ar')).toBe('المعلم المميز');
    expect(pickLeakedString('browseFullCurriculum', 'ar')).toBe('تصفّح المنهج الكامل');
    expect(pickLeakedString('playQuranLabel', 'ar')).toBe('تشغيل القرآن');
    expect(pickLeakedString('refundWindowStat', 'ar')).toBe('24 يومًا');
    expect(courseOptionLabel('Quran Ijazah', 'ar')).toBe('إجازة القرآن الكريم');
  });
});

describe('3. A missing/incomplete language is never treated as published', () => {
  it('it/es/de/fr still have no key in any new Home content module -- direct proof nothing was invented for them', () => {
    for (const [label, mod] of [
      ['LEVEL_QUIZ_TEXT', LEVEL_QUIZ_TEXT],
      ['ISNAD_CHAIN_TEXT', ISNAD_CHAIN_TEXT],
      ['COUNTRY_NAMES_TEXT', COUNTRY_NAMES_TEXT],
      ['HOME_LEAKED_STRINGS_TEXT', HOME_LEAKED_STRINGS_TEXT],
      ['COURSE_OPTION_LABELS_TEXT', COURSE_OPTION_LABELS_TEXT],
    ]) {
      for (const lang of ['it', 'es', 'de', 'fr']) {
        expect(mod[lang], `${label}.${lang} should not exist`).toBeUndefined();
      }
    }
  });

  it('"/" is still not published for any non-English language in the registry (unchanged by this migration)', () => {
    for (const lang of ['ar', 'it', 'es', 'de', 'fr']) {
      expect(TRANSLATION_STATUS['/'].languages[lang].status).not.toBe('published');
      expect(TRANSLATION_STATUS['/'].languages[lang].status).toBe('legacy');
    }
  });

  it('isPublished(\'/\', lang) is unaffected for every language LANGS knows about (en true, others unchanged from before this migration)', () => {
    expect(isPublished('/', 'en')).toBe(true);
    for (const lang of LANGS) {
      if (lang === 'en') continue;
      // legacy renders normally today (pre-existing behavior) -- this
      // migration must not have silently flipped that to blocked (draft)
      // or to a false claim of a finished translation (published).
      expect(TRANSLATION_STATUS['/'].languages[lang]?.status).toBe('legacy');
    }
  });

  it('it/es/de/fr lookups on any new content module still fall back to English text, never to undefined/empty (pick* helpers behave correctly for a genuinely absent language)', () => {
    for (const lang of ['it', 'es', 'de', 'fr']) {
      expect(LEVEL_QUIZ_TEXT[lang] || LEVEL_QUIZ_TEXT.en).toBe(LEVEL_QUIZ_TEXT.en);
      expect(ISNAD_CHAIN_TEXT[lang] || ISNAD_CHAIN_TEXT.en).toBe(ISNAD_CHAIN_TEXT.en);
      expect(pickLeakedString('playQuranLabel', lang)).toBe('Play Quran');
      expect(courseOptionLabel('Quran Ijazah', lang)).toBe('Quran Ijazah');
    }
  });

  it('an "ar" lookup uses its own real content module, not the English fallback (proves ar is genuinely present, not a silent pass-through)', () => {
    expect(LEVEL_QUIZ_TEXT.ar).not.toBe(LEVEL_QUIZ_TEXT.en);
    expect(ISNAD_CHAIN_TEXT.ar).not.toBe(ISNAD_CHAIN_TEXT.en);
    expect(pickLeakedString('playQuranLabel', 'ar')).not.toBe('Play Quran');
    expect(courseOptionLabel('Quran Ijazah', 'ar')).not.toBe('Quran Ijazah');
  });

  it('registry contentSources for "/" point at the real new module files (no stale/typo\'d paths)', () => {
    const sources = TRANSLATION_STATUS['/'].contentSources;
    for (const f of [
      'src/i18n/home/levelQuiz.js',
      'src/i18n/home/isnadChain.js',
      'src/i18n/home/countries.js',
      'src/i18n/home/leakedStrings.js',
      'src/data/home/levelQuiz.js',
      'src/data/home/isnadChain.js',
      'src/data/home/countries.js',
    ]) {
      expect(sources, f).toContain(f);
    }
  });
});
