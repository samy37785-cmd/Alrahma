// Home Content Foundation (2026-09-18): per-language display names for
// TrustBar's scrolling country ticker, migrated LITERALLY from the inline
// `COUNTRIES` const's `name` fields in
// src/components/features/marketing/TrustBar.jsx -- no wording changed.
// Keyed by the same ids as src/data/home/countries.js's TRUST_BAR_COUNTRIES.
//
// Arabic Home Copy Implementation (2026-09-18): `ar` was added below from
// docs/home-arabic-copy-approval-pack.md's section 4, Claude editorial
// approval pending human/Islamic review where applicable -- standard MSA
// country names, no corrections needed from that draft. it/es/de/fr still
// stay absent; nothing is invented for them here.
export const COUNTRY_NAMES_TEXT = {
  en: {
    gb: 'UK',
    de: 'Germany',
    fr: 'France',
    it: 'Italy',
    es: 'Spain',
    nl: 'Netherlands',
    us: 'USA',
    ca: 'Canada',
    au: 'Australia',
    se: 'Sweden',
    no: 'Norway',
    be: 'Belgium',
    ch: 'Switzerland',
    at: 'Austria',
    dk: 'Denmark',
    pt: 'Portugal',
    gr: 'Greece',
    pl: 'Poland',
    tr: 'Turkey',
    sa: 'Saudi Arabia',
    ae: 'UAE',
    my: 'Malaysia',
    uz: 'Uzbekistan',
    idn: 'Indonesia',
    za: 'South Africa',
  },
  ar: {
    gb: 'المملكة المتحدة',
    de: 'ألمانيا',
    fr: 'فرنسا',
    it: 'إيطاليا',
    es: 'إسبانيا',
    nl: 'هولندا',
    us: 'الولايات المتحدة',
    ca: 'كندا',
    au: 'أستراليا',
    se: 'السويد',
    no: 'النرويج',
    be: 'بلجيكا',
    ch: 'سويسرا',
    at: 'النمسا',
    dk: 'الدنمارك',
    pt: 'البرتغال',
    gr: 'اليونان',
    pl: 'بولندا',
    tr: 'تركيا',
    sa: 'المملكة العربية السعودية',
    ae: 'الإمارات العربية المتحدة',
    my: 'ماليزيا',
    uz: 'أوزبكستان',
    idn: 'إندونيسيا',
    za: 'جنوب أفريقيا',
  },
};
