// Home Content Foundation (2026-09-18): structural (language-agnostic) data
// for TrustBar's scrolling country ticker, extracted from the inline
// `COUNTRIES` const in src/components/features/marketing/TrustBar.jsx.
// Only stable ids and flag emoji live here -- the display name per
// language moved to src/i18n/home/countries.js, keyed by the same id.
//
// Scope note: this is TrustBar.jsx's own ticker only. TrustBadges.jsx has a
// separate, still-untouched 15-country list -- out of scope for this phase
// by explicit instruction (no data-source unification here).

export const TRUST_BAR_COUNTRIES = [
  { id: 'gb', flag: '🇬🇧' },
  { id: 'de', flag: '🇩🇪' },
  { id: 'fr', flag: '🇫🇷' },
  { id: 'it', flag: '🇮🇹' },
  { id: 'es', flag: '🇪🇸' },
  { id: 'nl', flag: '🇳🇱' },
  { id: 'us', flag: '🇺🇸' },
  { id: 'ca', flag: '🇨🇦' },
  { id: 'au', flag: '🇦🇺' },
  { id: 'se', flag: '🇸🇪' },
  { id: 'no', flag: '🇳🇴' },
  { id: 'be', flag: '🇧🇪' },
  { id: 'ch', flag: '🇨🇭' },
  { id: 'at', flag: '🇦🇹' },
  { id: 'dk', flag: '🇩🇰' },
  { id: 'pt', flag: '🇵🇹' },
  { id: 'gr', flag: '🇬🇷' },
  { id: 'pl', flag: '🇵🇱' },
  { id: 'tr', flag: '🇹🇷' },
  { id: 'sa', flag: '🇸🇦' },
  { id: 'ae', flag: '🇦🇪' },
  { id: 'my', flag: '🇲🇾' },
  { id: 'uz', flag: '🇺🇿' },
  { id: 'idn', flag: '🇮🇩' },
  { id: 'za', flag: '🇿🇦' },
];
