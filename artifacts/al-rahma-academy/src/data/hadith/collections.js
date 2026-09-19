// Hadith Library: Source Recovery, Licensed Content Integration (2026-09-18);
// Hadith Library Cleanup: Keep Only Working Collections (2026-09-18, later
// same day).
//
// Structural data only: ids, CDN slugs, display color/icon, the
// always-shown native-script title (`ar`) and Roman/English title
// (`label`) -- both are shown side by side on every card regardless of UI
// language, so they are not "translated" content, just two names for the
// same book. Per-language author/note text lives in
// src/i18n/hadith/collections.js; full source/license documentation lives
// in src/data/hadith/sources.js.
//
// `count` is the REAL, live-verified hadith count returned by the CDN on
// 2026-09-18 (see sources.js's `liveHadithCount` -- same number for the
// same id), not a traditionally-cited approximate figure, so the badge on
// the collection card never disagrees with what pagination actually shows
// once a visitor clicks in. For 'muslim' specifically, this API edition
// numbers hadiths sequentially including repeated chains (reaching 7,563),
// distinct from the commonly-cited ~3,033 "unique hadith" count some
// classical references use for the same book -- both are real, legitimate
// numbering conventions; this page shows the one that matches its own
// pagination.
//
// Product decision (Cleanup phase): this library lists ONLY collections
// that actually work end-to-end in-app -- every entry here has real text
// backing it (see sources.js). Three previously-listed collections (Riyad
// As-Salihin, Al-Adab Al-Mufrad, Bulugh Al-Maram) had no licensed, working
// text source and are no longer listed here at all -- not as a card, not
// as a "not available yet" state, not as an external link. That removal
// is a visitor-facing product decision, not a loss of information: the
// research behind it (what was checked, and why each candidate source was
// rejected) is preserved as an internal-only record in
// src/data/hadith/sources.js's `HADITH_REMOVED_FROM_UI`, which nothing on
// this page imports or displays.
export const HADITH_COLLECTIONS = [
  { id: 'nawawi', slug: 'nawawi', label: "Al-Arba'een Al-Nawawiyyah", ar: 'الأربعون النووية', count: 42, color: '#0b6e4f', icon: '📜' },
  { id: 'qudsi', slug: 'qudsi', label: 'Forty Hadith Qudsi', ar: 'الأربعون حديثاً قدسياً', count: 40, color: '#7a3a8a', icon: '✨' },
  { id: 'dehlawi', slug: 'dehlawi', label: 'Forty Hadith (Shah Waliullah)', ar: 'الأربعون — شاه ولي الله الدهلوي', count: 40, color: '#2a6a80', icon: '📗' },
  { id: 'bukhari', slug: 'bukhari', label: 'Sahih Al-Bukhari', ar: 'صحيح البخاري', count: 7589, color: '#1a5fa0', icon: '📘' },
  { id: 'muslim', slug: 'muslim', label: 'Sahih Muslim', ar: 'صحيح مسلم', count: 7563, color: '#c07020', icon: '📙' },
  { id: 'abudawud', slug: 'abudawud', label: 'Sunan Abi Dawud', ar: 'سنن أبي داود', count: 5274, color: '#8a3a2a', icon: '📕' },
  { id: 'tirmidhi', slug: 'tirmidhi', label: "Jami' At-Tirmidhi", ar: 'جامع الترمذي', count: 3998, color: '#2a8050', icon: '📒' },
  { id: 'ibnmajah', slug: 'ibnmajah', label: 'Sunan Ibn Majah', ar: 'سنن ابن ماجه', count: 4343, color: '#6a3a10', icon: '📓' },
  { id: 'nasai', slug: 'nasai', label: "Sunan An-Nasa'i", ar: 'سنن النسائي', count: 5765, color: '#1a6a60', icon: '📔' },
  { id: 'malik', slug: 'malik', label: 'Muwatta Imam Malik', ar: 'موطأ الإمام مالك', count: 1858, color: '#5a3a7a', icon: '📋' },
];
