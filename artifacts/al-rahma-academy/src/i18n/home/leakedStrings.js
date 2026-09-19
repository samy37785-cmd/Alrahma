// Home Content Foundation (2026-09-18): small hardcoded-English strings
// found leaking into every non-English visitor's Home page during the live
// browser review (docs/home-copy-review-pack.md, section 5, plus the
// TrustBar stat and Trial course-dropdown labels reviewed in the same
// pass). Each of these previously lived as an inline string literal
// directly in JSX; this file gives them a named, lang-aware home instead,
// wired to the SAME English text as before (visible output is unchanged
// today), so a later phase can add it/es/de/fr/ar without another refactor.
//
// Arabic Home Copy Implementation (2026-09-18): `ar` was added below from
// docs/home-arabic-copy-approval-pack.md's section 5, Claude editorial
// approval pending human/Islamic review where applicable. it/es/de/fr
// still stay absent; nothing is invented for them here.
export const HOME_LEAKED_STRINGS_TEXT = {
  en: {
    mostPopularCourseBadge: 'Most Popular',
    startFreeTrialLink: 'Start your free trial',
    featuredTutorBadge: 'Featured Tutor',
    browseFullCurriculum: 'Browse full curriculum',
    playQuranLabel: 'Play Quran',
    quranPlayingLabel: 'Quran playing',
    refundWindowStat: '24-day',
  },
  ar: {
    mostPopularCourseBadge: 'الأكثر طلبًا',
    startFreeTrialLink: 'ابدأ تجربتك المجانية',
    featuredTutorBadge: 'المعلم المميز',
    browseFullCurriculum: 'تصفّح المنهج الكامل',
    playQuranLabel: 'تشغيل القرآن',
    // Approval pack draft: "القرآن يُتلى الآن" -- shortened here to match
    // the English source's own brevity ("Quran playing", two words) and
    // its sibling playQuranLabel above (also two words in Arabic).
    quranPlayingLabel: 'القرآن يُتلى',
    refundWindowStat: '24 يومًا',
  },
};

export function pickLeakedString(key, lang) {
  return (HOME_LEAKED_STRINGS_TEXT[lang] || HOME_LEAKED_STRINGS_TEXT.en)[key]
    ?? HOME_LEAKED_STRINGS_TEXT.en[key];
}

// Trial's "Course of interest" dropdown: src/data/marketing/courses.js's
// `courseOptions` array is the CANONICAL, submitted value sent to the
// backend (Trial.jsx's <select> value) -- it is NOT touched here, and its
// strings must stay byte-identical to avoid changing what a booking request
// submits. This map only supplies the DISPLAYED label for each option,
// separately from its value, so translating the label later never risks
// changing submitted data. Keyed by the option's own (English) value.
// Arabic labels below (docs/home-arabic-copy-approval-pack.md section 3,
// Claude editorial approval pending human/Islamic review where applicable)
// are DISPLAY TEXT ONLY, keyed by the exact English value Trial.jsx still
// submits unchanged -- see courseOptionLabel() below and Trial.jsx's own
// <option value={opt}> for why the submitted value never changes.
export const COURSE_OPTION_LABELS_TEXT = {
  en: {
    'Quran Reading (Noorani Qaida)': 'Quran Reading (Noorani Qaida)',
    'Recitation with Tajweed': 'Recitation with Tajweed',
    'Quran Memorization (Hifz)': 'Quran Memorization (Hifz)',
    'Quran Ijazah': 'Quran Ijazah',
    'Islamic Studies': 'Islamic Studies',
    'Arabic Language': 'Arabic Language',
  },
  ar: {
    'Quran Reading (Noorani Qaida)': 'قراءة القرآن (القاعدة النورانية)',
    'Recitation with Tajweed': 'التلاوة بأحكام التجويد',
    'Quran Memorization (Hifz)': 'حفظ القرآن الكريم',
    'Quran Ijazah': 'إجازة القرآن الكريم',
    'Islamic Studies': 'الدراسات الإسلامية',
    'Arabic Language': 'اللغة العربية',
  },
};

export function courseOptionLabel(value, lang) {
  return (COURSE_OPTION_LABELS_TEXT[lang] || COURSE_OPTION_LABELS_TEXT.en)[value]
    ?? COURSE_OPTION_LABELS_TEXT.en[value]
    ?? value;
}
