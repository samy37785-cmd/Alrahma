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
// en/ar are the original labels; fr (French Localization Batch 1C) gives the
// standard French country name for each English label. it/es/de are
// intentionally left undefined here (see countryLabel()'s fallback) -- they
// render the English name until a real translation pass covers them. The
// submitted `value` never changes.
export const COUNTRIES = [
  { value: 'United Kingdom', en: 'United Kingdom', ar: 'المملكة المتحدة', fr: 'Royaume-Uni' },
  { value: 'Italy',          en: 'Italy',          ar: 'إيطاليا', fr: 'Italie' },
  { value: 'France',         en: 'France',         ar: 'فرنسا', fr: 'France' },
  { value: 'Germany',        en: 'Germany',        ar: 'ألمانيا', fr: 'Allemagne' },
  { value: 'Spain',          en: 'Spain',          ar: 'إسبانيا', fr: 'Espagne' },
  { value: 'Netherlands',    en: 'Netherlands',    ar: 'هولندا', fr: 'Pays-Bas' },
  { value: 'Belgium',        en: 'Belgium',        ar: 'بلجيكا', fr: 'Belgique' },
  { value: 'Switzerland',    en: 'Switzerland',    ar: 'سويسرا', fr: 'Suisse' },
  { value: 'Austria',        en: 'Austria',        ar: 'النمسا', fr: 'Autriche' },
  { value: 'Sweden',         en: 'Sweden',         ar: 'السويد', fr: 'Suède' },
  { value: 'Denmark',        en: 'Denmark',        ar: 'الدنمارك', fr: 'Danemark' },
  { value: 'Norway',         en: 'Norway',         ar: 'النرويج', fr: 'Norvège' },
  { value: 'United States',  en: 'United States',  ar: 'الولايات المتحدة', fr: 'États-Unis' },
  { value: 'Canada',         en: 'Canada',         ar: 'كندا', fr: 'Canada' },
  { value: 'Australia',      en: 'Australia',      ar: 'أستراليا', fr: 'Australie' },
  { value: 'New Zealand',    en: 'New Zealand',    ar: 'نيوزيلندا', fr: 'Nouvelle-Zélande' },
  { value: 'Egypt',          en: 'Egypt',          ar: 'مصر', fr: 'Égypte' },
  { value: 'Saudi Arabia',   en: 'Saudi Arabia',   ar: 'السعودية', fr: 'Arabie saoudite' },
  { value: 'UAE',            en: 'UAE',            ar: 'الإمارات', fr: 'Émirats arabes unis' },
  { value: 'Qatar',          en: 'Qatar',          ar: 'قطر', fr: 'Qatar' },
  { value: 'Kuwait',         en: 'Kuwait',          ar: 'الكويت', fr: 'Koweït' },
  { value: 'Jordan',         en: 'Jordan',          ar: 'الأردن', fr: 'Jordanie' },
  { value: 'Morocco',        en: 'Morocco',         ar: 'المغرب', fr: 'Maroc' },
  { value: 'Tunisia',        en: 'Tunisia',         ar: 'تونس', fr: 'Tunisie' },
  { value: 'Algeria',        en: 'Algeria',         ar: 'الجزائر', fr: 'Algérie' },
  { value: 'Turkey',         en: 'Turkey',          ar: 'تركيا', fr: 'Turquie' },
  { value: 'Other',          en: 'Other',           ar: 'أخرى', fr: 'Autre' },
];

// entry[lang] is undefined for any language without a real translation
// (currently everything except en/ar/fr), so this always falls back to the
// English name rather than ever returning undefined or inventing text.
export function countryLabel(value, lang) {
  const entry = COUNTRIES.find((c) => c.value === value);
  if (!entry) return value;
  return entry[lang] || entry.en;
}
