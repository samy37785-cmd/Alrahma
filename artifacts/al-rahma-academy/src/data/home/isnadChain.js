// Home Content Foundation (2026-09-18): structural (language-agnostic) data
// for the Home page's IsnadChain section, extracted from the inline `CHAIN`
// const that used to live in
// src/components/features/marketing/IsnadChain.jsx. Only ids, icons, and
// the `highlight` flag live here -- all per-language text moved to
// src/i18n/home/isnadChain.js, keyed by the same ids so the two stay linked.

export const ISNAD_CHAIN_NODES = [
  { id: 'prophet', icon: '🌟', highlight: true },
  { id: 'companions', icon: '📿' },
  { id: 'alAzhar', icon: '🕌' },
  { id: 'tutors', icon: '🎓' },
  { id: 'child', icon: '⭐', highlight: true },
];
