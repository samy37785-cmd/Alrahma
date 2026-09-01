import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { LangProvider, useLang } from './context/LangContext';
import { getExperienceText } from './i18n/experience';
import { ThemeProvider } from './context/ThemeContext';
import { QueryProvider } from './context/QueryProvider';
import ProtectedRoute from './components/ui/ProtectedRoute';
import AdminSessionGate from './components/ui/AdminSessionGate';
import ScrollToTop from './components/ui/ScrollToTop';
import RoutePrefetcher from './components/ui/RoutePrefetcher';
import Analytics from './components/ui/Analytics';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ContentGuard from './components/ui/ContentGuard';
import LiveChat from './components/ui/LiveChat';

// Route-level code splitting
const Home               = lazy(() => import('./pages/Home'));
const Login              = lazy(() => import('./pages/Login'));
const Register           = lazy(() => import('./pages/Register'));
const AdminDashboard     = lazy(() => import('./pages/AdminDashboard'));
const AdminLogin         = lazy(() => import('./pages/AdminLogin'));
const Quran              = lazy(() => import('./pages/Quran'));
const Blog               = lazy(() => import('./pages/Blog'));
const BlogPost           = lazy(() => import('./pages/BlogPost'));
const FAQ                = lazy(() => import('./pages/FAQ'));
const AboutPage          = lazy(() => import('./pages/About'));
const Privacy            = lazy(() => import('./pages/Privacy'));
const TermsOfService     = lazy(() => import('./pages/TermsOfService'));
const RefundPolicy       = lazy(() => import('./pages/RefundPolicy'));
const PaymentResult      = lazy(() => import('./pages/PaymentResult'));
const Billing            = lazy(() => import('./pages/Billing'));
const Wishlist           = lazy(() => import('./pages/Wishlist'));
const AiTutor             = lazy(() => import('./pages/AiTutor'));
const Community            = lazy(() => import('./pages/Community'));
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const Profile            = lazy(() => import('./pages/Profile'));
const Teachers           = lazy(() => import('./pages/Teachers'));
const TeacherProfile     = lazy(() => import('./pages/TeacherProfile'));
const Enroll             = lazy(() => import('./pages/Enroll'));
const IslamicTools       = lazy(() => import('./pages/IslamicTools'));
const Adhkar             = lazy(() => import('./pages/Adhkar'));
const ForgotPassword     = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword      = lazy(() => import('./pages/ResetPassword'));
const CourseContent      = lazy(() => import('./pages/CourseContent'));
const CourseIjazah       = lazy(() => import('./pages/CourseIjazah'));
const CourseIslamicStudies = lazy(() => import('./pages/CourseIslamicStudies'));
const HadithLibrary      = lazy(() => import('./pages/HadithLibrary'));
// TeacherDashboard/ParentDashboard are intentionally NOT imported here.
// Stage 2A (see docs/user-admin-auth-contract.md): no route selects them
// any more - /teacher and /parent redirect to the generic Dashboard. Stage
// 2B (see docs/legacy-role-dashboard-pruning.md) deleted TeacherDashboard.jsx.
// Stage 2C (see docs/legacy-role-orphan-cleanup.md) deleted ParentDashboard.jsx
// and its parent-child link-code feature too, once the product decision
// resolved that undecided question: there are no teacher/parent/student
// account types, only user/admin, and parent-child linking is out of scope.
const Messages           = lazy(() => import('./pages/Messages'));
const CalendarPage       = lazy(() => import('./pages/CalendarPage'));
const NotFound           = lazy(() => import('./pages/NotFound'));

// Hub pages (new IA)
const CoursesHub    = lazy(() => import('./pages/hubs/CoursesHub'));
const CoursesQuran  = lazy(() => import('./pages/hubs/CoursesQuran'));
const CoursesArabic = lazy(() => import('./pages/hubs/CoursesArabic'));
const ToolsHub      = lazy(() => import('./pages/hubs/ToolsHub'));
const ResourcesHub  = lazy(() => import('./pages/hubs/ResourcesHub'));
const AcademyHub    = lazy(() => import('./pages/hubs/AcademyHub'));

// Tool standalone pages
const TasbeehPage          = lazy(() => import('./pages/tools/TasbeehPage'));
const ArabicAlphabetPage   = lazy(() => import('./pages/tools/ArabicAlphabetPage'));
const PrayerTimesPage      = lazy(() => import('./pages/tools/PrayerTimesPage'));
const QiblaPage            = lazy(() => import('./pages/tools/QiblaPage'));
const IslamicCalendarPage  = lazy(() => import('./pages/tools/IslamicCalendarPage'));
const VerseOfTheDayPage    = lazy(() => import('./pages/tools/VerseOfTheDayPage'));
const TajweedCheckerPage   = lazy(() => import('./pages/tools/TajweedCheckerPage'));
const HifzReviewPage       = lazy(() => import('./pages/tools/HifzReviewPage'));

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

          {/* ── Enroll & Payments ── */}
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/payment/success" element={<PaymentResult />} />
          <Route path="/payment/cancel" element={<PaymentResult cancelled />} />

          {/* ── Dashboards (protected) ── */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
          <Route path="/ai-tutor" element={<ProtectedRoute><AiTutor /></ProtectedRoute>} />
          <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
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
