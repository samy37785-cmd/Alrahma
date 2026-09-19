// Arabic Cross-Page Shell Repair (2026-09-xx): src/components/features/
// enrollment/EnrollWizard.jsx's country <select> renders the EXACT strings
// from its own `COUNTRIES` array as both the visible option text AND the
// value submitted to the backend (`form.country`, sent unchanged through
// submitEnrollment()). That submitted value must never change -- this file
// only supplies a DISPLAY-only Arabic label per country, keyed by the exact
// English string EnrollWizard.jsx already uses as its option value, so the
// two can be looked up together without ever touching the value itself.
//
// Deliberately Arabic-only for now (matches this phase's scope -- it/es/de/
// fr are not started here). A country with no entry here simply falls back
// to its English name in EnrollWizard.jsx, exactly as it did before this
// file existed -- adding this file cannot make any language's display worse
// than it already was.
export const ENROLL_COUNTRY_NAMES_AR = {
  'United Kingdom': 'المملكة المتحدة',
  'Italy': 'إيطاليا',
  'France': 'فرنسا',
  'Germany': 'ألمانيا',
  'Spain': 'إسبانيا',
  'Netherlands': 'هولندا',
  'Belgium': 'بلجيكا',
  'Switzerland': 'سويسرا',
  'Austria': 'النمسا',
  'Sweden': 'السويد',
  'Denmark': 'الدنمارك',
  'Norway': 'النرويج',
  'United States': 'الولايات المتحدة',
  'Canada': 'كندا',
  'Australia': 'أستراليا',
  'New Zealand': 'نيوزيلندا',
  'Egypt': 'مصر',
  'Saudi Arabia': 'المملكة العربية السعودية',
  'UAE': 'الإمارات العربية المتحدة',
  'Qatar': 'قطر',
  'Kuwait': 'الكويت',
  'Jordan': 'الأردن',
  'Morocco': 'المغرب',
  'Tunisia': 'تونس',
  'Algeria': 'الجزائر',
  'Turkey': 'تركيا',
  'Other': 'دولة أخرى',
};
