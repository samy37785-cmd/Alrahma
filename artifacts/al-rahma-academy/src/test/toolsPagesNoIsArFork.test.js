// @vitest-environment node
//
// Arabic Tools Content Migration (Phase 4, 2026-09-18). Dedicated,
// explicitly-named guard (mirrors src/test/breadcrumbNoHardcodedEnglish.
// test.js's convention) over the exact six routes named in this phase's
// scope: proves each page's source no longer contains the isAr/
// lang==='ar' ternary content-fork pattern this migration removed. This is
// a static-source regex check, independent of and in addition to
// noHardcodedBilingualContent.test.js's real-AST-based guard (which also
// covers these six files now that they were removed from
// GRANDFATHERED_FILES) -- kept as a second, narrowly-named check that
// fails with an unambiguous message if any of these specific six pages
// ever regresses.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(import.meta.dirname, '..');

const PAGES = [
  'pages/tools/PrayerTimesPage.jsx',
  'pages/tools/QiblaPage.jsx',
  'pages/tools/IslamicCalendarPage.jsx',
  'pages/tools/TasbeehPage.jsx',
  'pages/tools/TajweedCheckerPage.jsx',
  'pages/tools/HifzReviewPage.jsx',
];

// Matches the same anti-pattern noHardcodedBilingualContent.test.js's AST
// walker flags: `isAr ? ... : ...` or `lang === 'ar' ? ... : ...` /
// `lang==='ar'?...`. Comments referencing the pattern by name (e.g. this
// file's own module comment, or the two explanatory comments left in
// PrayerTimesPage.jsx/IslamicCalendarPage.jsx documenting their non-ternary
// helper functions) do not match this regex -- it requires the literal `?`
// that only a real ternary has.
const IS_AR_TERNARY = /(isAr|lang\s*===\s*['"]ar['"])\s*\?/;

describe('Phase 4 tool pages: no isAr/lang===\'ar\' ternary content fork remains', () => {
  it.each(PAGES)('%s does not match the isAr-ternary fork pattern', (relPath) => {
    const source = readFileSync(join(SRC_ROOT, relPath), 'utf8');
    expect(source).not.toMatch(IS_AR_TERNARY);
  });

  it('sanity: the regex actually matches the old anti-pattern (not vacuously passing)', () => {
    expect("isAr ? 'مواقيت الصلاة' : 'Prayer Times'").toMatch(IS_AR_TERNARY);
    expect(`lang === 'ar' ? hijri.weekday.ar : hijri.weekday.en`).toMatch(IS_AR_TERNARY);
  });

  it('every named page imports its new Phase 4 content module (proves the fix is the unified-content migration, not just deletion)', () => {
    const expectedImport = {
      'pages/tools/PrayerTimesPage.jsx': /from ['"].*i18n\/tools\/prayerTimes['"]/,
      'pages/tools/QiblaPage.jsx': /from ['"].*i18n\/tools\/qibla['"]/,
      'pages/tools/IslamicCalendarPage.jsx': /from ['"].*i18n\/tools\/islamicCalendar['"]/,
      'pages/tools/TasbeehPage.jsx': /from ['"].*i18n\/tools\/tasbeeh['"]/,
      'pages/tools/TajweedCheckerPage.jsx': /from ['"].*i18n\/tools\/tajweedChecker['"]/,
      'pages/tools/HifzReviewPage.jsx': /from ['"].*i18n\/tools\/hifzReview['"]/,
    };
    for (const relPath of PAGES) {
      const source = readFileSync(join(SRC_ROOT, relPath), 'utf8');
      expect(source, `${relPath} should import its Phase 4 content module`).toMatch(expectedImport[relPath]);
    }
  });
});
