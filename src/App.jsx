import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import Quran from './pages/Quran';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import FAQ from './pages/FAQ';
import Privacy from './pages/Privacy';
import PaymentResult from './pages/PaymentResult';
import Billing from './pages/Billing';
import Profile from './pages/Profile';
import Teachers from './pages/Teachers';
import TeacherProfile from './pages/TeacherProfile';
import Enroll from './pages/Enroll';
import IslamicTools from './pages/IslamicTools';
import Adhkar from './pages/Adhkar';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import CourseContent from './pages/CourseContent';
import CourseIjazah from './pages/CourseIjazah';
import CourseIslamicStudies from './pages/CourseIslamicStudies';
import HadithLibrary from './pages/HadithLibrary';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
    </LangProvider>
  );
}
