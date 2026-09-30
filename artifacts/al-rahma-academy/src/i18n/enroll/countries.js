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
// standard French country name for each English label. Italian Batch 1B
// adds `it` the same way -- this is the second half of that batch's country
// names task: the trust-bar ticker (src/i18n/home/countries.js) and this
// Step1 form dropdown are two separate files/lists, and both had to gain
// `it` for a visitor booking a trial to see Italian country names
// end-to-end. es/de are still intentionally left undefined here (see
// countryLabel()'s fallback) -- they render the English name until a real
// translation pass covers them. The submitted `value` never changes.
export const COUNTRIES = [
  { value: 'United Kingdom', en: 'United Kingdom', ar: 'المملكة المتحدة', fr: 'Royaume-Uni', it: 'Regno Unito' },
  { value: 'Italy',          en: 'Italy',          ar: 'إيطاليا', fr: 'Italie', it: 'Italia' },
  { value: 'France',         en: 'France',         ar: 'فرنسا', fr: 'France', it: 'Francia' },
  { value: 'Germany',        en: 'Germany',        ar: 'ألمانيا', fr: 'Allemagne', it: 'Germania' },
  { value: 'Spain',          en: 'Spain',          ar: 'إسبانيا', fr: 'Espagne', it: 'Spagna' },
  { value: 'Netherlands',    en: 'Netherlands',    ar: 'هولندا', fr: 'Pays-Bas', it: 'Paesi Bassi' },
  { value: 'Belgium',        en: 'Belgium',        ar: 'بلجيكا', fr: 'Belgique', it: 'Belgio' },
  { value: 'Switzerland',    en: 'Switzerland',    ar: 'سويسرا', fr: 'Suisse', it: 'Svizzera' },
  { value: 'Austria',        en: 'Austria',        ar: 'النمسا', fr: 'Autriche', it: 'Austria' },
  { value: 'Sweden',         en: 'Sweden',         ar: 'السويد', fr: 'Suède', it: 'Svezia' },
  { value: 'Denmark',        en: 'Denmark',        ar: 'الدنمارك', fr: 'Danemark', it: 'Danimarca' },
  { value: 'Norway',         en: 'Norway',         ar: 'النرويج', fr: 'Norvège', it: 'Norvegia' },
  { value: 'United States',  en: 'United States',  ar: 'الولايات المتحدة', fr: 'États-Unis', it: 'Stati Uniti' },
  { value: 'Canada',         en: 'Canada',         ar: 'كندا', fr: 'Canada', it: 'Canada' },
  { value: 'Australia',      en: 'Australia',      ar: 'أستراليا', fr: 'Australie', it: 'Australia' },
  { value: 'New Zealand',    en: 'New Zealand',    ar: 'نيوزيلندا', fr: 'Nouvelle-Zélande', it: 'Nuova Zelanda' },
  { value: 'Egypt',          en: 'Egypt',          ar: 'مصر', fr: 'Égypte', it: 'Egitto' },
  { value: 'Saudi Arabia',   en: 'Saudi Arabia',   ar: 'السعودية', fr: 'Arabie saoudite', it: 'Arabia Saudita' },
  { value: 'UAE',            en: 'UAE',            ar: 'الإمارات', fr: 'Émirats arabes unis', it: 'Emirati Arabi Uniti' },
  { value: 'Qatar',          en: 'Qatar',          ar: 'قطر', fr: 'Qatar', it: 'Qatar' },
  { value: 'Kuwait',         en: 'Kuwait',          ar: 'الكويت', fr: 'Koweït', it: 'Kuwait' },
  { value: 'Jordan',         en: 'Jordan',          ar: 'الأردن', fr: 'Jordanie', it: 'Giordania' },
  { value: 'Morocco',        en: 'Morocco',         ar: 'المغرب', fr: 'Maroc', it: 'Marocco' },
  { value: 'Tunisia',        en: 'Tunisia',         ar: 'تونس', fr: 'Tunisie', it: 'Tunisia' },
  { value: 'Algeria',        en: 'Algeria',         ar: 'الجزائر', fr: 'Algérie', it: 'Algeria' },
  { value: 'Turkey',         en: 'Turkey',          ar: 'تركيا', fr: 'Turquie', it: 'Turchia' },
  { value: 'Other',          en: 'Other',           ar: 'أخرى', fr: 'Autre', it: 'Altro' },
];

// entry[lang] is undefined for any language without a real translation
// (currently everything except en/ar/fr), so this always falls back to the
// English name rather than ever returning undefined or inventing text.
export function countryLabel(value, lang) {
  const entry = COUNTRIES.find((c) => c.value === value);
  if (!entry) return value;
  return entry[lang] || entry.en;
}
