import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

// Second-factor gate for /admin: on top of the regular ProtectedRoute
// adminOnly check (a User with role 'admin'), actual data mutations now
// require a separate AdminUser + TOTP-MFA session (see AdminAuthContext).
// A stale cached profile with an already-expired admin_at cookie is caught
// on the first real API call instead (adminHttp's 401 handler) — this only
// needs to gate the initial render.
export default function AdminSessionGate({ children }) {
  const { adminUser } = useAdminAuth();
  if (!adminUser) return <Navigate to="/admin/login" replace />;
  return children;
}
