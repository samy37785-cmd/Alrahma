import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, matchPath } from 'react-router-dom';
import { lazyPage } from './utils/lazyPage';
import { AuthProvider } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { LangProvider, useLang } from './context/LangContext';
import { PRAYER_CITIES, prayerCityRoute } from './data/prayerCities';
import { getExperienceText } from './i18n/experience';
import { ThemeProvider } from './context/ThemeContext';
import { QueryProvider } from './context/QueryProvider';
import ProtectedRoute from './components/ui/ProtectedRoute';
import AdminSessionGate from './components/ui/AdminSessionGate';
import ScrollToTop from './components/ui/ScrollToTop';
import RoutePrefetcher from './components/ui/RoutePrefetcher';
import Analytics from './components/ui/Analytics';
import ConsentBanner from './components/ui/ConsentBanner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ContentGuard from './components/ui/ContentGuard';
import LiveChat from './components/ui/LiveChat';

// Route-level code splitting
const Home               = lazyPage(() => import('./pages/Home'));
const Login              = lazyPage(() => import('./pages/Login'));
const Register           = lazyPage(() => import('./pages/Register'));
const AdminDashboard     = lazyPage(() => import('./pages/AdminDashboard'));
const AdminLogin         = lazyPage(() => import('./pages/AdminLogin'));
const Quran              = lazyPage(() => import('./pages/Quran'));
const Blog               = lazyPage(() => import('./pages/Blog'));
const BlogPost           = lazyPage(() => import('./pages/BlogPost'));
const FAQ                = lazyPage(() => import('./pages/FAQ'));
const AboutPage          = lazyPage(() => import('./pages/About'));
const Privacy            = lazyPage(() => import('./pages/Privacy'));
const TermsOfService     = lazyPage(() => import('./pages/TermsOfService'));
const RefundPolicy       = lazyPage(() => import('./pages/RefundPolicy'));
const PaymentResult      = lazyPage(() => import('./pages/PaymentResult'));
const Billing            = lazyPage(() => import('./pages/Billing'));
const Wishlist           = lazyPage(() => import('./pages/Wishlist'));
const Dashboard          = lazyPage(() => import('./pages/Dashboard'));
const Profile            = lazyPage(() => import('./pages/Profile'));
const Teachers           = lazyPage(() => import('./pages/Teachers'));
const TeacherProfile     = lazyPage(() => import('./pages/TeacherProfile'));
const Enroll             = lazyPage(() => import('./pages/Enroll'));
const IslamicTools       = lazyPage(() => import('./pages/IslamicTools'));
const Adhkar             = lazyPage(() => import('./pages/Adhkar'));
const ForgotPassword     = lazyPage(() => import('./pages/ForgotPassword'));
const ResetPassword      = lazyPage(() => import('./pages/ResetPassword'));
const VerifyEmail        = lazyPage(() => import('./pages/VerifyEmail'));
const CourseContent      = lazyPage(() => import('./pages/CourseContent'));
const CourseIjazah       = lazyPage(() => import('./pages/CourseIjazah'));
const CourseIslamicStudies = lazyPage(() => import('./pages/CourseIslamicStudies'));
const HadithLibrary      = lazyPage(() => import('./pages/HadithLibrary'));
// TeacherDashboard/ParentDashboard are intentionally NOT imported here.
// Stage 2A (see docs/user-admin-auth-contract.md): no route selects them
// any more - /teacher and /parent redirect to the generic Dashboard. Stage
// 2B (see docs/legacy-role-dashboard-pruning.md) deleted TeacherDashboard.jsx.
// Stage 2C (see docs/legacy-role-orphan-cleanup.md) deleted ParentDashboard.jsx
// and its parent-child link-code feature too, once the product decision
// resolved that undecided question: there are no teacher/parent/student
// account types, only user/admin, and parent-child linking is out of scope.
const Messages           = lazyPage(() => import('./pages/Messages'));
const CalendarPage       = lazyPage(() => import('./pages/CalendarPage'));
const NotFound           = lazyPage(() => import('./pages/NotFound'));

// Hub pages (new IA)
const CoursesHub    = lazyPage(() => import('./pages/hubs/CoursesHub'));
const CoursesQuran  = lazyPage(() => import('./pages/hubs/CoursesQuran'));
const CoursesArabic = lazyPage(() => import('./pages/hubs/CoursesArabic'));
const ToolsHub      = lazyPage(() => import('./pages/hubs/ToolsHub'));
const ResourcesHub  = lazyPage(() => import('./pages/hubs/ResourcesHub'));
const AcademyHub    = lazyPage(() => import('./pages/hubs/AcademyHub'));

// Tool standalone pages
const TasbeehPage          = lazyPage(() => import('./pages/tools/TasbeehPage'));
const ArabicAlphabetPage   = lazyPage(() => import('./pages/tools/ArabicAlphabetPage'));
const PrayerTimesPage      = lazyPage(() => import('./pages/tools/PrayerTimesPage'));
const CityPrayerTimesPage  = lazyPage(() => import('./pages/tools/CityPrayerTimesPage'));
const QiblaPage            = lazyPage(() => import('./pages/tools/QiblaPage'));
const IslamicCalendarPage  = lazyPage(() => import('./pages/tools/IslamicCalendarPage'));
const VerseOfTheDayPage    = lazyPage(() => import('./pages/tools/VerseOfTheDayPage'));
const TajweedCheckerPage   = lazyPage(() => import('./pages/tools/TajweedCheckerPage'));
const HifzReviewPage       = lazyPage(() => import('./pages/tools/HifzReviewPage'));

// The page each URL renders, for preloadInitialPage() below. Mirrors the
// <Route> table (redirect-only routes excluded); every published prerender
// route must match an entry (src/test/startupNoBlank.test.jsx).
const INITIAL_PAGES = [
  ['/', Home],
  ['/courses', CoursesHub], ['/courses/quran', CoursesQuran], ['/courses/arabic', CoursesArabic],
  ['/courses/ijazah', CourseIjazah], ['/courses/islamic-studies', CourseIslamicStudies], ['/courses/:id', CourseContent],
  ['/tools', ToolsHub], ['/tools/quran-reader', Quran], ['/tools/adhkar', Adhkar], ['/tools/hadith', HadithLibrary],
  ['/tools/prayer', IslamicTools], ['/tools/prayer-times', PrayerTimesPage],
  ...PRAYER_CITIES.map((city) => [prayerCityRoute(city.slug), CityPrayerTimesPage]),
  ['/tools/qibla', QiblaPage], ['/tools/islamic-calendar', IslamicCalendarPage], ['/tools/verse-of-the-day', VerseOfTheDayPage],
  ['/tools/tasbeeh', TasbeehPage], ['/tools/arabic-alphabet', ArabicAlphabetPage], ['/tools/tajweed-checker', TajweedCheckerPage],
  ['/tools/hifz-review', HifzReviewPage],
  ['/resources', ResourcesHub], ['/resources/blog', Blog], ['/resources/blog/:slug', BlogPost], ['/resources/faq', FAQ],
  ['/academy', AcademyHub], ['/academy/about', AboutPage], ['/academy/teachers', Teachers], ['/academy/teachers/:id', TeacherProfile],
  ['/academy/privacy', Privacy], ['/academy/terms', TermsOfService], ['/academy/refund-policy', RefundPolicy],
  ['/login', Login], ['/register', Register], ['/forgot-password', ForgotPassword], ['/reset-password', ResetPassword],
  ['/verify-email', VerifyEmail], ['/enroll', Enroll], ['/payment/success', PaymentResult], ['/payment/cancel', PaymentResult],
  ['/dashboard', Dashboard], ['/billing', Billing], ['/wishlist', Wishlist], ['/profile', Profile], ['/messages', Messages],
  ['/admin/login', AdminLogin], ['/admin', AdminDashboard], ['/calendar', CalendarPage],
];

// The page for `pathname` (without the language prefix), or null.
export function initialPageFor(pathname) {
  const hit = INITIAL_PAGES.find(([pattern]) => matchPath(pattern, pathname));
  return hit ? hit[1] : null;
}

// #250: main.jsx awaits this before the first render, so the current page is
// drawn at once instead of the Suspense spinner replacing the prerendered
// content while its (usually already downloaded) chunk resolves.
export function preloadInitialPage(pathname) {
  return initialPageFor(pathname)?.preload() ?? Promise.resolve();
}

// Param-aware redirects for old slug/id routes
function RedirectBlogSlug() {
  const { slug } = useParams();
  return <Navigate to={`/resources/blog/${slug}`} replace />;
}
function RedirectTeacherId() {
  const { id } = useParams();
  return <Navigate to={`/academy/teachers/${id}`} replace />;
}

function PageFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#0b6e4f' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #cfe6dc', borderTopColor: '#0b6e4f', borderRadius: '50%', animation: 'it-spin 0.8s linear infinite' }} />
    </div>
  );
}

function LocalizedSkipLink() {
  const { lang } = useLang();
  return <a href="#main-content" className="skip-link">{getExperienceText(lang).skipToContent}</a>;
}

export default function App({ basename = '' }) {
  return (
    <ErrorBoundary>
    <QueryProvider>
    <ThemeProvider>
    <BrowserRouter basename={basename}>
    <LangProvider>
    <AuthProvider>
    <AdminAuthProvider>
        <ScrollToTop />
        <RoutePrefetcher />
        <Analytics />
        <ConsentBanner />
        <LiveChat />
        <ContentGuard />
        <LocalizedSkipLink />
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ── Home ── */}
          <Route path="/" element={<Home />} />

          {/* ── Courses hierarchy ── */}
          <Route path="/courses" element={<CoursesHub />} />
          <Route path="/courses/quran" element={<CoursesQuran />} />
          <Route path="/courses/arabic" element={<CoursesArabic />} />
          <Route path="/courses/ijazah" element={<CourseIjazah />} />
          <Route path="/courses/islamic-studies" element={<CourseIslamicStudies />} />
          <Route path="/courses/:id" element={<ProtectedRoute><CourseContent /></ProtectedRoute>} />

          {/* ── Tools hierarchy ── */}
          <Route path="/tools" element={<ToolsHub />} />
          <Route path="/tools/quran-reader" element={<Quran />} />
          <Route path="/tools/adhkar" element={<Adhkar />} />
          <Route path="/tools/hadith" element={<HadithLibrary />} />
          <Route path="/tools/prayer" element={<IslamicTools />} />
          <Route path="/tools/prayer-times" element={<PrayerTimesPage />} />
          {/* One route per known city (Italian and French pages only, see
              src/data/prayerCities.js). Listed, not a :city param, so an
              unknown city stays a real 404: these URLs are always
              prerendered files, never the SPA shell rewrite. */}
          {PRAYER_CITIES.map((city) => (
            <Route key={city.slug} path={prayerCityRoute(city.slug)} element={<CityPrayerTimesPage slug={city.slug} />} />
          ))}
          <Route path="/tools/qibla" element={<QiblaPage />} />
          <Route path="/tools/islamic-calendar" element={<IslamicCalendarPage />} />
          <Route path="/tools/verse-of-the-day" element={<VerseOfTheDayPage />} />
          <Route path="/tools/tasbeeh" element={<TasbeehPage />} />
          <Route path="/tools/arabic-alphabet" element={<ArabicAlphabetPage />} />
          <Route path="/tools/tajweed-checker" element={<TajweedCheckerPage />} />
          <Route path="/tools/hifz-review" element={<HifzReviewPage />} />
          <Route path="/tools/quran" element={<Navigate to="/tools/quran-reader" replace />} />

          {/* ── Resources hierarchy ── */}
          <Route path="/resources" element={<ResourcesHub />} />
          <Route path="/resources/blog" element={<Blog />} />
          <Route path="/resources/blog/:slug" element={<BlogPost />} />
          <Route path="/resources/faq" element={<FAQ />} />

          {/* ── Academy hierarchy ── */}
          <Route path="/academy" element={<AcademyHub />} />
          <Route path="/academy/about" element={<AboutPage />} />
          <Route path="/academy/teachers" element={<Teachers />} />
          <Route path="/academy/teachers/:id" element={<TeacherProfile />} />
          <Route path="/academy/privacy" element={<Privacy />} />
          <Route path="/academy/terms" element={<TermsOfService />} />
          <Route path="/academy/refund-policy" element={<RefundPolicy />} />
          <Route path="/terms" element={<Navigate to="/academy/terms" replace />} />
          <Route path="/refund-policy" element={<Navigate to="/academy/refund-policy" replace />} />

          {/* ── Auth ── */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* ── Enroll & Booking ──
              /payment/success and /payment/cancel are legacy Stripe/PayPal
              redirect targets from the removed in-app checkout — kept
              mounted (old links must not 404) but now just point to a
              deprecated-payment notice; see PaymentResult.jsx. */}
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/payment/success" element={<PaymentResult />} />
          <Route path="/payment/cancel" element={<PaymentResult />} />

          {/* ── Dashboards (protected) ── */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
          {/* No server endpoints exist for these two yet (see dashboardNav.js);
              old links land on the dashboard instead of a broken page. */}
          <Route path="/ai-tutor" element={<Navigate to="/dashboard" replace />} />
          <Route path="/community" element={<Navigate to="/dashboard" replace />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
          {/* /admin/login must be reachable by an unauthenticated visitor -
              it IS the admin sign-in page, so it is deliberately not wrapped
              in ProtectedRoute. AdminLogin itself redirects away if a valid
              AdminUser + MFA session already exists. */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminSessionGate><AdminDashboard /></AdminSessionGate></ProtectedRoute>} />
          {/* Every public account is a plain 'user' now - there is no
              teacher/parent/student account type left to select a
              dedicated dashboard, so both old paths are permanent-feeling
              but explicitly temporary compatibility redirects to the
              generic Dashboard, not role dashboards. TeacherDashboard.jsx
              was deleted in Stage 2B. ParentDashboard.jsx (and its
              parent-child link-code feature, including Profile.jsx's
              former getMyLinkCode() UI) was deleted in Stage 2C once the
              product decision resolved that question: parent-child
              linking is out of scope, every account is 'user'. These two
              routes themselves are unconditional Navigate elements (no
              auth check of their own) - an unauthenticated visitor still
              ends up at /login because /dashboard, their target, is
              wrapped in ProtectedRoute and enforces that itself; there is
              no redirect loop. They can be removed entirely in a future
              release cleanup once nothing external still links to them.
              See docs/legacy-role-orphan-cleanup.md. */}
          <Route path="/teacher" element={<Navigate to="/dashboard" replace />} />
          <Route path="/parent" element={<Navigate to="/dashboard" replace />} />
          <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />

          {/* ── Legacy redirects (old flat URLs → new hierarchy) ── */}
          <Route path="/quran" element={<Navigate to="/tools/quran-reader" replace />} />
          <Route path="/adhkar" element={<Navigate to="/tools/adhkar" replace />} />
          <Route path="/hadith-library" element={<Navigate to="/tools/hadith" replace />} />
          <Route path="/islamic-tools" element={<Navigate to="/tools/prayer" replace />} />
          <Route path="/blog" element={<Navigate to="/resources/blog" replace />} />
          <Route path="/blog/:slug" element={<RedirectBlogSlug />} />
          <Route path="/faq" element={<Navigate to="/resources/faq" replace />} />
          <Route path="/about" element={<Navigate to="/academy/about" replace />} />
          <Route path="/teachers" element={<Navigate to="/academy/teachers" replace />} />
          <Route path="/teachers/:id" element={<RedirectTeacherId />} />
          <Route path="/privacy" element={<Navigate to="/academy/privacy" replace />} />
          <Route path="/course/ijazah" element={<Navigate to="/courses/ijazah" replace />} />
          <Route path="/course/islamic-studies" element={<Navigate to="/courses/islamic-studies" replace />} />

          {/* ── 404 ── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
    </AdminAuthProvider>
    </AuthProvider>
    </LangProvider>
    </BrowserRouter>
    </ThemeProvider>
    </QueryProvider>
    </ErrorBoundary>
  );
}
