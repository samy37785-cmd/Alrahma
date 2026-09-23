// `src/data/quranLangs.js`'s UI.ar entry has no `navHizb`/`hizb` keys (only
// fr/de/es/it define them), so QuranSidebar.jsx's/QuranQuickNav.jsx's own
// `ui.navHizb || 'Hizb'` fallback was rendering the English word "Hizb" on
// the Arabic reader UI. quranLangs.js is out of scope for this fix (see the
// PR that introduced this file), so the missing Arabic labels live here
// instead and are used only as the fallback when `ui.dir === 'rtl'` (the
// only interface language with dir 'rtl' in quranLangs.js today) -- every
// other language keeps falling back to the literal 'Hizb' exactly as
// before, unchanged.
export const AR_NAV_LABELS = {
  navHizb: 'حزب',
  hizb: 'حزب',
};
