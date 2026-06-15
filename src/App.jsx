import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
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
import IslamicTools from './pages/IslamicTools';
import Adhkar from './pages/Adhkar';
import NotFound from './pages/NotFound';

export default function App() {
  return (
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
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/islamic-tools" element={<IslamicTools />} />
          <Route path="/adhkar" element={<Adhkar />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
