// Micro-fix: Teacher Profile Language Names (2026-09-xx).
//
// Shared, neutral i18n source for "what a language is called", TRANSLATED
// INTO the visitor's own interface language -- e.g. on the Arabic site,
// every language name (including English's own name) is shown in Arabic:
// "الإنجليزية", "العربية", "الإسبانية"... This is a different, unrelated
// concept from LangSwitcher.jsx's own language list, which intentionally
// shows each language's NATIVE self-name ("English", "العربية", "Italiano")
// regardless of the current UI language -- that is a deliberate part of the
// language-picker's own UX (a visitor scanning for their language reads its
// native spelling, not a translation of it) and is untouched by this file.
//
// Keyed first by the CURRENT UI language, then by the language code being
// named. Any page that needs to display "this content/person speaks
// language X" in the visitor's own language should import from here rather
// than hand-writing a second, possibly-drifting list (see
// TeacherProfile.jsx for the first real consumer).
export const LANGUAGE_NAMES_TEXT = {
  en: { en: 'English', ar: 'Arabic', it: 'Italian', es: 'Spanish', de: 'German', fr: 'French' },
  ar: { en: 'الإنجليزية', ar: 'العربية', it: 'الإيطالية', es: 'الإسبانية', de: 'الألمانية', fr: 'الفرنسية' },
  it: { en: 'Inglese', ar: 'Arabo', it: 'Italiano', es: 'Spagnolo', de: 'Tedesco', fr: 'Francese' },
  es: { en: 'Inglés', ar: 'Árabe', it: 'Italiano', es: 'Español', de: 'Alemán', fr: 'Francés' },
  de: { en: 'Englisch', ar: 'Arabisch', it: 'Italienisch', es: 'Spanisch', de: 'Deutsch', fr: 'Französisch' },
  fr: { en: 'Anglais', ar: 'Arabe', it: 'Italien', es: 'Espagnol', de: 'Allemand', fr: 'Français' },
};

// code: the language being named (e.g. a teacher's spoken language).
// uiLang: the visitor's current interface language.
// Safe fallback chain: an unrecognized uiLang falls back to the English
// bucket; a `code` not present even there falls back to the raw code
// itself (never throws, never renders "undefined").
export function getLanguageName(code, uiLang) {
  const bucket = LANGUAGE_NAMES_TEXT[uiLang] || LANGUAGE_NAMES_TEXT.en;
  return bucket[code] || LANGUAGE_NAMES_TEXT.en[code] || code;
}
