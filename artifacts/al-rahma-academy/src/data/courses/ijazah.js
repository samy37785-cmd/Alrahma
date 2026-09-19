// Language-agnostic structure for the Ijazah course page (Phase 2b
// migration, 2026-09-18). Per-language body text lives in
// src/i18n/courses/ijazah.js, keyed by these same `id`s. Colors/icons/links
// are visual/structural, not translated content, so they stay here rather
// than being duplicated per language.

// `source` is the raw Arabic title of the stage's reference book, shown
// unconditionally in the stage header regardless of viewed language (always
// dir="rtl") -- structural, not per-language text. The *body* line that
// combines it with an author/transliteration differently per language is
// `sourceLine` in src/i18n/courses/ijazah.js's stages[id].
export const IJAZAH_STAGES = [
  { id: 'foundation', num: '01', color: '#0b6e4f', source: 'تحفة الأطفال' },
  { id: 'intermediate', num: '02', color: '#1a5fa0', source: 'متن الجزرية' },
  { id: 'qiraat', num: '03', color: '#7a3a8a', source: 'متن الشاطبية' },
  { id: 'certification', num: '04', color: '#c8920a', source: 'مصحف المدينة النبوية' },
];

// `title`/`ar` are shown unconditionally regardless of language (the
// transliterated name and the raw Arabic name are both always visible on
// the book card -- see BookCard in CourseIjazah.jsx), so they are
// structural, not per-language text.
export const IJAZAH_BOOKS = [
  { id: 'tuhfat', icon: '📗', title: 'Tuhfat Al-Atfal', ar: 'تحفة الأطفال', link: null },
  { id: 'jazariyyah', icon: '📘', title: 'Matn Al-Jazariyyah', ar: 'متن الجزرية', link: null },
  { id: 'shatibiyyah', icon: '📙', title: 'Matn Al-Shatibiyyah', ar: 'متن الشاطبية', link: null },
  { id: 'madinah-mushaf', icon: '📕', title: "Madinah Mus'haf", ar: 'مصحف المدينة النبوية', link: 'https://quran.gov.sa' },
];
