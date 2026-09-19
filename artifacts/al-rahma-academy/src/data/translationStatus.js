// Page x language publication-status registry.
//
// Rules (approved 2026-09-18, replacing the narrower Phase 1 shape):
//
// - PUBLISHED: the language's content exists and is structurally complete --
//   same shape as English, no missing/empty values. Renders normally.
// - DRAFT: the language's content may be missing or incomplete. The real
//   content is NEVER shown as if it were a finished page -- TranslationGate
//   renders TranslationInProgress instead (see
//   src/components/ui/TranslationGate.jsx), with a link to the English
//   version. This is an active block, not a passive label.
// - LEGACY: the page is shown normally, unchanged, for now -- this status
//   exists because most public pages predate this registry and have not
//   been reviewed against it yet, so blocking them would be a real,
//   unjustified visitor-facing regression on pages that may well be fine.
//   LEGACY is NOT published: it must never later be treated as a complete
//   translation for sitemap.xml, hreflang, or any other SEO surface --
//   promoting a page out of legacy requires an explicit review with real
//   evidence (-> 'published') or a real found gap (-> 'draft'), never a
//   silent default either way.
//
// There is NO default status for an unlisted route. A route inside this
// system's scope (see KNOWN_OUT_OF_SCOPE below for what's deliberately
// excluded) that has no entry here is a bug, caught by
// src/test/translationStatusCoverage.test.js -- not silently treated as
// published.
//
// `contentSources` lists the exact files backing a route's content, so
// automated checks (src/test/contentCompleteness.test.js,
// src/test/noHardcodedBilingualContent.test.js) scan named files instead of
// the whole src tree.
//
// `evidence` is REQUIRED on any non-English language marked 'published'
// whose contentSources are not yet an importable, structurally-checkable
// content module (i.e. the content still lives as inline consts in a page
// .jsx file, like CourseIjazah.jsx's LEARN/STAGES/etc. before their Phase
// 2b/2c migration) -- contentCompleteness.test.js enforces this. It's a
// human attestation standing in for an automated structural check that
// isn't possible yet for un-migrated files.

const LANGS_NON_EN = ['ar', 'it', 'es', 'de', 'fr'];

function allStatus(status, overrides = {}) {
  const languages = { en: { status: 'published' } };
  for (const l of LANGS_NON_EN) languages[l] = { status, ...overrides[l] };
  return languages;
}

export const TRANSLATION_STATUS = {
  // ── Home ──
  '/': {
    contentSources: [
      'src/pages/Home.jsx',
      'src/components/features/marketing/LevelQuiz.jsx',
      'src/components/features/marketing/IsnadChain.jsx',
      'src/components/features/marketing/TrustBar.jsx',
      'src/components/features/marketing/Courses.jsx',
      'src/components/features/marketing/Features.jsx',
      'src/components/features/marketing/Tutors.jsx',
      'src/components/features/marketing/Trial.jsx',
      'src/components/ui/QuranAudioPlayer.jsx',
      'src/i18n/content.js',
      'src/i18n/home/levelQuiz.js',
      'src/i18n/home/isnadChain.js',
      'src/i18n/home/countries.js',
      'src/i18n/home/leakedStrings.js',
      'src/data/home/levelQuiz.js',
      'src/data/home/isnadChain.js',
      'src/data/home/countries.js',
    ],
    // STILL legacy, not published, after Home Content Foundation
    // (2026-09-18): LevelQuiz.jsx and IsnadChain.jsx no longer hardcode
    // English directly in JSX -- their content moved to real, structurally
    // checkable content modules (src/i18n/home/levelQuiz.js,
    // src/i18n/home/isnadChain.js), and TrustBar's country-ticker names and
    // "24-day" stat + a handful of other small leaked strings
    // (src/i18n/home/leakedStrings.js) got the same treatment. This is a
    // FOUNDATION change, not a translation rollout: every one of these new
    // modules has an `en` key ONLY -- no ar/it/es/de/fr content exists yet,
    // none was invented, and IsnadChain's Hadith quote specifically still
    // needs a human-verified Arabic source before any language is added to
    // it (see src/i18n/home/isnadChain.js's module comment). Do not promote
    // any non-English language here to 'draft' either without also wiring
    // '/' through TranslationGate in App.jsx (see
    // translationStatusCoverage.test.js's "every registered route that has
    // at least one draft language is wrapped in TranslationGate" rule) --
    // that is a real behavior change (blocking Home for 5 languages) this
    // phase deliberately does not make. Home's many OTHER sections
    // (content.js-backed: Hero/Courses/Features/Steps/Pricing/FAQ/Trial/
    // Newsletter) remain genuinely 6-language and unaffected by this entry.
    languages: allStatus('legacy'),
  },

  // ── Courses hierarchy ──
  '/courses': { contentSources: ['src/pages/hubs/CoursesHub.jsx'], languages: allStatus('legacy') },
  '/courses/quran': { contentSources: ['src/pages/hubs/CoursesQuran.jsx'], languages: allStatus('legacy') },
  '/courses/arabic': { contentSources: ['src/pages/hubs/CoursesArabic.jsx'], languages: allStatus('legacy') },
  '/courses/ijazah': {
    // Phase 2b migration (2026-09-18): content moved from CourseIjazah.jsx's
    // inline isAr-forked consts to src/i18n/courses/ijazah.js (text) +
    // src/data/courses/ijazah.js (structure).
    //
    // Arabic Cross-Page Shell Repair (2026-09-xx): ar was DOWNGRADED here
    // from 'published' back to 'legacy'. contentCompleteness.test.js still
    // proves IJAZAH_TEXT.ar is structurally complete -- that part of the
    // 'published' claim was real -- but a full-page audit found the page
    // SHELL around that content still leaked English on /ar/: the
    // Breadcrumbs' first item was a hardcoded 'Courses' literal (now fixed,
    // this phase), and the JSON-LD schema.description + the meta
    // description on this route remain hardcoded English (SEO is explicitly
    // OUT of scope for this phase -- see docs/current-project-status.md-
    // adjacent phase notes). This project's own rule (see the module
    // comment at the top of this file) is that 'published' means the whole
    // page, not just one content module, is done -- SEO/shell completeness
    // counts. 'legacy' is the accurate status until a later, SEO-scoped
    // phase closes the JSON-LD/meta-description gap too. See
    // src/test/translationStatus.test.js's "ar was downgraded..." test for
    // the machine-checked version of this same reasoning.
    contentSources: ['src/pages/CourseIjazah.jsx', 'src/i18n/courses/ijazah.js', 'src/data/courses/ijazah.js'],
    languages: allStatus('draft', { ar: { status: 'legacy' } }),
  },
  '/courses/islamic-studies': {
    // Phase 2c migration (2026-09-18): content moved from
    // CourseIslamicStudies.jsx's inline isAr-forked strings and the old
    // src/data/islamicStudiesData.js (which mixed structural + per-language
    // fields in one file) to src/i18n/courses/islamic-studies.js (text) +
    // src/data/courses/islamic-studies.js (structure), mirroring Ijazah's
    // Phase 2b pattern. The old islamicStudiesData.js is no longer imported
    // by any code and is not a contentSource here; it is dead code pending
    // deletion (blocked this session by a sandbox permission denial on file
    // deletion -- see final report).
    //
    // Arabic Cross-Page Shell Repair (2026-09-xx): ar was DOWNGRADED here
    // from 'published' back to 'legacy', for the exact same reason as
    // '/courses/ijazah' above -- ISLAMIC_STUDIES_TEXT.ar is structurally
    // complete (contentCompleteness.test.js), but the page shell's
    // Breadcrumbs first item was hardcoded 'Courses' (now fixed, this
    // phase) and the JSON-LD schema.description + meta description are
    // still hardcoded English, out of scope for this phase. See
    // src/test/translationStatus.test.js for the machine-checked version.
    contentSources: [
      'src/pages/CourseIslamicStudies.jsx',
      'src/components/features/courses/IslamicStudiesBookCard.jsx',
      'src/i18n/courses/islamic-studies.js',
      'src/data/courses/islamic-studies.js',
    ],
    languages: allStatus('draft', { ar: { status: 'legacy' } }),
  },
  // /courses/:id is out of scope: behind ProtectedRoute (logged-in student
  // content), not a public marketing/discovery page, and per-course dynamic
  // content doesn't fit a single static route-key entry anyway.

  // ── Tools hierarchy ──
  '/tools': { contentSources: ['src/pages/hubs/ToolsHub.jsx'], languages: allStatus('legacy') },
  '/tools/quran-reader': { contentSources: ['src/pages/Quran.jsx'], languages: allStatus('legacy') },
  '/tools/adhkar': {
    contentSources: ['src/pages/Adhkar.jsx', 'src/i18n/adhkarText.js', 'src/data/adhkarData.js'],
    languages: allStatus('legacy'),
  },
  '/tools/hadith': {
    // Hadith Library: Source Recovery, Licensed Content Integration
    // (2026-09-18): isAr-forked shell/card text moved to
    // src/i18n/hadith/collections.js; structural collection data (ids,
    // CDN slugs, colors, icons, live-verified counts) moved to
    // src/data/hadith/collections.js; full source/license documentation
    // moved to src/data/hadith/sources.js.
    //
    // Hadith Library Cleanup: Keep Only Working Collections (2026-09-18,
    // later same day): the 3 collections with no licensed, working text
    // source (Riyad As-Salihin, Al-Adab Al-Mufrad, Bulugh Al-Maram) are no
    // longer shown to visitors at all -- not as a card, not as a "not
    // available yet" state, not as an external link. The library now lists
    // exactly the 10 collections that work end-to-end in-app. The removed
    // 3 books' source research is kept only as an internal, non-displayed
    // record in src/data/hadith/sources.js's HADITH_REMOVED_FROM_UI.
    //
    // Stays 'legacy', not 'published': SEO/JSON-LD were not reviewed this
    // phase, and it/es/de/fr were not started for this page's own content.
    contentSources: [
      'src/pages/HadithLibrary.jsx',
      'src/data/hadith/collections.js',
      'src/data/hadith/sources.js',
      'src/i18n/hadith/collections.js',
    ],
    languages: allStatus('legacy'),
  },
  '/tools/prayer': { contentSources: ['src/pages/IslamicTools.jsx'], languages: allStatus('legacy') },
  '/tools/prayer-times': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): isAr-forked
    // shell strings moved to src/i18n/tools/prayerTimes.js (+ shared
    // src/i18n/tools/relatedTools.js for the "Also try" nav, reused by
    // qibla/islamic-calendar too). ar is now real, structurally checked
    // content (contentCompleteness.test.js) -- but stays 'legacy', not
    // 'published': it/es/de/fr remain absent by design and no separate SEO/
    // promotion review has been done this phase.
    contentSources: ['src/pages/tools/PrayerTimesPage.jsx', 'src/i18n/tools/prayerTimes.js', 'src/i18n/tools/relatedTools.js'],
    languages: allStatus('legacy'),
  },
  '/tools/qibla': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): same pattern as
    // /tools/prayer-times above.
    contentSources: ['src/pages/tools/QiblaPage.jsx', 'src/i18n/tools/qibla.js', 'src/i18n/tools/relatedTools.js'],
    languages: allStatus('legacy'),
  },
  '/tools/islamic-calendar': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): same pattern as
    // /tools/prayer-times above.
    contentSources: ['src/pages/tools/IslamicCalendarPage.jsx', 'src/i18n/tools/islamicCalendar.js', 'src/i18n/tools/relatedTools.js'],
    languages: allStatus('legacy'),
  },
  '/tools/verse-of-the-day': { contentSources: ['src/pages/tools/VerseOfTheDayPage.jsx'], languages: allStatus('legacy') },
  '/tools/tasbeeh': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): isAr-forked
    // shell strings moved to src/i18n/tools/tasbeeh.js. The counter widget
    // itself (components/features/tools/Tasbeeh.jsx) has no language fork
    // and is not a contentSource here.
    contentSources: ['src/pages/tools/TasbeehPage.jsx', 'src/i18n/tools/tasbeeh.js'],
    languages: allStatus('legacy'),
  },
  '/tools/arabic-alphabet': { contentSources: ['src/pages/tools/ArabicAlphabetPage.jsx'], languages: allStatus('legacy') },
  '/tools/tajweed-checker': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): isAr-forked
    // shell/UI strings moved to src/i18n/tools/tajweedChecker.js. The
    // practice VERSES (Arabic text/transliteration/translation/reference)
    // and the speech-recognition language ('ar-SA') are untouched tool
    // content/logic, not part of this migration.
    contentSources: ['src/pages/tools/TajweedCheckerPage.jsx', 'src/i18n/tools/tajweedChecker.js'],
    languages: allStatus('legacy'),
  },
  '/tools/hifz-review': {
    // Arabic Tools Content Migration (Phase 4, 2026-09-18): isAr-forked
    // shell/UI strings moved to src/i18n/tools/hifzReview.js -- this
    // includes the review-quality buttons (Perfect/Good/OK/Hard/Forgot),
    // which previously had NO isAr fork at all (hardcoded English shown
    // even on the Arabic page). The SM-2 algorithm and card data are
    // untouched tool logic/content.
    contentSources: ['src/pages/tools/HifzReviewPage.jsx', 'src/i18n/tools/hifzReview.js'],
    languages: allStatus('legacy'),
  },
  // /tools/quran is a pure <Navigate> redirect -- out of scope, no content of its own.

  // ── Resources hierarchy ──
  '/resources': { contentSources: ['src/pages/hubs/ResourcesHub.jsx'], languages: allStatus('legacy') },
  '/resources/blog': { contentSources: ['src/pages/Blog.jsx'], languages: allStatus('legacy') },
  '/resources/faq': { contentSources: ['src/pages/FAQ.jsx', 'src/data/faqItems.js'], languages: allStatus('legacy') },
  // /resources/blog/:slug: see DYNAMIC_PUBLIC_OUT_OF_SCOPE below.

  // ── Academy hierarchy ──
  '/academy': { contentSources: ['src/pages/hubs/AcademyHub.jsx'], languages: allStatus('legacy') },
  '/academy/about': { contentSources: ['src/pages/About.jsx'], languages: allStatus('legacy') },
  '/academy/teachers': {
    // Phase 2c small fix (2026-09-18): the page shell's remaining isAr
    // forks (breadcrumb "Academy" label, SEO title/description, the
    // language-filter "All" option) were removed -- they now read from
    // src/i18n/{lang}.js's teachersPg.{academy,seoTitle,seoDescription,
    // langAll}, present in all 6 locale files. Promoted from 'legacy' to
    // 'published' for ar/it/es/de/fr on real evidence, not by default:
    // - src/test/i18nParity.test.js proves teachersPg (and every other
    //   en.js key) has the exact same structure in ar/it/es/de/fr.js, with
    //   no empty values in en (the baseline every locale is compared to).
    // - src/test/contentCompleteness.test.js's
    //   'src/data/marketing/teachers.js' checks (title/bio/specialties per
    //   teacher, TEACHER_CREDENTIALS[].label) prove all 11 teachers and all
    //   4 shared credentials genuinely carry non-empty text in all 6
    //   languages -- bio was newly added to this check in this same fix,
    //   it was previously unchecked.
    // The one remaining isAr use (TeacherCard's RTL arrow glyph) is a
    // documented, permanent, non-content exception -- see
    // noHardcodedBilingualContent.test.js's DOCUMENTED_EXCEPTIONS.
    contentSources: ['src/pages/Teachers.jsx', 'src/data/marketing/teachers.js'],
    languages: allStatus('published'),
  },
  '/academy/privacy': { contentSources: ['src/pages/Privacy.jsx'], languages: allStatus('legacy') },
  '/academy/terms': { contentSources: ['src/pages/TermsOfService.jsx'], languages: allStatus('legacy') },
  '/academy/refund-policy': { contentSources: ['src/pages/RefundPolicy.jsx'], languages: allStatus('legacy') },
  // /academy/teachers/:id: see DYNAMIC_PUBLIC_OUT_OF_SCOPE below.

  // ── Enroll ──
  '/enroll': { contentSources: ['src/pages/Enroll.jsx'], languages: allStatus('legacy') },
};

// Routes deliberately outside this system's scope, with the reason each is
// excluded -- checked by translationStatusCoverage.test.js so the exclusion
// list itself is reviewed, not just implied by absence. A route belongs
// here only if it is NOT a public marketing/course/tool/resource page:
// auth entry points, transactional notices, and the 404 catch-all.
export const KNOWN_OUT_OF_SCOPE = {
  '/login': 'Auth entry point, not marketing/course/tool content.',
  '/register': 'Auth entry point, not marketing/course/tool content.',
  '/forgot-password': 'Auth entry point, not marketing/course/tool content.',
  '/reset-password': 'Auth entry point, not marketing/course/tool content.',
  '/admin/login': 'Admin auth entry point, not marketing/course/tool content.',
  '/payment/success': 'Transactional post-payment/booking notice, not a discovery page -- revisit in a later phase if needed.',
  '/payment/cancel': 'Transactional post-payment/booking notice, not a discovery page -- revisit in a later phase if needed.',
  '/billing': 'Transactional post-payment/booking notice, not a discovery page -- revisit in a later phase if needed.',
  '*': '404 catch-all, not a discoverable page. Already fully 6-language via t.notFound, enforced separately by i18nParity.test.js.',
};

// Public, dynamic-param routes deliberately outside this registry's scope.
// Unlike KNOWN_OUT_OF_SCOPE (auth/admin/transactional pages that aren't
// content at all), these ARE real public content pages -- they're excluded
// only because a single static route-key entry can't represent per-item
// (per-post, per-teacher) publication status, and no per-item registry
// design exists yet. A route belongs here only if it is genuinely dynamic
// (':' in its path) AND not itself a redirect/protected route (those are
// excluded mechanically -- see translationStatusCoverage.test.js's proof
// list). Closing this gap (a real per-item design) is future work, not
// silently ignored: translationStatusCoverage.test.js fails if a dynamic
// public route exists in App.jsx without an entry here.
export const DYNAMIC_PUBLIC_OUT_OF_SCOPE = {
  '/resources/blog/:slug': 'Per-post dynamic content (CMS/DB-driven blog posts). Does not fit a single '
    + 'static route-key entry -- needs a per-content-item design in a later phase, not this registry.',
  '/academy/teachers/:id': 'Per-teacher dynamic profile page. teachers.js already has real 6-language '
    + 'title/specialties data per teacher (checked by contentCompleteness.test.js), but TeacherProfile.jsx '
    + 'itself has not been reviewed and no per-item registry design exists yet.',
};

export function isPublished(routeKey, lang) {
  if (lang === 'en') return true;
  const entry = TRANSLATION_STATUS[routeKey];
  // Not in this registry: outside this system's scope entirely (an
  // authenticated/admin page, a redirect, a dynamic-param route, ...).
  // isPublished() is consulted globally (LangSwitcher renders on every
  // page), so "no opinion" must mean "don't warn/block", not "unpublished".
  // Whether an in-scope route is *missing* from the registry by mistake is
  // a separate, enforced question -- see translationStatusCoverage.test.js.
  if (!entry) return true;
  const status = entry.languages[lang]?.status;
  return status === 'published' || status === 'legacy';
}
