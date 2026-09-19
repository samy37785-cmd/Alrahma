// Hadith Library: Source Recovery, Licensed Content Integration (2026-09-18);
// Hadith Library Cleanup: Keep Only Working Collections (2026-09-18, later
// same day).
//
// Source / license / provenance documentation for the 10 collections
// listed in src/data/hadith/collections.js. This file answers "where did
// this come from, and are we allowed to show it?" -- kept separate from
// the structural ids/links (collections.js) and the visible author/note
// text (src/i18n/hadith/collections.js).
//
// PRIMARY SOURCE for all 10 collections' full hadith text. HadithLibrary.jsx
// fetches this live, at read time, directly from the CDN below -- the
// hadith text itself is never copied into this repository.
export const HADITH_CDN_SOURCE = {
  name: 'fawazahmed0/hadith-api',
  repoUrl: 'https://github.com/fawazahmed0/hadith-api',
  cdnBaseUrl: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions',
  licenseName: 'The Unlicense',
  licenseUrl: 'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/LICENSE',
  // These two describe what the SOURCE REPOSITORY'S OWN LICENSE FILE
  // declares about reuse of its contents -- confirmed by fetching that
  // license file directly, not assumed. This is not the same claim as "the
  // copyright status of the underlying classical Arabic texts and each
  // individual English translation has been independently, separately
  // legally reviewed" -- it has not; see independentLegalReview below and
  // verificationNotes for the distinction.
  allowsRedistribution: true,
  allowsCommercialUse: true,
  // No separate, independent legal review of the underlying original texts'
  // or translations' own copyright status has been performed -- this
  // documentation reflects what the source repository declares about its
  // own repository contents, not a legal opinion beyond that.
  independentLegalReview: false,
  isOriginalText: false, // the Arabic text is the classical original; the English text is a translation.
  verifiedOn: '2026-09-18',
  verificationNotes:
    "The repository's root LICENSE file (The Unlicense -- a public-domain "
    + 'dedication: free to use, copy, modify, publish, sell, or distribute, '
    + 'for any purpose, commercial or non-commercial, with no conditions) '
    + 'applies to the whole repository as committed to GitHub, which includes '
    + 'the hadith-text JSON data files themselves (editions/*.json) -- no '
    + 'separate, narrower license is stated anywhere for the data directory. '
    + "The v1 tag's editions.json was fetched live this session and lists "
    + 'exactly 10 collections: abudawud, bukhari, dehlawi, ibnmajah, malik, '
    + 'muslim, nasai, nawawi, qudsi, tirmidhi -- each entry also records its '
    + 'own English-translator credit where the source itself names one (see '
    + 'HADITH_COLLECTION_SOURCES below). This is the source repository\'s own '
    + 'license declaration over its own repository, verified by reading that '
    + 'declaration directly -- it is not an independent legal opinion on the '
    + 'underlying copyright status of the classical Arabic texts or of each '
    + 'individual English translation included in that repository, which has '
    + 'not been separately reviewed.',
};

// Per-collection provenance, keyed by HADITH_COLLECTIONS[].id. Backed by
// HADITH_CDN_SOURCE above. `enTranslator` is whatever editions.json itself
// credits (fetched live 2026-09-18), 'Unknown' where the source names no
// one. `liveHadithCount` is the real array length returned by the CDN the
// day this was verified -- matches src/data/hadith/collections.js's
// `count` for the same id.
export const HADITH_COLLECTION_SOURCES = {
  nawawi:   { cdnSlug: 'nawawi',   enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 42 },
  qudsi:    { cdnSlug: 'qudsi',    enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 40 },
  dehlawi:  { cdnSlug: 'dehlawi',  enTranslator: 'Shah Waliullah Dehlawi', verifiedOn: '2026-09-18', liveHadithCount: 40 },
  bukhari:  { cdnSlug: 'bukhari',  enTranslator: 'Muhsin Khan', verifiedOn: '2026-09-18', liveHadithCount: 7589 },
  muslim:   { cdnSlug: 'muslim',   enTranslator: 'Abdul Hamid Siddiqui', verifiedOn: '2026-09-18', liveHadithCount: 7563 },
  abudawud: { cdnSlug: 'abudawud', enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 5274 },
  tirmidhi: { cdnSlug: 'tirmidhi', enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 3998 },
  ibnmajah: { cdnSlug: 'ibnmajah', enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 4343 },
  nasai:    { cdnSlug: 'nasai',    enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 5765 },
  malik:    { cdnSlug: 'malik',    enTranslator: 'Unknown', verifiedOn: '2026-09-18', liveHadithCount: 1858 },
};

// INTERNAL RECORD ONLY -- not imported by HadithLibrary.jsx, not part of
// HADITH_COLLECTIONS, never rendered or linked to a visitor in any way.
//
// Product decision (Hadith Library Cleanup, 2026-09-18): these 3 books used
// to be shown to visitors as a "not available yet" card with an external
// read link. That treatment is removed too -- the library now lists only
// collections that work end-to-end in-app. This object exists solely so a
// future session doesn't have to repeat the same source research from
// scratch; it documents exactly what was checked and why each candidate
// source was rejected, unchanged from the original research.
export const HADITH_REMOVED_FROM_UI = {
  riyadussalihin: {
    name: 'Riyad As-Salihin',
    ar: 'رياض الصالحين',
    removedOn: '2026-09-18',
    reason: 'BLOCKED_BY_LICENSE_OR_SOURCE',
    rejectedSources: [
      'fawazahmed0/hadith-api v1 (the CDN backing every collection above): its editions.json does not list this book at all -- confirmed live.',
      "AhmedBaset/hadith-json: does contain this book, but its own README states the data was 'scraped from Sunnah.com', the repository has no LICENSE file (confirmed via GitHub's own /license API returning 404), and no explicit reuse/redistribution permission is stated anywhere -- rejected.",
      'sunnah.com directly: no terms-of-use/copyright page found on the site; automated fetches to it are blocked (403 Forbidden) -- never used as a text source, only briefly confirmed (by page title) to be a real, working page for a human reader to visit, before this record was removed from the visitor-facing product.',
    ],
  },
  adab: {
    name: 'Al-Adab Al-Mufrad',
    ar: 'الأدب المفرد',
    removedOn: '2026-09-18',
    reason: 'BLOCKED_BY_LICENSE_OR_SOURCE',
    rejectedSources: [
      'fawazahmed0/hadith-api v1: not listed in editions.json -- confirmed live.',
      'AhmedBaset/hadith-json: same rejection as riyadussalihin above (scraped from Sunnah.com, no LICENSE file, no explicit permission).',
      'sunnah.com directly: same as riyadussalihin above -- never used as a text source.',
    ],
  },
  bulugh: {
    name: 'Bulugh Al-Maram',
    ar: 'بلوغ المرام',
    removedOn: '2026-09-18',
    reason: 'BLOCKED_BY_LICENSE_OR_SOURCE',
    rejectedSources: [
      'fawazahmed0/hadith-api v1: not listed in editions.json -- confirmed live.',
      'AhmedBaset/hadith-json: same rejection as riyadussalihin above (scraped from Sunnah.com, no LICENSE file, no explicit permission).',
      'sunnah.com directly: same as riyadussalihin above -- never used as a text source.',
    ],
  },
};
