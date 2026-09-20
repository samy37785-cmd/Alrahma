// Enroll Step1 country list (2026-09-20): the <select> previously rendered
// hardcoded English country names as BOTH the visible option text and the
// value submitted with a booking request (the old <option key={c}>{c}</option>
// had no explicit `value`, so an option's value defaulted to its own text
// content). Localizing the visible text without keeping a separate, stable
// `value` would have silently changed what a booking request submits for
// `country`. This file fixes that by separating the two: `value` stays
// byte-identical to the original COUNTRIES array (same 27 entries, same
// order, same strings -- see enrollCountryLabels.test.js), and a display
// label is added per language.
//
// Only en/ar are real, reviewed translations. it/es/de/fr are intentionally
// left undefined here (see countryLabel()'s fallback) rather than filled
// with invented/unreviewed translations -- they render the English name
// until a real translation pass covers them.
export const COUNTRIES = [
  { value: 'United Kingdom', en: 'United Kingdom', ar: 'المملكة المتحدة' },
  { value: 'Italy',          en: 'Italy',          ar: 'إيطاليا' },
  { value: 'France',         en: 'France',         ar: 'فرنسا' },
  { value: 'Germany',        en: 'Germany',        ar: 'ألمانيا' },
  { value: 'Spain',          en: 'Spain',          ar: 'إسبانيا' },
  { value: 'Netherlands',    en: 'Netherlands',    ar: 'هولندا' },
  { value: 'Belgium',        en: 'Belgium',        ar: 'بلجيكا' },
  { value: 'Switzerland',    en: 'Switzerland',    ar: 'سويسرا' },
  { value: 'Austria',        en: 'Austria',        ar: 'النمسا' },
  { value: 'Sweden',         en: 'Sweden',         ar: 'السويد' },
  { value: 'Denmark',        en: 'Denmark',        ar: 'الدنمارك' },
  { value: 'Norway',         en: 'Norway',         ar: 'النرويج' },
  { value: 'United States',  en: 'United States',  ar: 'الولايات المتحدة' },
  { value: 'Canada',         en: 'Canada',         ar: 'كندا' },
  { value: 'Australia',      en: 'Australia',      ar: 'أستراليا' },
  { value: 'New Zealand',    en: 'New Zealand',    ar: 'نيوزيلندا' },
  { value: 'Egypt',          en: 'Egypt',          ar: 'مصر' },
  { value: 'Saudi Arabia',   en: 'Saudi Arabia',   ar: 'السعودية' },
  { value: 'UAE',            en: 'UAE',            ar: 'الإمارات' },
  { value: 'Qatar',          en: 'Qatar',          ar: 'قطر' },
  { value: 'Kuwait',         en: 'Kuwait',          ar: 'الكويت' },
  { value: 'Jordan',         en: 'Jordan',          ar: 'الأردن' },
  { value: 'Morocco',        en: 'Morocco',         ar: 'المغرب' },
  { value: 'Tunisia',        en: 'Tunisia',         ar: 'تونس' },
  { value: 'Algeria',        en: 'Algeria',         ar: 'الجزائر' },
  { value: 'Turkey',         en: 'Turkey',          ar: 'تركيا' },
  { value: 'Other',          en: 'Other',           ar: 'أخرى' },
];

// entry[lang] is undefined for any language without a real translation
// (currently everything except en/ar), so this always falls back to the
// English name rather than ever returning undefined or inventing text.
export function countryLabel(value, lang) {
  const entry = COUNTRIES.find((c) => c.value === value);
  if (!entry) return value;
  return entry[lang] || entry.en;
}
