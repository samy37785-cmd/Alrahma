import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { PRERENDER_MANIFEST, canonicalUrlFor, outputRelPathFor } from '../../scripts/prerender-routes.mjs';
import faqItems from '../data/faqItems.js';

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
    expectedTitle: 'دورة الحروف العربية | AL-Rahma Academy',
    expectedDescription:
      'تعلّم الحروف العربية الـ28 مع النطق الصوتي وتمارين تفاعلية مباشرة في المتصفح — الخطوة الأولى المثالية قبل قراءة القرآن الكريم.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الدورات', item: 'https://al-rahmaacademy.com/ar/courses' },
      { name: 'الحروف العربية', item: 'https://al-rahmaacademy.com/ar/courses/arabic' },
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
    expectedTitle: 'الأسئلة الشائعة | AL-Rahma Academy',
    expectedDescription: 'كل ما تحتاج معرفته عن أكاديمية الرحمة ودوراتنا الإلكترونية في القرآن الكريم.',
    breadcrumb: [
      { name: 'الرئيسية', item: 'https://al-rahmaacademy.com/ar/' },
      { name: 'الموارد', item: 'https://al-rahmaacademy.com/ar/resources' },
      { name: 'الأسئلة الشائعة', item: 'https://al-rahmaacademy.com/ar/resources/faq' },
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
  it.each(LITERAL_FILES)('$relPath: correct raw HTML at the literal path', ({ locale, relPath, expectedCanonical, h1Text, expectedEnHref, expectedArHref, expectedTitle, expectedDescription, breadcrumb }) => {
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

    // hreflang fix (2026-09-21): the static SPA shell's inherited en/it/fr
    // block (no ar) must be fully replaced by the real, reciprocal en/ar
    // pair + x-default — nothing else, and nothing missing.
    const hreflangEls = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(hreflangEls.length, 'exactly 3 hreflang alternates (en, ar, x-default), no more').toBe(3);

    const byHreflang = Object.fromEntries(hreflangEls.map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]));
    expect(byHreflang.en, 'hreflang=en must point at the English version of this same page').toBe(expectedEnHref);
    expect(byHreflang.ar, 'hreflang=ar must point at the Arabic version of this same page').toBe(expectedArHref);
    expect(byHreflang['x-default'], 'hreflang=x-default must point at the English version').toBe(expectedEnHref);

    expect(byHreflang.it, 'no hreflang=it — it is not a published language').toBeUndefined();
    expect(byHreflang.fr, 'no hreflang=fr — fr is not a published language').toBeUndefined();
    expect(byHreflang.es, 'no hreflang=es — es is not a published language').toBeUndefined();
    expect(byHreflang.de, 'no hreflang=de — de is not a published language').toBeUndefined();

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
// only the open question's answer -- this proves that holds for the real
// prerendered HTML a crawler actually receives, before any JavaScript
// runs, not just for a jsdom-rendered component in memory. Expected
// answers are derived from the real src/data/faqItems.js (the same
// `item[lang] || item.en` selection FAQ.jsx itself uses, and the same
// VISIBLE=8 slice), not re-invented literals -- a real wording change in
// faqItems.js is a real content change these fixtures should track, not a
// drift this suite should treat as a false failure.
describe.skipIf(!distExists)('FAQ prerender output — all visible answers present in raw HTML', () => {
  const FAQ_VISIBLE = 8;
  const faqFiles = [
    { locale: 'en', relPath: 'resources/faq/index.html' },
    { locale: 'ar', relPath: 'ar/resources/faq/index.html' },
  ];

  it.each(faqFiles)('$relPath: all 8 visible answers are in the raw pre-JS HTML, closed via hidden', ({ locale, relPath }) => {
    const filePath = path.join(distDir, relPath);
    expect(existsSync(filePath), `missing prerendered file: ${filePath}`).toBe(true);

    const html = readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const expectedAnswers = faqItems.slice(0, FAQ_VISIBLE).map((item) => (item[locale] || item.en).a);

    const panels = [...document.querySelectorAll('.faq-item__a')];
    expect(panels.length, 'all 8 visible answer panels must be in the raw HTML').toBe(FAQ_VISIBLE);

    const actualTexts = panels.map((p) => p.textContent.trim());
    expect(actualTexts, 'answer text must match the real faqItems.js content, in order').toEqual(expectedAnswers);

    for (const panel of panels) {
      expect(
        panel.hasAttribute('hidden'),
        'no question is open by default, so every answer panel must carry the standard hidden attribute in the raw HTML too',
      ).toBe(true);
    }
  });
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
