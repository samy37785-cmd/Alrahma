import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ContentGuard from './components/ContentGuard';

// Route-level code splitting: each page loads in its own chunk, so the first
// paint only downloads what the landing page needs (much smaller initial JS).
const Home          = lazy(() => import('./pages/Home'));
const Login         = lazy(() => import('./pages/Login'));
const Register      = lazy(() => import('./pages/Register'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Quran         = lazy(() => import('./pages/Quran'));
const Blog          = lazy(() => import('./pages/Blog'));
const BlogPost      = lazy(() => import('./pages/BlogPost'));
const FAQ           = lazy(() => import('./pages/FAQ'));
const Privacy       = lazy(() => import('./pages/Privacy'));
const PaymentResult = lazy(() => import('./pages/PaymentResult'));
const Billing       = lazy(() => import('./pages/Billing'));
const Profile       = lazy(() => import('./pages/Profile'));
const Teachers      = lazy(() => import('./pages/Teachers'));
const TeacherProfile = lazy(() => import('./pages/TeacherProfile'));
const Enroll        = lazy(() => import('./pages/Enroll'));
const IslamicTools  = lazy(() => import('./pages/IslamicTools'));
const Adhkar        = lazy(() => import('./pages/Adhkar'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const CourseContent = lazy(() => import('./pages/CourseContent'));
const CourseIjazah  = lazy(() => import('./pages/CourseIjazah'));
const CourseIslamicStudies = lazy(() => import('./pages/CourseIslamicStudies'));
const HadithLibrary = lazy(() => import('./pages/HadithLibrary'));
const NotFound      = lazy(() => import('./pages/NotFound'));

function PageFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#0b6e4f' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #cfe6dc', borderTopColor: '#0b6e4f', borderRadius: '50%', animation: 'it-spin 0.8s linear infinite' }} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <LangProvider>
    <AuthProvider>
      <BrowserRouter>
        <ContentGuard />
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quran" element={<Quran />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/payment/success" element={<PaymentResult />} />
          <Route path="/payment/cancel" element={<PaymentResult cancelled />} />
          <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/courses/:id" element={<ProtectedRoute><CourseContent /></ProtectedRoute>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/course/ijazah" element={<CourseIjazah />} />
          <Route path="/course/islamic-studies" element={<CourseIslamicStudies />} />
          <Route path="/hadith-library" element={<HadithLibrary />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/teachers/:id" element={<TeacherProfile />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/islamic-tools" element={<IslamicTools />} />
          <Route path="/adhkar" element={<Adhkar />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </LangProvider>
    </ErrorBoundary>
  );
}
