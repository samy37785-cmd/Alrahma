// @vitest-environment node
//
// Micro-fix: Teacher Profile Language Names (2026-09-xx). Guards two
// things: (1) src/i18n/languageNames.js itself is structurally complete for
// all 6 UI languages x all 6 named languages, with the Arabic values the
// user mandated explicitly; (2) TeacherProfile.jsx no longer imports a
// content-display value from LangSwitcher.jsx (a UI component), and does
// not hand-roll a second, local language-name list instead of using the
// shared source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGE_NAMES_TEXT, getLanguageName } from '../i18n/languageNames';

const LANGS = ['en', 'ar', 'it', 'es', 'de', 'fr'];
const SRC_ROOT = join(import.meta.dirname, '..');

describe('src/i18n/languageNames.js: structural completeness', () => {
  it('every UI language has an entry for all 6 languages, no empty values', () => {
    for (const uiLang of LANGS) {
      expect(LANGUAGE_NAMES_TEXT, `missing UI bucket for ${uiLang}`).toHaveProperty(uiLang);
      for (const code of LANGS) {
        const value = LANGUAGE_NAMES_TEXT[uiLang][code];
        expect(typeof value === 'string' && value.trim() !== '', `${uiLang}.${code} is empty/missing`).toBe(true);
      }
    }
  });

  it('the Arabic UI bucket matches the mandated values exactly', () => {
    expect(LANGUAGE_NAMES_TEXT.ar).toEqual({
      en: 'الإنجليزية',
      ar: 'العربية',
      it: 'الإيطالية',
      es: 'الإسبانية',
      de: 'الألمانية',
      fr: 'الفرنسية',
    });
  });

  it('getLanguageName() falls back to the English bucket for an unrecognized UI language', () => {
    expect(getLanguageName('ar', 'xx')).toBe(LANGUAGE_NAMES_TEXT.en.ar);
  });

  it('getLanguageName() falls back to the raw code for a truly unknown language code', () => {
    expect(getLanguageName('xx', 'ar')).toBe('xx');
  });

  it('getLanguageName() returns the real translated name for every (uiLang, code) pair', () => {
    for (const uiLang of LANGS) {
      for (const code of LANGS) {
        expect(getLanguageName(code, uiLang)).toBe(LANGUAGE_NAMES_TEXT[uiLang][code]);
      }
    }
  });
});

describe('TeacherProfile.jsx: no longer depends on LangSwitcher.jsx, uses the shared source', () => {
  const source = readFileSync(join(SRC_ROOT, 'pages', 'TeacherProfile.jsx'), 'utf8');

  it('does not import anything from components/ui/LangSwitcher', () => {
    expect(source).not.toMatch(/from ['"].*LangSwitcher['"]/);
  });

  it('imports getLanguageName from the shared src/i18n/languageNames.js source', () => {
    expect(source).toMatch(/import\s*\{\s*getLanguageName\s*\}\s*from\s*['"].*i18n\/languageNames['"]/);
  });

  it('does not declare a local language-name object literal (no new duplicate list)', () => {
    // The old, now-removed local pattern was a flat object literal keyed by
    // all 6 language codes with quoted English language-name values, e.g.
    // `{ en:'English', ar:'Arabic', ... }`. Its absence, combined with the
    // import assertion above, proves the page now reads from the single
    // shared source instead of hand-rolling a second list.
    expect(source).not.toMatch(/ar:\s*['"](Arabic|العربية)['"]/);
  });
});

describe('LangSwitcher.jsx: LANG_FULL is no longer exported (nothing else needs it)', () => {
  it('LANG_FULL is a local const, not a named export', () => {
    const source = readFileSync(join(SRC_ROOT, 'components', 'ui', 'LangSwitcher.jsx'), 'utf8');
    expect(source).toMatch(/^const LANG_FULL = \{/m);
    expect(source).not.toMatch(/^export const LANG_FULL/m);
  });
});
