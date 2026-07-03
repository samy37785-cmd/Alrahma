import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Guards a route.
//  - Not logged in            -> redirect to /login.
//  - adminOnly + not admin    -> redirect home.
//  - role="teacher"|"parent"  -> only that role (admins always allowed) else home.
//
// A visitor can land here with no cached profile but a still-valid session
// cookie (cleared localStorage, a new browser profile, etc.) — `user` being
// falsy does not by itself mean "not logged in". ensureSession() confirms
// with the server before committing to a redirect; while that's in flight we
// render nothing rather than bouncing to /login and back.
export default function ProtectedRoute({ children, adminOnly = false, role = null }) {
  const { user, isAdmin, sessionChecked, ensureSession } = useAuth();

  useEffect(() => {
    if (!user && !sessionChecked) ensureSession();
  }, [user, sessionChecked, ensureSession]);

  if (!user) {
    if (!sessionChecked) return null; // still confirming — don't redirect yet
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (role && user.role !== role && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
