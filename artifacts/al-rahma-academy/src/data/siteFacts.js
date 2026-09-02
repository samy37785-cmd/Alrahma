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
 * Round 3/4 property audit — do not assume every property below is wired
 * into a live consumer just because it lives in this "single source" file;
 * that claim is only true for the ones actually listed as such:
 *   - Imported by production code: totalLessons, totalStudents,
 *     totalFamilies, totalTeachers, featuredTeacherCount, countriesServed,
 *     academyRating, academyRatingOutOf, supportResponseHours (via
 *     footer.trustBadges/footer.replyBadge in every locale file — Footer.jsx
 *     renders both), freeTrialLessons (via trialLessonPhrase()),
 *     trialLessonMinutes, refundWindowDays, limitedTrialSpots.
 *   - NOT importable at runtime (static files) — guarded by an exact
 *     synchronization test instead: public/llms.txt (trialLessonMinutes),
 *     index.html's Organization JSON-LD (founder, foundingYear, telephone —
 *     see src/data/site.js for the phone/social contract).
 *     See src/test/contentTruthCorrective.test.js.
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

// Full, grammatically-correct noun phrases for "<count> free trial
// lesson(s)" — Content Truth Contract Round 4 fix. The earlier
// `trialLessonWord()` returned a bare number word (e.g. Arabic 'حصتان')
// that callers spliced into their own fixed-singular template
// ("حصة تجريبية {word} مجانية"), which breaks for count=2 because Arabic
// numeral/noun/adjective agreement (singular vs dual vs plural) cannot be
// decomposed into a single interpolated word — every word in the phrase
// must inflect together. `trialLessonPhrase()` instead returns the entire
// atomic phrase (count + noun + "free", already agreement-correct) so
// callers never reconstruct grammar around it. This applies to every
// language here, not just Arabic: Italian/Spanish/French/German "free"
// also agrees with singular/plural.
const TRIAL_LESSON_PHRASES = {
  en: { 1: 'one free trial lesson', 2: 'two free trial lessons', 3: 'three free trial lessons' },
  ar: { 1: 'حصة تجريبية مجانية واحدة', 2: 'حصتان تجريبيتان مجانيتان', 3: 'ثلاث حصص تجريبية مجانية' },
  it: { 1: 'una lezione di prova gratuita', 2: 'due lezioni di prova gratuite', 3: 'tre lezioni di prova gratuite' },
  es: { 1: 'una clase de prueba gratuita', 2: 'dos clases de prueba gratuitas', 3: 'tres clases de prueba gratuitas' },
  de: { 1: 'eine kostenlose Probestunde', 2: 'zwei kostenlose Probestunden', 3: 'drei kostenlose Probestunden' },
  fr: { 1: "un cours d'essai gratuit", 2: "deux cours d'essai gratuits", 3: "trois cours d'essai gratuits" },
};

// Fallback for a count outside 1–3 (never expected in production — the
// published fact is a fixed one free 60-minute trial — but the formatter
// must not throw if siteFacts.freeTrialLessons is ever changed).
const TRIAL_LESSON_PHRASE_FALLBACK = {
  en: (n) => `${n} free trial lessons`,
  ar: (n) => `${n} حصة تجريبية مجانية`,
  it: (n) => `${n} lezioni di prova gratuite`,
  es: (n) => `${n} clases de prueba gratuitas`,
  de: (n) => `${n} kostenlose Probestunden`,
  fr: (n) => `${n} cours d'essai gratuits`,
};

export function trialLessonPhrase(lang, count = siteFacts.freeTrialLessons) {
  const table = TRIAL_LESSON_PHRASES[lang] || TRIAL_LESSON_PHRASES.en;
  if (table[count]) return table[count];
  const fallback = TRIAL_LESSON_PHRASE_FALLBACK[lang] || TRIAL_LESSON_PHRASE_FALLBACK.en;
  return fallback(count);
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
