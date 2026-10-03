import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { PRERENDER_MANIFEST, canonicalUrlFor, outputRelPathFor } from '../../scripts/prerender-routes.mjs';
import faqItems from '../data/faqItems.js';
import { ADHKAR, CATEGORY_KEYS } from '../data/adhkarData.js';

// SEO Prerender Pilot (2026-09-20): proves the real static HTML files
// scripts/prerender.mjs writes after `vite build` (as `postbuild`) are
// correct BEFORE any JavaScript runs — reads the actual files on disk,
// never a fixture or a mock of what prerender.mjs is supposed to produce.
//
// This only has something real to check after a real build has run. Run
// standalone (the existing pre-build "Frontend vitest" CI step, or a bare
// `npx vitest run` on a fresh checkout with no dist/ yet), it skips
// itself — visibly, as a reported Skipped entry, never as a false Passed
// — rather than fail a step that structurally cannot have dist/ yet, or
// silently claim to have checked something it never touched. The CI
// workflow's dedicated post-build step is the only place this is
// expected to actually execute its assertions.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist/public');
const distExists = existsSync(distDir);

// Kept as a literal copy of prerender.mjs's own SHELL_TITLE constant
// (rather than importing it) so a title-not-shell check here can never be
// made to always pass merely by both sides referencing the same drifted
// value.
const SHELL_TITLE = 'Al-Rahma Academy — Learn Quran Online | Tajweed, Hifz & Arabic';

// The static shell's meta description (index.html), same rationale as
// SHELL_TITLE above — a literal, not an import, so both sides can never
// silently drift together.
const SHELL_DESCRIPTION =
  'Learn the Holy Quran online with certified Egyptian tutors. One-to-one live lessons in Tajweed, Hifz, Ijazah and Arabic for kids and adults — anywhere in the world. Book your free trial lesson today.';

// Verification strengthening (2026-09-20): the four real dist/public
// output paths, written as literal strings rather than derived through
// outputRelPathFor() — so a bug in that helper (wrong slug, wrong
// trailing-slash handling, ...) can never make this block "pass" by
// checking the wrong file, or by sharing the same wrong path logic as the
// primary describe block above. expectedCanonical is likewise a literal,
// not canonicalUrlFor(entry). h1Text is the real page heading rendered in
// the body (verified against Hero.jsx/src/i18n/en.js+ar.js's hero.title
// for Home, and CourseIjazah.jsx's own <h1> for Ijazah) — not the <title>
// tag, so this proves genuine hydrated body content, not just metadata.
// expectedEnHref/expectedArHref (added for the hreflang fix, 2026-09-21):
// the reciprocal en/ar alternates BOTH locale entries of the same route
// must share — literal strings, not derived via hreflangLinksFor(), for
// the same reason expectedCanonical is literal above: this file must be
// able to catch a bug in that helper, not just confirm it agrees with
// itself.
// BreadcrumbList JSON-LD (Localized Breadcrumb JSON-LD fix, 2026-09-21):
// the exact trail Breadcrumbs.jsx renders for the visitor, for the pages
// that mount <Breadcrumbs> — literal, not derived, same reasoning as
// expectedCanonical/expectedEnHref above. `null` marks a page that never
// renders <Breadcrumbs> (Home), which must have NO BreadcrumbList at all —
// that's correct, intended behavior, not a regression.
const LITERAL_FILES = [
  {
    route: '/',
    locale: 'en',
    relPath: 'index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/',
    h1Text: 'Give Your Child the Gift of the Quran',
    expectedEnHref: 'https://al-rahmaacademy.com/',
    expectedArHref: 'https://al-rahmaacademy.com/ar/',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/',
    breadcrumb: null,
  },
  {
    route: '/',
    locale: 'ar',
    relPath: 'ar/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/',
    h1Text: 'امنح طفلك هدية القرآن الكريم',
    expectedEnHref: 'https://al-rahmaacademy.com/',
    expectedArHref: 'https://al-rahmaacademy.com/ar/',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/',
    breadcrumb: null,
  },
  {
    route: '/courses/ijazah',
    locale: 'en',
    relPath: 'courses/ijazah/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses/ijazah',
    h1Text: 'Quran Ijazah Course',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/ijazah',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/ijazah',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/ijazah',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Courses', item: 'https://al-rahmaacademy.com/courses' },
      { name: 'Quran Ijazah Course', item: 'https://al-rahmaacademy.com/courses/ijazah' },
    ],
  },
  {
    route: '/courses/ijazah',
    locale: 'ar',
    relPath: 'ar/courses/ijazah/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses/ijazah',
    h1Text: 'دورة إجازة القرآن الكريم',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/ijazah',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/ijazah',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/ijazah',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
      { name: 'دورة الإجازة', item: 'https://al-rahmaacademy.com/ar/courses/ijazah' },
    ],
  },
  // Course hubs (2026-09-21): added once fix/courses-ar-seo (PR #84) gave
  // /courses, /courses/quran and /courses/arabic real, already-reviewed
  // en/ar SEO metadata (src/i18n/courses/seo.js) — no new translation was
  // written for this addition. expectedTitle/expectedDescription are the
  // one new check this addition adds beyond the original four entries'
  // shape: literal copies of src/i18n/courses/seo.js's own text (title
  // includes useSEO.js's " | AL-Rahma Academy" suffix, so this also
  // guards the no-duplicate-academy-name rule for these three pages), not
  // an import — same "must be able to catch a real bug, not just agree
  // with itself" reasoning as every other literal in this file. h1Text
  // verified against src/i18n/en.js / ar.js's hubs.courses/quran/arabic
  // .heading — CoursesHub.jsx/CoursesQuran.jsx/CoursesArabic.jsx's own
  // <h1>{...heading}</h1>.
  {
    route: '/courses',
    locale: 'en',
    relPath: 'courses/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses',
    h1Text: 'Learn Quran & Islamic Knowledge Online',
    expectedEnHref: 'https://al-rahmaacademy.com/courses',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses',
    expectedTitle: 'Courses | AL-Rahma Academy',
    expectedDescription:
      'Explore all online Quran and Islamic courses at Al-Rahma Academy — Tajweed, Hifz, Ijazah, Islamic Studies, Arabic Alphabet, and more.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Courses', item: 'https://al-rahmaacademy.com/courses' },
    ],
  },
  {
    route: '/courses',
    locale: 'ar',
    relPath: 'ar/courses/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses',
    h1Text: 'تعلّم القرآن والعلم الإسلامي أونلاين',
    expectedEnHref: 'https://al-rahmaacademy.com/courses',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses',
    expectedTitle: 'الدورات | AL-Rahma Academy',
    expectedDescription:
      'استكشف جميع دورات القرآن والعلوم الإسلامية أونلاين في أكاديمية الرحمة — تلاوة القرآن والتجويد، الحفظ، إجازة القرآن، الدراسات الإسلامية، الحروف العربية، والمزيد.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
    ],
  },
  {
    route: '/courses/quran',
    locale: 'en',
    relPath: 'courses/quran/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses/quran',
    h1Text: 'Quran & Tajweed Courses',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/quran',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/quran',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/quran',
    expectedTitle: 'Quran & Tajweed Courses | AL-Rahma Academy',
    expectedDescription:
      'Online Quran Reading, Tajweed, and Hifz (memorization) courses with certified Al-Azhar teachers — in 17 languages.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Courses', item: 'https://al-rahmaacademy.com/courses' },
      { name: 'Quran & Tajweed', item: 'https://al-rahmaacademy.com/courses/quran' },
    ],
  },
  {
    route: '/courses/quran',
    locale: 'ar',
    relPath: 'ar/courses/quran/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses/quran',
    h1Text: 'دورات القرآن والتجويد',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/quran',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/quran',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/quran',
    expectedTitle: 'دورات القرآن والتجويد | AL-Rahma Academy',
    expectedDescription:
      'دروس أونلاين في تلاوة القرآن والتجويد وحفظ القرآن الكريم مع معلمين معتمدين من الأزهر — دروس فردية مباشرة ترافقك خطوة بخطوة حتى إتقان التلاوة الصحيحة.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
      { name: 'القرآن والتجويد', item: 'https://al-rahmaacademy.com/ar/courses/quran' },
    ],
  },
  {
    route: '/courses/arabic',
    locale: 'en',
    relPath: 'courses/arabic/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses/arabic',
    h1Text: 'Arabic & Italian Alphabet',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/arabic',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/arabic',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/arabic',
    expectedTitle: 'Arabic Alphabet Course | AL-Rahma Academy',
    expectedDescription:
      'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — ideal for beginners starting their Quran journey.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Courses', item: 'https://al-rahmaacademy.com/courses' },
      { name: 'Arabic Alphabet', item: 'https://al-rahmaacademy.com/courses/arabic' },
    ],
  },
  {
    route: '/courses/arabic',
    locale: 'ar',
    relPath: 'ar/courses/arabic/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses/arabic',
    h1Text: 'الحروف العربية',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/arabic',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/arabic',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/arabic',
    expectedTitle: 'دورة الحروف العربية | AL-Rahma Academy',
    expectedDescription:
      'تعلّم الحروف العربية الـ28 مع النطق الصوتي وتمارين تفاعلية مباشرة في المتصفح — الخطوة الأولى المثالية قبل قراءة القرآن الكريم.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
      { name: 'الحروف العربية', item: 'https://al-rahmaacademy.com/ar/courses/arabic' },
    ],
  },
  // Islamic Studies SEO Publication Gate (2026-09-30): the only route this
  // wave adds, en+ar+fr all at once — a dedicated readiness audit found the
  // content already complete/policy-compliant in all three locales, with
  // the page's one real blocker ("Hadith of the Day" freezing a
  // Date.now()-computed value into this very file) fixed in
  // CourseIslamicStudies.jsx. expectedTitle/expectedDescription are literal
  // copies of that component's own useSEO() call; h1Text/breadcrumb are the
  // literal strings it and i18n/courses/religiousPagesFr.js's FR object
  // render — not re-derived from either, so a real regression in either
  // file is still caught here.
  {
    route: '/courses/islamic-studies',
    locale: 'en',
    relPath: 'courses/islamic-studies/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/courses/islamic-studies',
    h1Text: 'Islamic Studies',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/islamic-studies',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/islamic-studies',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/islamic-studies',
    expectedTitle: 'Islamic Studies Course | AL-Rahma Academy',
    expectedDescription:
      'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Courses', item: 'https://al-rahmaacademy.com/courses' },
      { name: 'Islamic Studies Course', item: 'https://al-rahmaacademy.com/courses/islamic-studies' },
    ],
  },
  {
    route: '/courses/islamic-studies',
    locale: 'ar',
    relPath: 'ar/courses/islamic-studies/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/courses/islamic-studies',
    h1Text: 'الدراسات الإسلامية',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/islamic-studies',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/islamic-studies',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/islamic-studies',
    expectedTitle: 'دورة الدراسات الإسلامية | AL-Rahma Academy',
    expectedDescription:
      'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — ٥ وحدات يدرّسها علماء معتمدون بلغتك.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
      { name: 'الدراسات الإسلامية', item: 'https://al-rahmaacademy.com/ar/courses/islamic-studies' },
    ],
  },
  {
    route: '/courses/islamic-studies',
    locale: 'fr',
    relPath: 'fr/courses/islamic-studies/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/courses/islamic-studies',
    h1Text: 'Études islamiques',
    expectedEnHref: 'https://al-rahmaacademy.com/courses/islamic-studies',
    expectedArHref: 'https://al-rahmaacademy.com/ar/courses/islamic-studies',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/courses/islamic-studies',
    expectedTitle: "Cours d'études islamiques | AL-Rahma Academy",
    expectedDescription:
      "Un programme complet, fondé sur les sources, couvrant l'aqida, le fiqh, la sira, le hadith et le tafsir — 5 modules structurés enseignés par des savants certifiés dans votre propre langue.",
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Cours', item: 'https://al-rahmaacademy.com/fr/courses' },
      { name: "Cours d'études islamiques", item: 'https://al-rahmaacademy.com/fr/courses/islamic-studies' },
    ],
  },
  // Academy trust pages (2026-09-22): /academy, /academy/about and
  // /academy/teachers joined the pilot once a read-only audit confirmed
  // all three are genuinely static (real, already-reviewed en/ar useSEO
  // metadata; no date/time, external API, geolocation, localStorage or
  // per-user state at initial render). Only the /academy/teachers LIST
  // page is here — the 11 individual /academy/teachers/:id profiles are a
  // separate, deliberately deferred product decision (no internal links
  // point at them yet) and are out of scope for this PR.
  //
  // expectedTitle/expectedDescription are literal copies of each page's
  // own current source, verified directly against origin/main before
  // writing this file (never invented, never re-translated):
  //   - /academy: title = src/pages/hubs/AcademyHub.jsx's `t.nav.academy`
  //     (src/i18n/en.js+ar.js `nav.academy`); description =
  //     src/i18n/academy/seo.js's `pickAcademySeo(lang)`.
  //   - /academy/about: title = src/pages/About.jsx's `t.about.eyebrow`;
  //     description = `t.about.description` (both src/i18n/en.js+ar.js).
  //   - /academy/teachers: title/description = src/pages/Teachers.jsx's
  //     `ui.seoTitle`/`ui.seoDescription` (src/i18n/en.js+ar.js
  //     `teachersPg`), which interpolate siteFacts.totalTeachers (30) and
  //     siteFacts.featuredTeacherCount (11) — the exact numbers baked into
  //     the literals below, not derived from siteFacts.js at test time, so
  //     a future siteFacts change is caught here as a real mismatch rather
  //     than silently re-agreeing with itself.
  // h1Text: AcademyHub.jsx's `hac.heading` (hubs.academy.heading);
  // About.jsx's `pickPageHeading(lang).h1` (src/i18n/about/pageHeading.js,
  // the fix/about-page-h1 PR); Teachers.jsx's `ui.title` (teachersPg.title).
  // breadcrumb: Breadcrumbs.jsx always prepends a localized Home crumb,
  // then the exact `items` prop each page passes — verified directly
  // against each page's own <Breadcrumbs items={...}/> call.
  {
    route: '/academy',
    locale: 'en',
    relPath: 'academy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy',
    h1Text: 'A Trusted Home for Quran Learning',
    expectedEnHref: 'https://al-rahmaacademy.com/academy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy',
    expectedTitle: 'Academy | AL-Rahma Academy',
    expectedDescription:
      'Learn about Al-Rahma Academy — our mission, teachers, policies, and how to get started with a free trial lesson.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
    ],
  },
  {
    route: '/academy',
    locale: 'ar',
    relPath: 'ar/academy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy',
    h1Text: 'بيتك الموثوق لتعلم القرآن',
    expectedEnHref: 'https://al-rahmaacademy.com/academy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy',
    expectedTitle: 'الأكاديمية | AL-Rahma Academy',
    expectedDescription:
      'تعرّف على أكاديمية الرحمة — مهمتنا، معلمونا، سياساتنا، وكيفية البدء بحصة تجريبية مجانية.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
    ],
  },
  {
    route: '/academy/about',
    locale: 'en',
    relPath: 'academy/about/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/about',
    h1Text: 'About Al-Rahma Academy',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/about',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/about',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/about',
    expectedTitle: 'About us | AL-Rahma Academy',
    expectedDescription:
      'Al-Rahma Academy is a dedicated online platform connecting students around the world with the Holy Quran and the Arabic language. Our qualified native Egyptian tutors deliver personalised, one-to-one live lessons — for children and adults, from anywhere in the world.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
      { name: 'About us', item: 'https://al-rahmaacademy.com/academy/about' },
    ],
  },
  {
    route: '/academy/about',
    locale: 'ar',
    relPath: 'ar/academy/about/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/about',
    h1Text: 'من نحن',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/about',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/about',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/about',
    expectedTitle: 'من نحن | AL-Rahma Academy',
    expectedDescription:
      'أكاديمية الرحمة منصة تعليمية متخصصة تربط الطلاب في جميع أنحاء العالم بالقرآن الكريم واللغة العربية. يقدم معلمونا المصريون المؤهلون حصصاً فردية مباشرة — للأطفال والكبار، من أي مكان في العالم.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
      { name: 'من نحن', item: 'https://al-rahmaacademy.com/ar/academy/about' },
    ],
  },
  {
    route: '/academy/teachers',
    locale: 'en',
    relPath: 'academy/teachers/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers',
    h1Text: 'Our Qualified Tutors',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers',
    expectedTitle: 'Al-Azhar Certified Quran Tutors | AL-Rahma Academy',
    expectedDescription:
      'Al-Rahma Academy has 30 teachers on our team — 11 of them are featured here. Every teacher is an Al-Azhar graduate holding a verified Ijazah with a continuous sanad, with identity verified by the academy.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
      { name: 'Our Qualified Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
    ],
  },
  {
    route: '/academy/teachers',
    locale: 'ar',
    relPath: 'ar/academy/teachers/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers',
    h1Text: 'معلمونا المؤهلون',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers',
    expectedTitle: 'معلمونا المعتمدون من الأزهر | AL-Rahma Academy',
    expectedDescription:
      'تضم أكاديمية الرحمة 30 معلمًا، 11 منهم معروضون هنا. كل معلم خريج الأزهر ويحمل إجازة بسند متصل، وهويته موثقة لدى الأكاديمية.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
      { name: 'معلمونا المؤهلون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
    ],
  },
  // Resources + Tools hubs (2026-09-22): the second wave, same shape as
  // the Academy wave above. expectedTitle/expectedDescription/h1Text are
  // literal copies of each page's own current source, verified directly
  // against origin/main before writing this file:
  //   - /resources: title = src/pages/hubs/ResourcesHub.jsx's
  //     `t.nav.resources` (src/i18n/en.js+ar.js `nav.resources`);
  //     description = src/i18n/resources/content.js's
  //     `pickResourcesSeo(lang)`; h1 = `hr.heading`
  //     (hubs.resources.heading).
  //   - /tools: title = src/pages/hubs/ToolsHub.jsx's `t.nav.tools`
  //     (`nav.tools`); description = `ht.sub` (hubs.tools.sub, reused as
  //     the SEO description — same as production); h1 = `ht.heading`
  //     (hubs.tools.heading).
  // breadcrumb: both pages pass a single-item `items` prop with no `to`
  // (Breadcrumbs.jsx's Home crumb is always prepended), so each page's own
  // nav label is both the visible current crumb and the page's own title.
  {
    route: '/resources',
    locale: 'en',
    relPath: 'resources/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/resources',
    h1Text: 'Everything You Need to Get Started',
    expectedEnHref: 'https://al-rahmaacademy.com/resources',
    expectedArHref: 'https://al-rahmaacademy.com/ar/resources',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/resources',
    expectedTitle: 'Resources | AL-Rahma Academy',
    expectedDescription:
      'Explore resources from Al-Rahma Academy: blog articles, FAQ, academy information, and teacher profiles.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Resources', item: 'https://al-rahmaacademy.com/resources' },
    ],
  },
  {
    route: '/resources',
    locale: 'ar',
    relPath: 'ar/resources/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/resources',
    h1Text: 'كل ما تحتاجه للبدء',
    expectedEnHref: 'https://al-rahmaacademy.com/resources',
    expectedArHref: 'https://al-rahmaacademy.com/ar/resources',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/resources',
    expectedTitle: 'الموارد | AL-Rahma Academy',
    expectedDescription:
      'استكشف موارد أكاديمية الرحمة: مقالات المدونة، الأسئلة الشائعة، معلومات عن الأكاديمية، والتعرّف على معلمينا.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الموارد', item: 'https://al-rahmaacademy.com/ar/resources' },
    ],
  },
  {
    route: '/tools',
    locale: 'en',
    relPath: 'tools/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools',
    h1Text: 'Free Tools for Every Muslim',
    expectedEnHref: 'https://al-rahmaacademy.com/tools',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools',
    expectedTitle: 'Islamic Tools | AL-Rahma Academy',
    expectedDescription:
      'A growing collection of free Islamic tools to help you worship, learn, and grow — built with care by the Al-Rahma Academy team.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Islamic Tools', item: 'https://al-rahmaacademy.com/tools' },
    ],
  },
  {
    route: '/tools',
    locale: 'ar',
    relPath: 'ar/tools/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools',
    h1Text: 'أدوات مجانية لكل مسلم',
    expectedEnHref: 'https://al-rahmaacademy.com/tools',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools',
    expectedTitle: 'أدوات إسلامية | AL-Rahma Academy',
    expectedDescription:
      'مجموعة متنامية من الأدوات الإسلامية المجانية لمساعدتك في العبادة والتعلم والنمو — بُنيت باهتمام من فريق أكاديمية الرحمة.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'أدوات إسلامية', item: 'https://al-rahmaacademy.com/ar/tools' },
    ],
  },
  // Teacher profiles (Phase 3, 22 entries): all 11 teachers currently in
  // src/data/marketing/teachers.js (ids 1-11), en+ar. h1Text/nameAr/nameEn
  // are literal copies of that file's own current data (verified directly
  // against origin/main before writing this file, never invented) — proves
  // the real fix/teachers-localize-profile-heading (PR #108) behaviour:
  // EN H1 = nameEn, AR H1 = nameAr, never the other language. expectedTitle
  // = `${displayName} | AL-Rahma Academy` (TeacherProfile.jsx's own
  // useSEO({ title: displayName, ... }), same suffix useSEO.js appends
  // everywhere else). expectedDescription is intentionally omitted here —
  // TeacherProfile.jsx uses each teacher's own real bio[lang] paragraph as
  // the meta description, which the primary manifest-driven describe block
  // above already asserts is present and not the pre-hydration shell text
  // for every one of these 22 entries too (it iterates PRERENDER_MANIFEST
  // in full); duplicating 22 bio paragraphs here would add fragility
  // without adding real coverage beyond that. breadcrumb: Breadcrumbs.jsx
  // always prepends the localized Home crumb, then TeacherProfile.jsx's own
  // `items={[{ label: t.nav.teachers, to: '/academy/teachers' }, { label:
  // displayName }]}` (src/i18n/en.js+ar.js `nav.teachers` = "Tutors" /
  // "المعلمون"); the final, unlinked crumb's URL is the page's own
  // canonical path (Breadcrumbs.jsx: `ORIGIN + window.location.pathname`
  // for any crumb with no `to`), i.e. the same as expectedCanonical.
  {
    route: '/academy/teachers/1',
    locale: 'en',
    relPath: 'academy/teachers/1/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/1',
    h1Text: 'Sami Mahmoud Abd Al-Aal',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/1',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/1',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/1',
    expectedTitle: 'Sami Mahmoud Abd Al-Aal | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Sami Mahmoud Abd Al-Aal', item: 'https://al-rahmaacademy.com/academy/teachers/1' },
    ],
  },
  {
    route: '/academy/teachers/1',
    locale: 'ar',
    relPath: 'ar/academy/teachers/1/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/1',
    h1Text: 'سامي محمود عبد العال',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/1',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/1',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/1',
    expectedTitle: 'سامي محمود عبد العال | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'سامي محمود عبد العال', item: 'https://al-rahmaacademy.com/ar/academy/teachers/1' },
    ],
  },
  {
    route: '/academy/teachers/2',
    locale: 'en',
    relPath: 'academy/teachers/2/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/2',
    h1Text: 'Muhammad Abd Al-Maqsoud',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/2',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/2',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/2',
    expectedTitle: 'Muhammad Abd Al-Maqsoud | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Muhammad Abd Al-Maqsoud', item: 'https://al-rahmaacademy.com/academy/teachers/2' },
    ],
  },
  {
    route: '/academy/teachers/2',
    locale: 'ar',
    relPath: 'ar/academy/teachers/2/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/2',
    h1Text: 'محمد عبد المقصود',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/2',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/2',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/2',
    expectedTitle: 'محمد عبد المقصود | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'محمد عبد المقصود', item: 'https://al-rahmaacademy.com/ar/academy/teachers/2' },
    ],
  },
  {
    route: '/academy/teachers/3',
    locale: 'en',
    relPath: 'academy/teachers/3/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/3',
    h1Text: 'Khairiyya Al-Muhammadi',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/3',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/3',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/3',
    expectedTitle: 'Khairiyya Al-Muhammadi | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Khairiyya Al-Muhammadi', item: 'https://al-rahmaacademy.com/academy/teachers/3' },
    ],
  },
  {
    route: '/academy/teachers/3',
    locale: 'ar',
    relPath: 'ar/academy/teachers/3/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/3',
    h1Text: 'خيرية المحمدي',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/3',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/3',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/3',
    expectedTitle: 'خيرية المحمدي | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'خيرية المحمدي', item: 'https://al-rahmaacademy.com/ar/academy/teachers/3' },
    ],
  },
  {
    route: '/academy/teachers/4',
    locale: 'en',
    relPath: 'academy/teachers/4/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/4',
    h1Text: 'Omnia Abd Allah',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/4',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/4',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/4',
    expectedTitle: 'Omnia Abd Allah | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Omnia Abd Allah', item: 'https://al-rahmaacademy.com/academy/teachers/4' },
    ],
  },
  {
    route: '/academy/teachers/4',
    locale: 'ar',
    relPath: 'ar/academy/teachers/4/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/4',
    h1Text: 'أمنية عبد الله',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/4',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/4',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/4',
    expectedTitle: 'أمنية عبد الله | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'أمنية عبد الله', item: 'https://al-rahmaacademy.com/ar/academy/teachers/4' },
    ],
  },
  {
    route: '/academy/teachers/5',
    locale: 'en',
    relPath: 'academy/teachers/5/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/5',
    h1Text: 'Abd Allah Ayman',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/5',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/5',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/5',
    expectedTitle: 'Abd Allah Ayman | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Abd Allah Ayman', item: 'https://al-rahmaacademy.com/academy/teachers/5' },
    ],
  },
  {
    route: '/academy/teachers/5',
    locale: 'ar',
    relPath: 'ar/academy/teachers/5/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/5',
    h1Text: 'عبد الله أيمن',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/5',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/5',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/5',
    expectedTitle: 'عبد الله أيمن | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'عبد الله أيمن', item: 'https://al-rahmaacademy.com/ar/academy/teachers/5' },
    ],
  },
  {
    route: '/academy/teachers/6',
    locale: 'en',
    relPath: 'academy/teachers/6/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/6',
    h1Text: 'Mahmoud Sami',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/6',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/6',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/6',
    expectedTitle: 'Mahmoud Sami | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Mahmoud Sami', item: 'https://al-rahmaacademy.com/academy/teachers/6' },
    ],
  },
  {
    route: '/academy/teachers/6',
    locale: 'ar',
    relPath: 'ar/academy/teachers/6/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/6',
    h1Text: 'محمود سامي',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/6',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/6',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/6',
    expectedTitle: 'محمود سامي | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'محمود سامي', item: 'https://al-rahmaacademy.com/ar/academy/teachers/6' },
    ],
  },
  {
    route: '/academy/teachers/7',
    locale: 'en',
    relPath: 'academy/teachers/7/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/7',
    h1Text: 'Aya',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/7',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/7',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/7',
    expectedTitle: 'Aya | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Aya', item: 'https://al-rahmaacademy.com/academy/teachers/7' },
    ],
  },
  {
    route: '/academy/teachers/7',
    locale: 'ar',
    relPath: 'ar/academy/teachers/7/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/7',
    h1Text: 'آية',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/7',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/7',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/7',
    expectedTitle: 'آية | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'آية', item: 'https://al-rahmaacademy.com/ar/academy/teachers/7' },
    ],
  },
  {
    route: '/academy/teachers/8',
    locale: 'en',
    relPath: 'academy/teachers/8/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/8',
    h1Text: 'Fatima Al-Rashidi',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/8',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/8',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/8',
    expectedTitle: 'Fatima Al-Rashidi | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Fatima Al-Rashidi', item: 'https://al-rahmaacademy.com/academy/teachers/8' },
    ],
  },
  {
    route: '/academy/teachers/8',
    locale: 'ar',
    relPath: 'ar/academy/teachers/8/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/8',
    h1Text: 'فاطمة الراشدي',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/8',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/8',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/8',
    expectedTitle: 'فاطمة الراشدي | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'فاطمة الراشدي', item: 'https://al-rahmaacademy.com/ar/academy/teachers/8' },
    ],
  },
  {
    route: '/academy/teachers/9',
    locale: 'en',
    relPath: 'academy/teachers/9/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/9',
    h1Text: 'Alaa Ragib',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/9',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/9',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/9',
    expectedTitle: 'Alaa Ragib | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Alaa Ragib', item: 'https://al-rahmaacademy.com/academy/teachers/9' },
    ],
  },
  {
    route: '/academy/teachers/9',
    locale: 'ar',
    relPath: 'ar/academy/teachers/9/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/9',
    h1Text: 'علاء رجب',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/9',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/9',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/9',
    expectedTitle: 'علاء رجب | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'علاء رجب', item: 'https://al-rahmaacademy.com/ar/academy/teachers/9' },
    ],
  },
  {
    route: '/academy/teachers/10',
    locale: 'en',
    relPath: 'academy/teachers/10/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/10',
    h1Text: 'Islam Muhammad',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/10',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/10',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/10',
    expectedTitle: 'Islam Muhammad | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Islam Muhammad', item: 'https://al-rahmaacademy.com/academy/teachers/10' },
    ],
  },
  {
    route: '/academy/teachers/10',
    locale: 'ar',
    relPath: 'ar/academy/teachers/10/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/10',
    h1Text: 'إسلام محمد',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/10',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/10',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/10',
    expectedTitle: 'إسلام محمد | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'إسلام محمد', item: 'https://al-rahmaacademy.com/ar/academy/teachers/10' },
    ],
  },
  {
    route: '/academy/teachers/11',
    locale: 'en',
    relPath: 'academy/teachers/11/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/teachers/11',
    h1Text: 'Gouda Al-Shobaki',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/11',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/11',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/11',
    expectedTitle: 'Gouda Al-Shobaki | AL-Rahma Academy',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tutors', item: 'https://al-rahmaacademy.com/academy/teachers' },
      { name: 'Gouda Al-Shobaki', item: 'https://al-rahmaacademy.com/academy/teachers/11' },
    ],
  },
  {
    route: '/academy/teachers/11',
    locale: 'ar',
    relPath: 'ar/academy/teachers/11/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/teachers/11',
    h1Text: 'جودة الشوبكي',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/teachers/11',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/teachers/11',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/teachers/11',
    expectedTitle: 'جودة الشوبكي | AL-Rahma Academy',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'المعلمون', item: 'https://al-rahmaacademy.com/ar/academy/teachers' },
      { name: 'جودة الشوبكي', item: 'https://al-rahmaacademy.com/ar/academy/teachers/11' },
    ],
  },
  // Legal/policy pages (2026-09-26, 6 entries): Privacy, Terms and
  // Refund-policy, en+ar. Same shape and rationale as every wave above:
  // expectedTitle/expectedDescription/h1Text/breadcrumb are literal copies
  // verified directly against the real prerendered dist/public files on
  // disk (never invented, never re-derived), so this suite can catch a
  // real regression rather than just re-agreeing with its own source.
  //   - /academy/privacy: title/description = Privacy.jsx's
  //     copy[lang].seoTitle/seoDescription; h1 = copy[lang].title.
  //   - /academy/terms: title/description = TermsOfService.jsx's
  //     c.title/c.seo; h1 = c.title (same value as the title).
  //   - /academy/refund-policy: title/description = RefundPolicy.jsx's
  //     content.seoTitle/seoDescription; h1 = content.guarantee (the hero
  //     heading, a different string from the seoTitle by design).
  // breadcrumb: all three pages pass a 2-item `items` prop
  // ([{label: Academy, to: '/academy'}, {label: <page title>}]);
  // Breadcrumbs.jsx prepends the localized Home crumb.
  {
    route: '/academy/privacy',
    locale: 'en',
    relPath: 'academy/privacy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/privacy',
    h1Text: 'Privacy Policy',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/privacy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/privacy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/privacy',
    expectedTitle: 'Privacy Policy | AL-Rahma Academy',
    expectedDescription:
      'Read the AL-Rahma Academy privacy policy to understand how we collect, use and protect your personal data.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
      { name: 'Privacy Policy', item: 'https://al-rahmaacademy.com/academy/privacy' },
    ],
  },
  {
    route: '/academy/privacy',
    locale: 'ar',
    relPath: 'ar/academy/privacy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/privacy',
    h1Text: 'سياسة الخصوصية',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/privacy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/privacy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/privacy',
    expectedTitle: 'سياسة الخصوصية | AL-Rahma Academy',
    expectedDescription:
      'اقرأ سياسة خصوصية أكاديمية الرحمة لتعرف كيف نجمع بياناتك الشخصية ونستخدمها ونحميها.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
      { name: 'سياسة الخصوصية', item: 'https://al-rahmaacademy.com/ar/academy/privacy' },
    ],
  },
  {
    route: '/academy/terms',
    locale: 'en',
    relPath: 'academy/terms/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/terms',
    h1Text: 'Terms of Service',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/terms',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/terms',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/terms',
    expectedTitle: 'Terms of Service | AL-Rahma Academy',
    expectedDescription:
      "Terms and conditions governing your use of Al-Rahma Academy's online Quran and Islamic education services.",
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
      { name: 'Terms of Service', item: 'https://al-rahmaacademy.com/academy/terms' },
    ],
  },
  {
    route: '/academy/terms',
    locale: 'ar',
    relPath: 'ar/academy/terms/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/terms',
    h1Text: 'شروط الخدمة',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/terms',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/terms',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/terms',
    expectedTitle: 'شروط الخدمة | AL-Rahma Academy',
    expectedDescription:
      'الشروط والأحكام التي تحكم استخدامك لخدمات أكاديمية الرحمة التعليمية عبر الإنترنت للقرآن الكريم والدراسات الإسلامية.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
      { name: 'شروط الخدمة', item: 'https://al-rahmaacademy.com/ar/academy/terms' },
    ],
  },
  {
    route: '/academy/refund-policy',
    locale: 'en',
    relPath: 'academy/refund-policy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/academy/refund-policy',
    h1Text: '24-Day Refund Window',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/refund-policy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/refund-policy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/refund-policy',
    expectedTitle: 'Refund Policy | AL-Rahma Academy',
    expectedDescription: 'You may request a refund within 24 days of payment. See our Refund Policy for how it works.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Academy', item: 'https://al-rahmaacademy.com/academy' },
      { name: 'Refund Policy', item: 'https://al-rahmaacademy.com/academy/refund-policy' },
    ],
  },
  {
    route: '/academy/refund-policy',
    locale: 'ar',
    relPath: 'ar/academy/refund-policy/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/academy/refund-policy',
    h1Text: 'نافذة استرداد لمدة 24 يومًا',
    expectedEnHref: 'https://al-rahmaacademy.com/academy/refund-policy',
    expectedArHref: 'https://al-rahmaacademy.com/ar/academy/refund-policy',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/academy/refund-policy',
    expectedTitle: 'سياسة الاسترداد | AL-Rahma Academy',
    expectedDescription:
      'يمكنك طلب استرداد المبلغ خلال 24 يومًا من الدفع. راجع سياسة الاسترداد لمعرفة كيفية عملها.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأكاديمية', item: 'https://al-rahmaacademy.com/ar/academy' },
      { name: 'سياسة الاسترداد', item: 'https://al-rahmaacademy.com/ar/academy/refund-policy' },
    ],
  },
  // FAQ (2026-09-26): joined the pilot once fix/faq-render-initial-content
  // (PR #114, already on main) made every answer's text always present in
  // the DOM. expectedTitle/expectedDescription/h1Text are literal copies of
  // FAQ.jsx's own source (src/i18n/en.js+ar.js `faqPg.heading`/`faqPg.sub`,
  // via `useSEO({ title: pg.heading, description: pg.sub })`) verified
  // directly against origin/main, never invented. breadcrumb: FAQ.jsx's own
  // `items={[{ label: t.nav.resources, to: '/resources' }, { label:
  // pg.heading }]}` (src/i18n `nav.resources`); Breadcrumbs.jsx prepends the
  // localized Home crumb. The 8-visible-answers-in-raw-HTML check (the real
  // point of this wave) is a dedicated describe block below, not here --
  // this block only proves the shared metadata contract every prior wave
  // proves.
  {
    route: '/resources/faq',
    locale: 'en',
    relPath: 'resources/faq/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/resources/faq',
    h1Text: 'Frequently Asked Questions',
    expectedEnHref: 'https://al-rahmaacademy.com/resources/faq',
    expectedArHref: 'https://al-rahmaacademy.com/ar/resources/faq',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/resources/faq',
    expectedTitle: 'Frequently Asked Questions | AL-Rahma Academy',
    expectedDescription: 'Everything you need to know about Al-Rahma Academy and our online Quran courses.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Resources', item: 'https://al-rahmaacademy.com/resources' },
      { name: 'Frequently Asked Questions', item: 'https://al-rahmaacademy.com/resources/faq' },
    ],
  },
  {
    route: '/resources/faq',
    locale: 'ar',
    relPath: 'ar/resources/faq/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/resources/faq',
    h1Text: 'الأسئلة الشائعة',
    expectedEnHref: 'https://al-rahmaacademy.com/resources/faq',
    expectedArHref: 'https://al-rahmaacademy.com/ar/resources/faq',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/resources/faq',
    expectedTitle: 'الأسئلة الشائعة | AL-Rahma Academy',
    expectedDescription: 'كل ما تحتاج معرفته عن أكاديمية الرحمة ودوراتنا الإلكترونية في القرآن الكريم.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الموارد', item: 'https://al-rahmaacademy.com/ar/resources' },
      { name: 'الأسئلة الشائعة', item: 'https://al-rahmaacademy.com/ar/resources/faq' },
    ],
  },
  // Static tools (2026-09-26, 6 entries): /tools/prayer, /tools/tasbeeh and
  // /tools/arabic-alphabet, en+ar. expectedTitle/expectedDescription/h1Text
  // are literal copies of each page's own current source, verified
  // directly against origin/main before writing this file, never invented:
  //   - /tools/prayer (IslamicTools.jsx): title/description =
  //     `t.hubs.tools.cards[3]` (src/i18n/en.js+ar.js `hubs.tools.cards[3]`,
  //     the "Prayer & Islamic Tools" card); h1 = the same card's title.
  //   - /tools/tasbeeh (TasbeehPage.jsx): title/description =
  //     `TASBEEH_TEXT[lang].seo` (src/i18n/tools/tasbeeh.js); h1 =
  //     `TASBEEH_TEXT[lang].hero.title` — a different string from the SEO
  //     title by design, same pattern as RefundPolicy's h1Text/expectedTitle.
  //   - /tools/arabic-alphabet (ArabicAlphabetPage.jsx): title/description/h1
  //     = the page's own inline `copy[lang]` object's title/description.
  // breadcrumb: IslamicTools.jsx passes `[{label: t.nav.tools, to:
  // '/tools'}, {label: toolHubCard.title}]` (nav.tools = "Islamic Tools" /
  // "أدوات إسلامية" — the nav label, not the literal word "Tools");
  // TasbeehPage.jsx and ArabicAlphabetPage.jsx each pass their own inline
  // `{tools: 'Tools'/'الأدوات', ...}` literal instead (a different, page-
  // owned string from nav.tools — verified directly in each page's source,
  // not assumed identical). Breadcrumbs.jsx prepends the localized Home
  // crumb in all three cases.
  {
    route: '/tools/prayer',
    locale: 'en',
    relPath: 'tools/prayer/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools/prayer',
    h1Text: 'Prayer & Islamic Tools',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/prayer',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/prayer',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/prayer',
    expectedTitle: 'Prayer & Islamic Tools | AL-Rahma Academy',
    expectedDescription:
      'Prayer times, Qibla compass, Islamic calendar, and Verse of the Day — four dedicated tools for daily worship.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Islamic Tools', item: 'https://al-rahmaacademy.com/tools' },
      { name: 'Prayer & Islamic Tools', item: 'https://al-rahmaacademy.com/tools/prayer' },
    ],
  },
  {
    route: '/tools/prayer',
    locale: 'ar',
    relPath: 'ar/tools/prayer/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools/prayer',
    h1Text: 'الصلاة والأدوات الإسلامية',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/prayer',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/prayer',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/prayer',
    expectedTitle: 'الصلاة والأدوات الإسلامية | AL-Rahma Academy',
    expectedDescription: 'مواقيت الصلاة وبوصلة القبلة والتقويم الإسلامي وآية اليوم — أربع أدوات للعبادة اليومية.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'أدوات إسلامية', item: 'https://al-rahmaacademy.com/ar/tools' },
      { name: 'الصلاة والأدوات الإسلامية', item: 'https://al-rahmaacademy.com/ar/tools/prayer' },
    ],
  },
  {
    route: '/tools/tasbeeh',
    locale: 'en',
    relPath: 'tools/tasbeeh/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools/tasbeeh',
    h1Text: 'Digital Tasbeeh Counter',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/tasbeeh',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/tasbeeh',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/tasbeeh',
    expectedTitle: 'Tasbeeh Counter | AL-Rahma Academy',
    expectedDescription:
      'Free digital tasbeeh counter. Count SubhanAllah, Alhamdulillah, AllahuAkbar and more with progress tracking.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tools', item: 'https://al-rahmaacademy.com/tools' },
      { name: 'Tasbeeh Counter', item: 'https://al-rahmaacademy.com/tools/tasbeeh' },
    ],
  },
  {
    route: '/tools/tasbeeh',
    locale: 'ar',
    relPath: 'ar/tools/tasbeeh/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools/tasbeeh',
    h1Text: 'المسبحة الرقمية',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/tasbeeh',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/tasbeeh',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/tasbeeh',
    expectedTitle: 'مسبحة رقمية | AL-Rahma Academy',
    expectedDescription: 'مسبحة رقمية مجانية: سبحان الله، الحمد لله، الله أكبر، لا إله إلا الله. تتبع أذكارك اليومية.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأدوات', item: 'https://al-rahmaacademy.com/ar/tools' },
      { name: 'المسبحة', item: 'https://al-rahmaacademy.com/ar/tools/tasbeeh' },
    ],
  },
  {
    route: '/tools/arabic-alphabet',
    locale: 'en',
    relPath: 'tools/arabic-alphabet/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools/arabic-alphabet',
    h1Text: 'Arabic Alphabet',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/arabic-alphabet',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/arabic-alphabet',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/arabic-alphabet',
    expectedTitle: 'Arabic Alphabet | AL-Rahma Academy',
    expectedDescription:
      'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — free from Al-Rahma Academy.',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tools', item: 'https://al-rahmaacademy.com/tools' },
      { name: 'Arabic Alphabet', item: 'https://al-rahmaacademy.com/tools/arabic-alphabet' },
    ],
  },
  {
    route: '/tools/arabic-alphabet',
    locale: 'ar',
    relPath: 'ar/tools/arabic-alphabet/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools/arabic-alphabet',
    h1Text: 'الأبجدية العربية',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/arabic-alphabet',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/arabic-alphabet',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/arabic-alphabet',
    expectedTitle: 'الأبجدية العربية | AL-Rahma Academy',
    expectedDescription: 'تعلّم الحروف العربية الـ٢٨ مع النطق الصوتي والتدريبات التفاعلية — مجاناً من أكاديمية الرحمة.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأدوات', item: 'https://al-rahmaacademy.com/ar/tools' },
      { name: 'الأبجدية العربية', item: 'https://al-rahmaacademy.com/ar/tools/arabic-alphabet' },
    ],
  },
  // Adhkar (2026-09-26, 2 entries): /tools/adhkar, en+ar. expectedTitle/
  // expectedDescription/h1Text are literal copies of the real `adhkar`
  // block in src/i18n/en.js+ar.js (heading/sub), verified directly against
  // origin/main before writing this file. Unlike prayer/tasbeeh/
  // arabic-alphabet, Adhkar.jsx builds its breadcrumb parent from
  // `t.nav.tools` ("Islamic Tools"/"أدوات إسلامية"), not an inline
  // {tools: ...} literal, so this entry's breadcrumb intentionally differs
  // in wording from the tasbeeh/arabic-alphabet entries above — verified
  // against the real live BreadcrumbList JSON-LD, not assumed.
  {
    route: '/tools/adhkar',
    locale: 'en',
    relPath: 'tools/adhkar/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools/adhkar',
    h1Text: "Adhkar & Du'a Library",
    expectedEnHref: 'https://al-rahmaacademy.com/tools/adhkar',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/adhkar',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/adhkar',
    expectedTitle: "Adhkar & Du'a Library | AL-Rahma Academy",
    expectedDescription: 'Daily adhkar with full diacritics, virtues & sources',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Islamic Tools', item: 'https://al-rahmaacademy.com/tools' },
      { name: 'Adhkar', item: 'https://al-rahmaacademy.com/tools/adhkar' },
    ],
  },
  {
    route: '/tools/adhkar',
    locale: 'ar',
    relPath: 'ar/tools/adhkar/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools/adhkar',
    h1Text: 'مكتبة الأذكار والأدعية',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/adhkar',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/adhkar',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/adhkar',
    expectedTitle: 'مكتبة الأذكار والأدعية | AL-Rahma Academy',
    expectedDescription: 'أذكار يومية بتشكيل كامل مع الفضائل والمصادر',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'أدوات إسلامية', item: 'https://al-rahmaacademy.com/ar/tools' },
      { name: 'الأذكار', item: 'https://al-rahmaacademy.com/ar/tools/adhkar' },
    ],
  },
  // Tajweed Checker SEO Publication Gate (2026-09-30): the only route this
  // wave adds, en+ar+fr all at once — a dedicated readiness audit found no
  // real blocker (no fetch/geolocation/localStorage/session/Date.now()
  // affecting initial render; the SpeechRecognition mic only ever starts on
  // a real user's own click, never during prerender.mjs's own automated
  // page load, so transcript/score/listening state can never leak into this
  // file). expectedTitle/expectedDescription/h1Text/breadcrumb are literal
  // copies of TAJWEED_CHECKER_TEXT (i18n/tools/tajweedChecker.js)'s own
  // seo/hero/breadcrumbs fields — this page's own breadcrumbs.tools label
  // ("Tools"/"الأدوات"/"Outils") is a local field distinct from the global
  // nav's t.nav.tools ("Islamic Tools"/"أدوات إسلامية") the /tools/adhkar
  // entries above use, verified against the real live BreadcrumbList
  // JSON-LD, not assumed.
  {
    route: '/tools/tajweed-checker',
    locale: 'en',
    relPath: 'tools/tajweed-checker/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/tools/tajweed-checker',
    h1Text: 'Tajweed Checker',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/tajweed-checker',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/tajweed-checker',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/tajweed-checker',
    expectedTitle: 'AI Tajweed Checker | AL-Rahma Academy',
    expectedDescription: 'Practice Quran recitation and get instant AI feedback on your Tajweed',
    breadcrumb: [
      { name: 'Home', item: 'https://al-rahmaacademy.com/' },
      { name: 'Tools', item: 'https://al-rahmaacademy.com/tools' },
      { name: 'Tajweed Checker', item: 'https://al-rahmaacademy.com/tools/tajweed-checker' },
    ],
  },
  {
    route: '/tools/tajweed-checker',
    locale: 'ar',
    relPath: 'ar/tools/tajweed-checker/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/ar/tools/tajweed-checker',
    h1Text: 'مدقق التجويد',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/tajweed-checker',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/tajweed-checker',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/tajweed-checker',
    expectedTitle: 'مدقق التجويد بالذكاء الاصطناعي | AL-Rahma Academy',
    expectedDescription: 'تدرّب على تلاوة القرآن الكريم واحصل على تقييم فوري بالذكاء الاصطناعي',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الأدوات', item: 'https://al-rahmaacademy.com/ar/tools' },
      { name: 'مدقق التجويد', item: 'https://al-rahmaacademy.com/ar/tools/tajweed-checker' },
    ],
  },
  {
    route: '/tools/tajweed-checker',
    locale: 'fr',
    relPath: 'fr/tools/tajweed-checker/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/tools/tajweed-checker',
    h1Text: 'Vérificateur de tajwid',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/tajweed-checker',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/tajweed-checker',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/tajweed-checker',
    expectedTitle: 'Vérificateur de tajwid par IA | AL-Rahma Academy',
    expectedDescription: 'Entraînez-vous à réciter le Coran et recevez un retour instantané par IA sur votre tajwid',
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Outils', item: 'https://al-rahmaacademy.com/fr/tools' },
      { name: 'Vérificateur de tajwid', item: 'https://al-rahmaacademy.com/fr/tools/tajweed-checker' },
    ],
  },

  // French SEO Publication Wave (2026-09-30): 5 fr-only routes — no en/ar
  // entries here at all (unlike every LITERAL_FILES entry above), since
  // en/ar are not published for any of these 5 (see
  // scripts/prerender-routes.mjs's own comment on this exact wave).
  // expectedEnHref/expectedArHref are still given (used only for the
  // x-default and "no hreflang=ar" assertions above), literal per the same
  // rule as expectedCanonical.
  {
    route: '/tools/verse-of-the-day',
    locale: 'fr',
    relPath: 'fr/tools/verse-of-the-day/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/tools/verse-of-the-day',
    h1Text: 'Verset du jour',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/verse-of-the-day',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/verse-of-the-day',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/verse-of-the-day',
    expectedTitle: 'Verset du jour | AL-Rahma Academy',
    expectedDescription: 'Un verset du Coran choisi chaque jour avec sa traduction — commencez la journée par les paroles d’Allah.',
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Outils', item: 'https://al-rahmaacademy.com/fr/tools' },
      { name: 'Outils de prière', item: 'https://al-rahmaacademy.com/fr/tools/prayer' },
      { name: 'Verset du jour', item: 'https://al-rahmaacademy.com/fr/tools/verse-of-the-day' },
    ],
  },
  {
    route: '/tools/quran-reader',
    locale: 'fr',
    relPath: 'fr/tools/quran-reader/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/tools/quran-reader',
    // Real h1 text at the moment this capture happens: the reader's own
    // chapter fetch is deliberately skipped for this capture (see
    // Quran.jsx's own comment), so QuranChapterHeader.jsx's fallback title
    // (the reader's general page title, not a specific surah name yet) is
    // what actually renders — see that component's own comment for why
    // this fallback exists at all now.
    h1Text: "Centre d'apprentissage du Coran",
    expectedEnHref: 'https://al-rahmaacademy.com/tools/quran-reader',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/quran-reader',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/quran-reader',
    expectedTitle: 'Lire et écouter le Coran | AL-Rahma Academy',
    expectedDescription: 'Lisez, écoutez et mémorisez le Saint Coran avec des traductions, le tafsir, le mode de mémorisation et des raccourcis clavier.',
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Outils islamiques', item: 'https://al-rahmaacademy.com/fr/tools' },
      { name: 'Lecteur du Coran', item: 'https://al-rahmaacademy.com/fr/tools/quran-reader' },
    ],
  },
  {
    route: '/tools/hadith',
    locale: 'fr',
    relPath: 'fr/tools/hadith/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/tools/hadith',
    h1Text: 'Bibliothèque islamique de hadiths',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/hadith',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/hadith',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/hadith',
    expectedTitle: 'Bibliothèque des Hadiths | AL-Rahma Academy',
    expectedDescription: 'Parcourez et recherchez 10 recueils de hadiths authentiques, dont Sahih al-Bukhari, Sahih Muslim et Sunan Abi Dawud.',
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Outils islamiques', item: 'https://al-rahmaacademy.com/fr/tools' },
      { name: 'Bibliothèque de hadiths', item: 'https://al-rahmaacademy.com/fr/tools/hadith' },
    ],
  },
  {
    route: '/tools/prayer-times',
    locale: 'fr',
    relPath: 'fr/tools/prayer-times/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/tools/prayer-times',
    h1Text: 'Horaires de prière',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/prayer-times',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/prayer-times',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/prayer-times',
    expectedTitle: 'Horaires de prière | AL-Rahma Academy',
    expectedDescription: 'Horaires de prière précis pour votre position, avec compte à rebours en direct, alertes de prière et calendrier mensuel complet.',
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Outils', item: 'https://al-rahmaacademy.com/fr/tools' },
      { name: 'Outils de prière', item: 'https://al-rahmaacademy.com/fr/tools/prayer' },
      { name: 'Horaires de prière', item: 'https://al-rahmaacademy.com/fr/tools/prayer-times' },
    ],
  },
  // Italian SEO Publication Gate wave 3 (2026-10-03): /tools/hadith and
  // /tools/prayer-times join fr; /enroll does not (frozen timezone).
  {
    route: '/tools/hadith',
    locale: 'it',
    relPath: 'it/tools/hadith/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/it/tools/hadith',
    h1Text: 'Biblioteca islamica degli Hadith',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/hadith',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/hadith',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/hadith',
    expectedTitle: 'Biblioteca degli Hadith | AL-Rahma Academy',
    expectedDescription: 'Sfoglia e cerca 10 raccolte autentiche di hadith, tra cui Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud e altre.',
    breadcrumb: [
      { name: 'Pagina iniziale', item: 'https://al-rahmaacademy.com/it/' },
      { name: 'Strumenti Islamici', item: 'https://al-rahmaacademy.com/it/tools' },
      { name: 'Biblioteca Hadith', item: 'https://al-rahmaacademy.com/it/tools/hadith' },
    ],
  },
  {
    route: '/tools/prayer-times',
    locale: 'it',
    relPath: 'it/tools/prayer-times/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/it/tools/prayer-times',
    h1Text: 'Orari di preghiera',
    expectedEnHref: 'https://al-rahmaacademy.com/tools/prayer-times',
    expectedArHref: 'https://al-rahmaacademy.com/ar/tools/prayer-times',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/tools/prayer-times',
    expectedTitle: 'Orari di preghiera | AL-Rahma Academy',
    expectedDescription: 'Orari di preghiera precisi per la tua posizione, con conto alla rovescia in diretta, avvisi di preghiera e calendario mensile completo.',
    breadcrumb: [
      { name: 'Pagina iniziale', item: 'https://al-rahmaacademy.com/it/' },
      { name: 'Strumenti', item: 'https://al-rahmaacademy.com/it/tools' },
      { name: 'Strumenti per la preghiera', item: 'https://al-rahmaacademy.com/it/tools/prayer' },
      { name: 'Orari di preghiera', item: 'https://al-rahmaacademy.com/it/tools/prayer-times' },
    ],
  },
  {
    route: '/enroll',
    locale: 'fr',
    relPath: 'fr/enroll/index.html',
    expectedCanonical: 'https://al-rahmaacademy.com/fr/enroll',
    h1Text: 'Inscrivez-vous à Al-Rahma Academy',
    expectedEnHref: 'https://al-rahmaacademy.com/enroll',
    expectedArHref: 'https://al-rahmaacademy.com/ar/enroll',
    expectedFrHref: 'https://al-rahmaacademy.com/fr/enroll',
    expectedTitle: 'Réserver des cours d\'essai gratuits | AL-Rahma Academy',
    expectedDescription: 'Un cours d\'essai de Coran individuel et gratuit — sans paiement, sans engagement. Choisissez vos matières, choisissez un enseignant certifié par Al-Azhar et réservez votre formule — nous confirmerons avec vous votre planning et le paiement sur WhatsApp.',
    // Enroll.jsx now renders <Breadcrumbs> inside .sr-only (see its own
    // comment) — a real build attempt confirmed waitForHydratedSeo()
    // requires a BreadcrumbList on every non-Home route, no exemption.
    breadcrumb: [
      { name: 'Accueil', item: 'https://al-rahmaacademy.com/fr/' },
      { name: 'Essai gratuit', item: 'https://al-rahmaacademy.com/fr/enroll' },
    ],
  },
];

describe.skipIf(!distExists)('Prerender output (dist/public) — real files on disk, post-build only', () => {
  it.each(PRERENDER_MANIFEST)('$route @ $locale: correct raw HTML before any JavaScript', (entry) => {
    const filePath = path.join(distDir, outputRelPathFor(entry));
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedDir = entry.locale === 'ar' ? 'rtl' : 'ltr';

    expect(document.documentElement.lang, 'html[lang]').toBe(entry.locale);
    expect(document.documentElement.dir, 'html[dir]').toBe(expectedDir);

    const title = document.title;
    expect(title, 'title must not be empty').toBeTruthy();
    expect(title, 'title must not be the pre-hydration SPA shell').not.toBe(SHELL_TITLE);

    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    expect(description, 'meta description must be present').toBeTruthy();

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical, 'canonical').toBe(canonicalUrlFor(entry));

    const main = document.querySelector('#main-content');
    expect(main, '#main-content must exist').toBeTruthy();
    expect(main.textContent.trim().length, '#main-content must have real hydrated text').toBeGreaterThan(0);
  });

  it('all prerendered files are not byte-identical to each other (each is genuinely page-specific)', () => {
    const contents = PRERENDER_MANIFEST.map((entry) =>
      readFileSync(path.join(distDir, outputRelPathFor(entry)), 'utf8'),
    );
    const unique = new Set(contents);
    expect(unique.size, `expected ${PRERENDER_MANIFEST.length} distinct HTML files, not copies of one shell`).toBe(PRERENDER_MANIFEST.length);
  });
});

describe.skipIf(distExists)('Prerender output — dist/public not present (expected before a real build)', () => {
  it('is explicitly skipped here, not silently treated as a pass', () => {
    expect(distExists).toBe(false);
  });
});

// Same "skip before build, run after" rule as the primary describe block
// above — this reads real files too, so it needs dist/public to exist
// just as much.
describe.skipIf(!distExists)('Prerender output — literal dist/public paths (independent of outputRelPathFor)', () => {
  it.each(LITERAL_FILES)('$relPath: correct raw HTML at the literal path', ({ route, locale, relPath, expectedCanonical, h1Text, expectedEnHref, expectedArHref, expectedFrHref, expectedTitle, expectedDescription, breadcrumb }) => {
    const filePath = path.join(distDir, relPath);
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
    expect(document.documentElement.lang, 'html[lang]').toBe(locale);
    expect(document.documentElement.dir, 'html[dir]').toBe(expectedDir);

    const title = document.title;
    expect(title, 'title must not be empty').toBeTruthy();
    expect(title, 'title must not be the pre-hydration SPA shell').not.toBe(SHELL_TITLE);
    if (expectedTitle) {
      expect(title, 'title must exactly match the current SEO source, no duplicated academy name').toBe(expectedTitle);
    }

    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    expect(description, 'meta description must not be empty').toBeTruthy();
    expect(description, 'meta description must not be the pre-hydration SPA shell').not.toBe(SHELL_DESCRIPTION);
    if (expectedDescription) {
      expect(description, 'meta description must exactly match the current SEO source').toBe(expectedDescription);
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical, 'canonical').toBe(expectedCanonical);

    const heading = document.querySelector('h1');
    expect(heading, 'h1 must exist in body').toBeTruthy();
    expect(heading.textContent.trim(), 'h1 must be the real page-specific heading, not empty/placeholder').toBe(h1Text);

    // hreflang fix (2026-09-21), extended for the French SEO Publication
    // Gate (2026-09-30) and the French SEO Publication Wave (2026-09-30,
    // /tools/verse-of-the-day, /tools/quran-reader, /tools/hadith,
    // /tools/prayer-times, /enroll — fr-only, the first entries in this
    // file where en/ar/it are NOT all published alongside fr): the static
    // SPA shell's inherited block must be fully replaced by the real,
    // reciprocal set of alternates for every locale ACTUALLY published for
    // THIS route, per PRERENDER_MANIFEST itself — not a hardcoded
    // [en,ar,fr(,it)] guess. A per-route regex here (this file's own prior
    // approach) is exactly the kind of second, independently-maintained
    // "which locales does this route publish" list that silently drifted
    // out of sync with PRERENDER_MANIFEST when the Tajweed Checker and
    // Italian waves landed through concurrent PRs the same day (caught only
    // by CI's real dist build, not locally) — deriving straight from the
    // manifest makes that whole bug class structurally impossible instead
    // of fixing one more regex by hand.
    const hreflangEls = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
    const publishedLocales = PRERENDER_MANIFEST
      .filter((e) => e.route === route && e.status === 'published')
      .map((e) => e.locale);
    expect(hreflangEls.length, 'one hreflang per published locale + x-default, no more').toBe(publishedLocales.length + 1);

    const byHreflang = Object.fromEntries(hreflangEls.map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]));
    // x-default always points at the English-path form of this route (see
    // hreflangLinksFor()'s own comment) even when English itself is not a
    // published locale for this exact route (the fr-only wave above) — the
    // English URL still resolves (served by the generic SPA shell, just
    // not prerendered), so it remains a valid, deliberate x-default target.
    expect(byHreflang['x-default'], 'hreflang=x-default must point at the English-path URL').toBe(expectedEnHref);
    if (publishedLocales.includes('en')) {
      expect(byHreflang.en, 'hreflang=en must point at the English version of this same page').toBe(expectedEnHref);
    } else {
      expect(byHreflang.en, 'no hreflang=en — English is not published for this route').toBeUndefined();
    }
    if (publishedLocales.includes('ar')) {
      expect(byHreflang.ar, 'hreflang=ar must point at the Arabic version of this same page').toBe(expectedArHref);
    } else {
      expect(byHreflang.ar, 'no hreflang=ar — Arabic is not published for this route').toBeUndefined();
    }
    if (publishedLocales.includes('fr')) {
      expect(byHreflang.fr, 'hreflang=fr must point at the French version of this same page').toBe(expectedFrHref);
    } else {
      expect(byHreflang.fr, 'no hreflang=fr — French is not published for this route').toBeUndefined();
    }
    if (publishedLocales.includes('it')) {
      expect(byHreflang.it, 'hreflang=it must point at the Italian version of this same page').toBe(expectedFrHref.replace('/fr', '/it'));
    } else {
      expect(byHreflang.it, 'no hreflang=it — Italian is not published for this route').toBeUndefined();
    }
    expect(byHreflang.es, 'no hreflang=es — es is not a published language').toBeUndefined();
    expect(byHreflang.de, 'no hreflang=de — de is not a published language').toBeUndefined();

    // og:locale fix (French SEO Publication Gate, 2026-09-30): same
    // reciprocal-set guarantee as hreflang above, via ogLocaleFor() —
    // the static shell's inherited og:locale (always en_GB primary) and
    // og:locale:alternate (it_IT/es_ES/de_DE/fr_FR, none reciprocal) must be
    // fully replaced with this page's real self locale + real alternates.
    const OG_LOCALE_BY_LOCALE = { en: 'en_GB', ar: 'ar_EG', fr: 'fr_FR', it: 'it_IT' };
    const ogLocaleEl = document.querySelector('meta[property="og:locale"]');
    expect(ogLocaleEl, 'meta[property="og:locale"] must exist').toBeTruthy();
    expect(ogLocaleEl.getAttribute('content'), 'og:locale must be this page\'s own locale').toBe(OG_LOCALE_BY_LOCALE[locale]);

    const ogAlternateEls = [...document.querySelectorAll('meta[property="og:locale:alternate"]')];
    const ogAlternates = ogAlternateEls.map((el) => el.getAttribute('content'));
    const expectedOtherLocales = publishedLocales.filter((l) => l !== locale);
    expect(ogAlternates.sort(), 'og:locale:alternate must list exactly the other published locales for this route').toEqual(
      expectedOtherLocales.map((l) => OG_LOCALE_BY_LOCALE[l]).sort(),
    );

    // Localized Breadcrumb JSON-LD fix (2026-09-21): Breadcrumbs.jsx is the
    // sole writer of script[data-seo="breadcrumb"], built from the exact
    // same trail it renders for the visitor. Home never mounts
    // <Breadcrumbs> (breadcrumb === null here) — it correctly gets no
    // BreadcrumbList at all, which is intended behavior, not a regression.
    const breadcrumbScript = document.querySelector('script[data-seo="breadcrumb"]');
    if (breadcrumb === null) {
      expect(breadcrumbScript, 'this page never renders <Breadcrumbs>, so it must have no BreadcrumbList').toBeNull();
    } else {
      expect(breadcrumbScript, 'missing script[data-seo="breadcrumb"]').toBeTruthy();
      const parsedBreadcrumb = JSON.parse(breadcrumbScript.textContent);
      expect(parsedBreadcrumb['@type']).toBe('BreadcrumbList');
      expect(parsedBreadcrumb.itemListElement.map((i) => i.position)).toEqual(breadcrumb.map((_, i) => i + 1));
      expect(
        parsedBreadcrumb.itemListElement.map((i) => ({ name: i.name, item: i.item })),
        'BreadcrumbList names/URLs must exactly match the real visible trail, in order',
      ).toEqual(breadcrumb);
      if (locale === 'ar') {
        parsedBreadcrumb.itemListElement.forEach((i) => {
          expect(i.name, `Arabic BreadcrumbList must not contain an English/URL-derived name: "${i.name}"`).not.toMatch(/[a-zA-Z]/);
        });
      }
    }
  });
});

// FAQ raw-HTML answers (2026-09-26): the actual point of this wave.
// fix/faq-render-initial-content (PR #114) fixed FAQ.jsx so every visible
// answer is always in the DOM (hidden via the standard `hidden` attribute
// when its question is closed, never conditionally unmounted) instead of
// only the open question's answer. An independent review of this PR then
// found FAQ.jsx still sliced `items` down to the first VISIBLE (8) before
// ever mapping them into JSX, so questions 9-18 (faqItems.js has 18 total)
// never reached the DOM at all -- not even hidden -- until "Show all" was
// clicked, meaning the raw prerendered HTML a crawler actually receives
// only ever carried 8 of the 18 real FAQ entries. Fixed alongside this
// test: every one of the 18 items is now always mapped into the DOM, with
// items 9-18's whole `.faq-item` row (not just its answer) hidden via the
// same standard `hidden` attribute, tied to the (always-false-at-prerender-
// time) `showAll` state, instead of being sliced out. Expected answers are
// derived from the real src/data/faqItems.js (the same `item[lang] ||
// item.en` selection FAQ.jsx itself uses), not re-invented literals -- a
// real wording change in faqItems.js is a real content change these
// fixtures should track, not a drift this suite should treat as a false
// failure.
describe.skipIf(!distExists)('FAQ prerender output — all 18 questions present in raw HTML, only first 8 rows visible', () => {
  const FAQ_VISIBLE = 8;
  const faqFiles = [
    { locale: 'en', relPath: 'resources/faq/index.html' },
    { locale: 'ar', relPath: 'ar/resources/faq/index.html' },
  ];

  it.each(faqFiles)('$relPath: all 18 answers are in the raw pre-JS HTML; rows 9-18 hidden until "Show all"', ({ locale, relPath }) => {
    const filePath = path.join(distDir, relPath);
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedAnswers = faqItems.map((item) => (item[locale] || item.en).a);

    const panels = [...document.querySelectorAll('.faq-item__a')];
    expect(panels.length, `all ${faqItems.length} answer panels must be in the raw HTML, not just the first ${FAQ_VISIBLE}`).toBe(
      faqItems.length,
    );

    const actualTexts = panels.map((p) => p.textContent.trim());
    expect(actualTexts, 'answer text must match the real faqItems.js content, in order').toEqual(expectedAnswers);

    for (const panel of panels) {
      expect(
        panel.hasAttribute('hidden'),
        'no question is open by default, so every answer panel must carry the standard hidden attribute in the raw HTML too',
      ).toBe(true);
    }

    const rows = [...document.querySelectorAll('.faq-item')];
    expect(rows.length, `all ${faqItems.length} question rows must be in the raw HTML`).toBe(faqItems.length);
    rows.forEach((row, i) => {
      expect(
        row.hasAttribute('hidden'),
        `row ${i} must be hidden in the raw HTML iff it is beyond the default-visible first ${FAQ_VISIBLE}`,
      ).toBe(i >= FAQ_VISIBLE);
    });
  });
});

// Adhkar raw-HTML categories/cards (2026-09-26): fix/adhkar-initial-content
// (PR #117, already on main) fixed Adhkar.jsx so every category's cards
// stay mounted at all times, with only the non-selected categories hidden
// via the standard `hidden` attribute (the same mechanism as FAQ's rows
// above) instead of only the selected category ever being rendered at all.
// Counts and the default-visible category are derived from the real
// src/data/adhkarData.js (CATEGORY_KEYS/ADHKAR), not invented literals, so
// a real content change there is a real change these fixtures should
// track, not a drift this suite should treat as a false failure.
describe.skipIf(!distExists)('Adhkar prerender output — every category/card present in raw HTML, only the default category visible', () => {
  const DEFAULT_CATEGORY = 'sabah';
  const TOTAL_CATEGORIES = CATEGORY_KEYS.length;
  const TOTAL_CARDS = CATEGORY_KEYS.reduce((sum, key) => sum + ADHKAR[key].items.length, 0);
  const DEFAULT_CATEGORY_COUNT = ADHKAR[DEFAULT_CATEGORY].items.length;

  const adhkarFiles = [
    { locale: 'en', relPath: 'tools/adhkar/index.html' },
    { locale: 'ar', relPath: 'ar/tools/adhkar/index.html' },
  ];

  it.each(adhkarFiles)(
    `$relPath: all ${TOTAL_CATEGORIES} categories / ${TOTAL_CARDS} cards in raw HTML; only "${DEFAULT_CATEGORY}" visible by default`,
    ({ relPath }) => {
      const filePath = path.join(distDir, relPath);
      expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

      const html = readFileSync(filePath, 'utf8');
      const dom = new JSDOM(html);
      const { document } = dom.window;

      const lists = [...document.querySelectorAll('.adhkar__list')];
      expect(lists.length, `all ${TOTAL_CATEGORIES} category groups must be in the raw HTML, not just the default one`).toBe(
        TOTAL_CATEGORIES,
      );

      const totalCards = lists.reduce((sum, list) => sum + list.querySelectorAll('.adhkar__card').length, 0);
      expect(totalCards, `all ${TOTAL_CARDS} cards must be in the raw HTML`).toBe(TOTAL_CARDS);

      const visibleLists = lists.filter((list) => !list.parentElement.hasAttribute('hidden'));
      expect(visibleLists.length, 'exactly one category group must be visible by default in the raw HTML').toBe(1);
      expect(
        visibleLists[0].querySelectorAll('.adhkar__card').length,
        `the visible-by-default group must be "${DEFAULT_CATEGORY}" with its real ${DEFAULT_CATEGORY_COUNT} cards`,
      ).toBe(DEFAULT_CATEGORY_COUNT);

      const hiddenLists = lists.filter((list) => list.parentElement.hasAttribute('hidden'));
      expect(hiddenLists.length, `the other ${TOTAL_CATEGORIES - 1} category groups must be present but hidden`).toBe(
        TOTAL_CATEGORIES - 1,
      );
      const hiddenCardCount = hiddenLists.reduce((sum, list) => sum + list.querySelectorAll('.adhkar__card').length, 0);
      expect(hiddenCardCount, 'hidden groups together must account for every card outside the default category').toBe(
        TOTAL_CARDS - DEFAULT_CATEGORY_COUNT,
      );
    },
  );
});

// Unconditional — pure logic, no filesystem access, so it runs both
// before and after a build. Proves outputRelPathFor() can never silently
// drift from the literal paths the block above (and prerender.mjs itself,
// via the same shared helper) actually depend on.
describe('outputRelPathFor() matches the literal dist/public paths above (no drift)', () => {
  it.each(LITERAL_FILES)('$route @ $locale -> $relPath', ({ route, locale, relPath }) => {
    expect(outputRelPathFor({ route, locale })).toBe(relPath);
  });
});

// Italian Ijazah SEO Publication (2026-09-30): strict raw-HTML checks for
// /it/courses/ijazah, plus proof that its en/ar/fr siblings now advertise
// the Italian alternate too and that the still-unpublished Italian routes
// stay out. Literal expectations, not derived from the manifest helpers.
describe.skipIf(!distExists)('Italian Ijazah prerender (dist/public) — raw HTML before any JavaScript', () => {
  const ORIGIN_ = 'https://al-rahmaacademy.com';
  const load = (rel) => new JSDOM(readFileSync(path.join(distDir, rel), 'utf8')).window.document;

  it('it/courses/ijazah/index.html: lang, canonical, og:locale, Italian title/description/H1', () => {
    const doc = load('it/courses/ijazah/index.html');
    expect(doc.documentElement.lang).toBe('it');
    expect(doc.documentElement.dir).toBe('ltr');
    expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN_}/it/courses/ijazah`);
    expect(doc.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe('it_IT');
    expect(
      [...doc.querySelectorAll('meta[property="og:locale:alternate"]')].map((m) => m.getAttribute('content')).sort(),
    ).toEqual(['ar_EG', 'en_GB', 'fr_FR']);
    expect(doc.title).toBe('Corso Ijazah del Corano | AL-Rahma Academy');
    expect(doc.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      "Ottieni un'Ijazah coranica ufficiale con un Sanad ininterrotto fino al Profeta ﷺ. Studia Matn Al-Jazariyyah, Al-Shatibiyyah e le sette Qira'at con studiosi certificati di Al-Azhar.",
    );
    expect(doc.querySelector('h1').textContent.trim()).toBe('Corso Ijazah del Corano');
  });

  it('it/courses/ijazah: exactly five hreflang alternates (en, ar, fr, it, x-default)', () => {
    const doc = load('it/courses/ijazah/index.html');
    const links = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(links).toHaveLength(5);
    expect(Object.fromEntries(links.map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]))).toEqual({
      en: `${ORIGIN_}/courses/ijazah`,
      ar: `${ORIGIN_}/ar/courses/ijazah`,
      fr: `${ORIGIN_}/fr/courses/ijazah`,
      it: `${ORIGIN_}/it/courses/ijazah`,
      'x-default': `${ORIGIN_}/courses/ijazah`,
    });
  });

  it('it/courses/ijazah: Italian Course JSON-LD and Italian BreadcrumbList', () => {
    const doc = load('it/courses/ijazah/index.html');
    const course = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent))
      .flat()
      .find((j) => j['@type'] === 'Course');
    expect(course.name).toBe('Corso di certificazione Ijazah del Corano');
    expect(course.educationalLevel).toBe('Avanzato');
    expect(course.teaches).toBe("Ijazah del Corano, Tajweed, Matn Al-Jazariyyah, Al-Shatibiyyah, sette Qira'at");
    expect(course.inLanguage).toEqual(['en', 'ar']);
    const crumbs = JSON.parse(doc.querySelector('script[data-seo="breadcrumb"]').textContent);
    expect(crumbs.itemListElement.map((i) => ({ name: i.name, item: i.item }))).toEqual([
      { name: 'Pagina iniziale', item: `${ORIGIN_}/it/` },
      { name: 'Corsi', item: `${ORIGIN_}/it/courses` },
      { name: 'Corso Ijazah del Corano', item: `${ORIGIN_}/it/courses/ijazah` },
    ]);
  });

  it.each([
    ['courses/ijazah/index.html', 'en'],
    ['ar/courses/ijazah/index.html', 'ar'],
    ['fr/courses/ijazah/index.html', 'fr'],
  ])('%s now advertises the Italian alternate too (five hreflangs, it_IT alternate)', (rel) => {
    const doc = load(rel);
    const byLang = Object.fromEntries(
      [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]),
    );
    expect(Object.keys(byLang).sort()).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
    expect(byLang.it).toBe(`${ORIGIN_}/it/courses/ijazah`);
    expect(
      [...doc.querySelectorAll('meta[property="og:locale:alternate"]')].map((m) => m.getAttribute('content')),
    ).toContain('it_IT');
  });

});

// Italian Islamic Studies SEO Publication (2026-10-01): strict raw-HTML checks
// for /it/courses/islamic-studies, including the Hadith of the Day placeholder
// (the prerender capture never resolves a hadith, so the static file must
// carry the Italian placeholder and no hadith/date). Literal expectations.
describe.skipIf(!distExists)('Italian Islamic Studies prerender (dist/public) — raw HTML before any JavaScript', () => {
  const ORIGIN_ = 'https://al-rahmaacademy.com';
  const load = (rel) => new JSDOM(readFileSync(path.join(distDir, rel), 'utf8')).window.document;
  const REL = 'it/courses/islamic-studies/index.html';

  it('lang, canonical, og:locale, Italian title/description/H1', () => {
    expect(existsSync(path.join(distDir, REL))).toBe(true);
    const doc = load(REL);
    expect(doc.documentElement.lang).toBe('it');
    expect(doc.documentElement.dir).toBe('ltr');
    expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN_}/it/courses/islamic-studies`);
    expect(doc.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe('it_IT');
    expect(
      [...doc.querySelectorAll('meta[property="og:locale:alternate"]')].map((m) => m.getAttribute('content')).sort(),
    ).toEqual(['ar_EG', 'en_GB', 'fr_FR']);
    expect(doc.title).toBe('Corso di Studi Islamici | AL-Rahma Academy');
    expect(doc.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Un programma completo basato sulle fonti che copre Aqeedah, Fiqh, Seerah, Hadith e Tafsir — 5 moduli strutturati insegnati da studiosi certificati nella tua lingua.',
    );
    expect(doc.querySelector('h1').textContent.trim()).toBe('Studi Islamici');
  });

  it('exactly five hreflang alternates (en, ar, fr, it, x-default)', () => {
    const links = [...load(REL).querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(links).toHaveLength(5);
    expect(Object.fromEntries(links.map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]))).toEqual({
      en: `${ORIGIN_}/courses/islamic-studies`,
      ar: `${ORIGIN_}/ar/courses/islamic-studies`,
      fr: `${ORIGIN_}/fr/courses/islamic-studies`,
      it: `${ORIGIN_}/it/courses/islamic-studies`,
      'x-default': `${ORIGIN_}/courses/islamic-studies`,
    });
  });

  it('Italian Course JSON-LD and Italian BreadcrumbList', () => {
    const doc = load(REL);
    const course = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent))
      .flat()
      .find((j) => j['@type'] === 'Course');
    expect(course.name).toBe('Corso di Studi Islamici');
    expect(course.educationalLevel).toBe('Tutti i livelli');
    expect(course.teaches).toBe('Aqeedah, Fiqh, Seerah, Hadith, Tafsir, Studi Islamici');
    expect(course.inLanguage).toEqual(['en', 'ar']);
    const crumbs = JSON.parse(doc.querySelector('script[data-seo="breadcrumb"]').textContent);
    expect(crumbs.itemListElement.map((i) => ({ name: i.name, item: i.item }))).toEqual([
      { name: 'Pagina iniziale', item: `${ORIGIN_}/it/` },
      { name: 'Corsi', item: `${ORIGIN_}/it/courses` },
      { name: 'Corso di Studi Islamici', item: `${ORIGIN_}/it/courses/islamic-studies` },
    ]);
  });

  it('Hadith of the Day: the Italian placeholder is in the raw HTML; no real hadith, narrator, link or date is frozen in', () => {
    const doc = load(REL);
    const placeholder = doc.querySelector('[data-testid="hadith-placeholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder.textContent.trim()).toBe("Caricamento dell'hadith del giorno…");
    for (const sel of ['.cl__hadith-arabic', '.cl__hadith-narrator', '.cl__hadith-source', '.cl__hadith-link', 'blockquote.cl__hadith-text']) {
      expect(doc.querySelector(sel), sel).toBeNull();
    }
    const html = readFileSync(path.join(distDir, REL), 'utf8');
    expect(html).not.toContain('Leggi l\'hadith completo');
    expect(html).not.toMatch(/sunnah\.com\/nawawi40:\d/);
    // Only the unresolved card sits under "Hadith del giorno".
    expect(doc.querySelectorAll('.cl__hadith-card')).toHaveLength(1);
  });

  it('the placeholder is the same locale-appropriate loading copy as en/ar/fr, with no hadith, in every prerendered Islamic Studies file', () => {
    for (const [rel, text] of [
      ['courses/islamic-studies/index.html', 'Loading today’s hadith…'],
      ['ar/courses/islamic-studies/index.html', 'جارٍ تحميل حديث اليوم…'],
      ['fr/courses/islamic-studies/index.html', 'Chargement du hadith du jour…'],
      [REL, "Caricamento dell'hadith del giorno…"],
    ]) {
      const doc = load(rel);
      expect(doc.querySelector('[data-testid="hadith-placeholder"]').textContent.trim(), rel).toBe(text);
      expect(doc.querySelector('.cl__hadith-arabic'), rel).toBeNull();
      expect(
        [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')).sort(),
        rel,
      ).toEqual(['ar', 'en', 'fr', 'it', 'x-default']);
    }
  });

  it('unpublished Italian routes still have no Italian file (blog, enroll, other tools; hadith and prayer-times joined in wave 3)', () => {
    for (const rel of ['it/resources/blog', 'it/enroll', 'it/tools/quran-reader', 'it/tools/qibla', 'it/tools/islamic-calendar', 'it/tools/verse-of-the-day', 'it/tools/hifz-review']) {
      expect(existsSync(path.join(distDir, rel, 'index.html')), rel).toBe(false);
    }
  });
});

describe.skipIf(!distExists)('Italian wave 3 (hadith, prayer-times) prerender (dist/public) — raw HTML before any JavaScript', () => {
  const ORIGIN = 'https://al-rahmaacademy.com';
  const distDir_ = distDir;
  const PAGES = [
    {
      route: '/tools/hadith',
      file: 'it/tools/hadith/index.html',
      title: 'Biblioteca degli Hadith | AL-Rahma Academy',
      description: 'Sfoglia e cerca 10 raccolte autentiche di hadith, tra cui Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud e altre.',
      h1: 'Biblioteca islamica degli Hadith',
      crumbs: ['Pagina iniziale', 'Strumenti Islamici', 'Biblioteca Hadith'],
    },
    {
      route: '/tools/prayer-times',
      file: 'it/tools/prayer-times/index.html',
      title: 'Orari di preghiera | AL-Rahma Academy',
      description: 'Orari di preghiera precisi per la tua posizione, con conto alla rovescia in diretta, avvisi di preghiera e calendario mensile completo.',
      h1: 'Orari di preghiera',
      crumbs: ['Pagina iniziale', 'Strumenti', 'Strumenti per la preghiera', 'Orari di preghiera'],
    },
  ];
  const read = (f) => readFileSync(path.join(distDir, f), 'utf8');
  const attr = (html, re) => (html.match(re) || [])[1];
  const mainText = (html) => {
    const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
    return (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  };

  for (const page of PAGES) {
    describe(`/it${page.route}`, () => {
      const html = existsSync(path.join(distDir, page.file)) ? read(page.file) : '';

      it('exists, with lang=it dir=ltr, self canonical, index/follow and it_IT', () => {
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain('<html lang="it" dir="ltr">');
        expect(attr(html, /rel="canonical" href="([^"]*)"/)).toBe(`${ORIGIN}/it${page.route}`);
        expect(html.match(/rel="canonical"/g)).toHaveLength(1);
        expect(attr(html, /name="robots" content="([^"]*)"/)).toMatch(/^index, follow/);
        expect(html).toContain('property="og:locale" content="it_IT"');
        expect(html).toContain('property="og:locale:alternate" content="fr_FR"');
        expect(html).not.toMatch(/og:locale:alternate" content="(en_GB|ar_EG|es_ES|de_DE)"/);
      });

      it('has the Italian title, description, og tags and a single Italian H1', () => {
        expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(page.title);
        expect(attr(html, /name="description" content="([^"]*)"/)).toBe(page.description);
        expect(attr(html, /property="og:title" content="([^"]*)"/)).toBe(page.title);
        expect(attr(html, /property="og:description" content="([^"]*)"/)).toBe(page.description);
        expect([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())).toEqual([page.h1]);
      });

      it('has exactly fr + it + x-default hreflang, with the right URLs', () => {
        const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => [m[1], m[2]]);
        expect(Object.fromEntries(links)).toEqual({
          fr: `${ORIGIN}/fr${page.route}`,
          it: `${ORIGIN}/it${page.route}`,
          'x-default': `${ORIGIN}${page.route}`,
        });
        expect(links).toHaveLength(3);
      });

      it('has the Italian breadcrumb and only the JSON-LD the page already had, with no user data', () => {
        const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
        const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
        expect(crumb.itemListElement.map((i) => i.name)).toEqual(page.crumbs);
        expect(crumb.itemListElement.at(-1).item).toBe(`${ORIGIN}/it${page.route}`);
        const types = blocks.map((b) => (Array.isArray(b['@type']) ? b['@type'].join('+') : b['@type'])).sort();
        expect(types).toEqual(['BreadcrumbList', 'EducationalOrganization+LocalBusiness', 'WebSite']);
        // The shared Organization block is business data: no per-page or per-user extras.
        expect(JSON.stringify(blocks)).not.toMatch(/Question|Answer|Person|Review|PrayerTime/);
      });

      it('is not the English SPA shell, and does not canonicalise to the home page', () => {
        expect(html).not.toContain('<html lang="en"');
        expect(html).not.toContain(`rel="canonical" href="${ORIGIN}/"`);
        expect(attr(html, /<title>([^<]*)<\/title>/)).not.toMatch(/Learn the Quran Online/);
        expect(mainText(html)).not.toMatch(/Hadith Library|Prayer Times|Prayer Tools|Also try/);
      });
    });
  }

  describe('/it/tools/hadith: nothing dynamic or fetched is frozen in', () => {
    const html = existsSync(path.join(distDir, PAGES[0].file)) ? read(PAGES[0].file) : '';
    it('shows the ten collection cards and no hadith, list, loading state, narration or CDN data', () => {
      expect((html.match(/class="hl__card[ "]/g) || []).length).toBe(10);
      expect(html).not.toMatch(/hl__hadith|hl__list|hl__loading|hl__error/);
      expect(mainText(html)).not.toMatch(/Narrated|narrated by|Caricamento|Loading/);
      expect(html).not.toMatch(/cdn\.jsdelivr|fawazahmed0|hadith-api/);
    });
    it('keeps the Italian card text and the source terms', () => {
      const t = mainText(html);
      expect(t).toContain('I 42 hadith più essenziali');
      expect(t).toContain('(d. 256 AH)');
      expect(t).toContain('صحيح البخاري');
    });
  });

  describe('/it/tools/prayer-times: no location, time, date or timezone is frozen in', () => {
    const html = existsSync(path.join(distDir, PAGES[1].file)) ? read(PAGES[1].file) : '';
    it('has no prayer list, clock, coordinates, city, timezone or countdown', () => {
      const t = mainText(html);
      expect(html).not.toMatch(/it__prayer-list|it__countdown|it__next|it__month/);
      expect(t).not.toMatch(/\b\d{1,2}:\d{2}\b/);
      expect(t).not.toMatch(/-?\d{1,3}\.\d{3,}/);
      expect(t).not.toMatch(/\b(Africa|America|Asia|Europe|Pacific|Atlantic|Indian|Australia|Etc)\/[A-Z]/);
      expect(t).not.toMatch(/\b(GMT|UTC)[+-]?\d*\b/);
      expect(t).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(html).not.toMatch(/api\.aladhan|nominatim|geocod/i);
    });
    it('shows only the neutral Italian empty state and the source method names', () => {
      const t = mainText(html);
      expect(t).toContain('Metodo di calcolo');
      expect(t).toContain('Egyptian Authority');
      expect(t).toContain('Prova anche:');
    });
  });

  describe('EN/AR/FR pages are unchanged apart from the expected Italian hreflang/og alternate', () => {
    for (const route of ['/tools/hadith', '/tools/prayer-times']) {
      it(`/fr${route} now also lists it, and nothing else about its alternates changed`, () => {
        const html = read(`fr${route}/index.html`);
        const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => m[1]);
        expect(links.sort()).toEqual(['fr', 'it', 'x-default']);
        expect(html).toContain('<html lang="fr" dir="ltr">');
        expect(html).toContain(`rel="canonical" href="${ORIGIN}/fr${route}"`);
      });
    }
  });

  it('/it/enroll has no file in dist (blocked: frozen timezone), and /fr/enroll carries no Italian alternate', () => {
    expect(existsSync(path.join(distDir, 'it/enroll/index.html'))).toBe(false);
    const fr = readFileSync(path.join(distDir, 'fr/enroll/index.html'), 'utf8');
    expect(fr).not.toContain('hreflang="it"');
  });
});

// Enroll prerender timezone safety: the read-only timezone field starts empty,
// so the static file never freezes the build machine's timezone and is the same
// on every build machine.
describe.skipIf(!distExists)('/fr/enroll raw prerender HTML — neutral, deterministic form fields', () => {
  const file = path.join(distDir, 'fr/enroll/index.html');
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const doc = new JSDOM(html).window.document;

  it('the timezone field is present and empty, with no zone name anywhere', () => {
    const tz = doc.querySelector('input.field__readonly');
    expect(tz, 'timezone input').toBeTruthy();
    expect(tz.getAttribute('value') ?? '').toBe('');
    expect(html).not.toMatch(/value="UTC"|Africa\/Cairo|Europe\/Rome|Europe\/Paris|America\/[A-Z]|Asia\/[A-Z]/);
  });

  it('every user input, select and textarea is empty (no form, stored or personal data)', () => {
    for (const el of doc.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main textarea')) {
      expect(el.getAttribute('value') ?? '', el.className || el.getAttribute('placeholder') || el.id).toBe('');
    }
    for (const sel of doc.querySelectorAll('main select')) {
      expect(sel.querySelector('option[selected]'), sel.id).toBeNull();
    }
  });

  it('lang, canonical, robots and hreflang are as before', () => {
    expect(doc.documentElement.getAttribute('lang')).toBe('fr');
    expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://al-rahmaacademy.com/fr/enroll');
    expect(doc.querySelector('meta[name="robots"]').getAttribute('content')).toMatch(/^index, follow/);
    const alts = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')).sort();
    expect(alts).toEqual(['fr', 'x-default']);
  });

  it('/it/enroll is still not prerendered', () => {
    expect(existsSync(path.join(distDir, 'it/enroll/index.html'))).toBe(false);
  });
});
