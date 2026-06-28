import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Guards a route.
//  - Not logged in            -> redirect to /login.
//  - adminOnly + not admin    -> redirect home.
//  - role="teacher"|"parent"  -> only that role (admins always allowed) else home.
export default function ProtectedRoute({ children, adminOnly = false, role = null }) {
  const { user, isAdmin } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (role && user.role !== role && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
