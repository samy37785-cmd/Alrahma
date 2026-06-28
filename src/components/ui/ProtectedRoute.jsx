import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Guards a route. If not logged in -> redirect to /login.
// If adminOnly and the user isn't an admin -> redirect home.
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
