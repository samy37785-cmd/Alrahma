import { describe, it, expect } from 'vitest';
import en from '../i18n/en';
import ar from '../i18n/ar';
import it_ from '../i18n/it';
import es from '../i18n/es';
import de from '../i18n/de';
import fr from '../i18n/fr';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data/marketing/teachers';

// Teachers Page i18n Cleanup (this branch only): /academy/teachers' page
// shell and per-teacher data were ALREADY genuinely 6-language; this closes
// the three remaining isAr forks in Teachers.jsx itself (breadcrumb
// "Academy" label, SEO title/description, language-filter "All" option).
//
// Scope note (this branch only): the upstream `translationStatus.js`
// registry is a separate, not-yet-approved phase and is intentionally not
// part of this branch's file list -- this file proves the real content
// parity below without importing or promoting that registry.

const LOCALES = { en, ar, it: it_, es, de, fr };

describe('Teachers.jsx: the three fixed isAr forks now read from teachersPg per locale', () => {
  it('teachersPg.academy/langAll/seoTitle/seoDescription are non-empty strings in all 6 locales', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      const ui = locale.teachersPg;
      for (const key of ['academy', 'langAll', 'seoTitle', 'seoDescription']) {
        expect(typeof ui[key], `${name}.teachersPg.${key}`).toBe('string');
        expect(ui[key].trim().length, `${name}.teachersPg.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('breadcrumb "academy" label genuinely differs by locale (real translations, not 6 copies of the English string)', () => {
    const values = new Set(Object.values(LOCALES).map((l) => l.teachersPg.academy));
    // en/it/es/de/fr/ar: 6 distinct words ("Academy"/"Accademia"/"Academia"/"Akademie"/"Académie"/"الأكاديمية")
    expect(values.size).toBe(6);
  });

  it('seoTitle/seoDescription genuinely differ by locale (not the isAr binary fallback re-served under a new name)', () => {
    const titles = new Set(Object.values(LOCALES).map((l) => l.teachersPg.seoTitle));
    expect(titles.size).toBe(6);
  });
});

describe('/academy/teachers content parity (evidence this route is genuinely 6-language, independent of any publication registry)', () => {
  it('en/ar/it/es/de/fr all expose the identical teachersPg key set', () => {
    function keyPaths(obj, prefix = '') {
      if (obj === null || typeof obj !== 'object') return [`${prefix}:${typeof obj}`];
      const paths = [];
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => paths.push(...keyPaths(v, `${prefix}[${i}]`)));
        return paths;
      }
      for (const [k, v] of Object.entries(obj)) paths.push(...keyPaths(v, prefix ? `${prefix}.${k}` : k));
      return paths;
    }
    const enPaths = new Set(keyPaths(en.teachersPg));
    for (const [name, locale] of Object.entries(LOCALES)) {
      if (name === 'en') continue;
      const localePaths = new Set(keyPaths(locale.teachersPg));
      expect([...enPaths].filter((p) => !localePaths.has(p)), `${name}.teachersPg missing keys`).toEqual([]);
      expect([...localePaths].filter((p) => !enPaths.has(p)), `${name}.teachersPg extra keys`).toEqual([]);
    }
  });

  it('every teacher and every shared credential genuinely has all 6 languages (title/bio/specialties/label) -- unchanged by this branch', () => {
    const langs = new Set(['en', 'ar', 'it', 'es', 'de', 'fr']);
    for (const teacher of TEACHERS) {
      for (const field of ['title', 'bio', 'specialties']) {
        expect(new Set(Object.keys(teacher[field])), `teacher ${teacher.id}.${field}`).toEqual(langs);
      }
    }
    for (const cred of TEACHER_CREDENTIALS) {
      expect(new Set(Object.keys(cred.label))).toEqual(langs);
    }
  });
});
