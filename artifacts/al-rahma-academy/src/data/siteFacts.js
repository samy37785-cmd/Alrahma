/*
 * Single source for owner-confirmed academy facts (Content Truth Contract,
 * dated 2026-09-02, corrective rounds 2-3). These are cumulative/static
 * figures the owner confirmed directly — never "live" or real-time counts,
 * never derived from lesson/review logs in this repo. Do not duplicate
 * these numbers as separate literals elsewhere; import this module and
 * interpolate the value into locale-specific copy instead.
 *
 * Do not add secrets, operational data, or a street/postal address here —
 * the owner confirmed the address must not be displayed publicly.
 *
 * Round 3 property audit — do not assume every property below is wired
 * into a live consumer just because it lives in this "single source" file;
 * that claim is only true for the ones actually listed as such:
 *   - Imported by production code: totalLessons, totalStudents,
 *     totalFamilies, totalTeachers, featuredTeacherCount, countriesServed,
 *     academyRating, academyRatingOutOf, supportResponseHours,
 *     freeTrialLessons (via trialLessonWord()), trialLessonMinutes,
 *     refundWindowDays, limitedTrialSpots.
 *   - NOT importable at runtime (static files) — guarded by an exact
 *     synchronization test instead: public/llms.txt (trialLessonMinutes),
 *     index.html's Organization JSON-LD (founder, foundingYear,
 *     phoneDisplay). See src/test/contentTruthCorrective.test.js.
 *   - Removed in this round: `standardWeeklyHours`/`premiumWeeklyHours`.
 *     They described a "Standard vs Premium" 2-tier plan structure that
 *     does not exist on the live site (the real plans are Noorani/Huffaz/
 *     Ijazah, a 3-tier structure — see src/data/home.js's `plans`) and had
 *     zero consumers. Keeping unused, wrongly-named properties around
 *     invites exactly the kind of fabricated "Standard/Premium" claim this
 *     task exists to prevent, so they were deleted rather than left dead.
 *     The "2x weekly lesson time" comparison this round adds is computed
 *     directly from `plans`' real sessionsPerWeek values instead — see
 *     `planComparison()` in src/data/home.js.
 */
export const siteFacts = {
  totalLessons: '15,000+',
  totalStudents: '1,500+',
  totalFamilies: '1,200+',
  totalTeachers: 30,
  featuredTeacherCount: 11,
  countriesServed: 10,
  academyRating: 4.9,
  academyRatingOutOf: 5,
  supportResponseHours: 24,
  freeTrialLessons: 1,
  trialLessonMinutes: 60,
  refundWindowDays: 24,
  founder: 'Mahmoud Samy',
  foundingYear: '2020',
  phoneDisplay: '+20 101 605 4663',
  // Owner-confirmed marketing figure, not a live/derived inventory count.
  // Update `limitedTrialSpotsConfirmed` (an ISO date, "YYYY-MM-DD") whenever
  // the owner re-confirms this number by hand — this is a deliberately
  // manual value, never a day/week seed, random jitter, or auto-decrementing
  // counter. Set `limitedTrialSpots` to `null` to hide the "limited
  // availability" line entirely (its consumers must treat null/0 as "don't
  // render", per the contract documented next to trialSpotsAvailableText()
  // below) rather than ever showing a fabricated placeholder number.
  limitedTrialSpots: 6,
  limitedTrialSpotsConfirmed: '2026-09-02',
};

// Small, natural-language number words for the free-trial-lesson count.
// Deliberately NOT a generic 1..N number formatter: this only covers the
// small range a trial-lesson count could plausibly be, and each language's
// entry is a real, grammatically-correct phrase (not a literal digit
// substitution) — e.g. Arabic's "واحدة" trails the noun as an adjective per
// Arabic numeral grammar, unlike English's leading "one". If
// siteFacts.freeTrialLessons is ever set to a value not covered here, the
// numeral itself is used as a safe (if less natural) fallback rather than
// throwing.
const TRIAL_LESSON_WORDS = {
  en: { 1: 'one', 2: 'two', 3: 'three' },
  ar: { 1: 'واحدة', 2: 'حصتان', 3: 'ثلاث' },
  it: { 1: 'una', 2: 'due', 3: 'tre' },
  es: { 1: 'una', 2: 'dos', 3: 'tres' },
  de: { 1: 'eine', 2: 'zwei', 3: 'drei' },
  fr: { 1: 'une', 2: 'deux', 3: 'trois' },
};

export function trialLessonWord(lang) {
  const table = TRIAL_LESSON_WORDS[lang] || TRIAL_LESSON_WORDS.en;
  return table[siteFacts.freeTrialLessons] ?? String(siteFacts.freeTrialLessons);
}

// "المتاح حاليًا" / "Currently available" line for the limited-trial-spots
// figure — six languages, each returning null (render nothing) rather than
// a fabricated number when limitedTrialSpots is null/0/undefined. No
// countdown, no deadline, no day/week seed: this is a manually-updated
// marketing figure, displayed as-is or not at all.
const LIMITED_SPOTS_TEXT = {
  en: (n) => `Only ${n} free trial spots currently available`,
  ar: (n) => `يتبقى حاليًا ${n} أماكن فقط للتجربة المجانية`,
  it: (n) => `Attualmente disponibili solo ${n} posti per la prova gratuita`,
  es: (n) => `Actualmente solo quedan ${n} plazas para la prueba gratuita`,
  de: (n) => `Derzeit nur noch ${n} kostenlose Probeplätze verfügbar`,
  fr: (n) => `Seulement ${n} places d'essai gratuites actuellement disponibles`,
};

export function limitedTrialSpotsText(lang) {
  const n = siteFacts.limitedTrialSpots;
  if (!n) return null;
  const fn = LIMITED_SPOTS_TEXT[lang] || LIMITED_SPOTS_TEXT.en;
  return fn(n);
}
