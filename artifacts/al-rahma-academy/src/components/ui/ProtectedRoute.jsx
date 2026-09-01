import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAdminAuth } from '../../context/AdminAuthContext';

// Guards a route.
//  - adminOnly: gated exclusively by the separate AdminUser + MFA session
//    (AdminAuthContext) - never by the regular user session, and never by
//    a regular account's `role` field (see src/utils/accountRoles.js). A
//    regular user does NOT need to be logged in at all to reach an admin
//    page; they need a real admin login instead, so this branch never
//    touches `user`/`ensureSession`. While a cached admin profile is still
//    being verified (isChecking - see AdminAuthContext's fail-closed
//    design), render nothing rather than redirecting either way: bouncing
//    to /admin/login before verification finishes would be a false
//    negative, and rendering children would be exactly the fail-open bug
//    this design closes.
//  - otherwise: not logged in -> redirect to /login.
//
// This guard is a frontend UX convenience only. It is not, and must not be
// treated as, a substitute for server-side/RLS enforcement - the real
// authorization boundary lives in the API/database layer, which this
// component cannot see or prove. See docs/user-admin-auth-contract.md.
//
// A visitor can land here with no cached profile but a still-valid session
// cookie (cleared localStorage, a new browser profile, etc.) — `user` being
// falsy does not by itself mean "not logged in". ensureSession() confirms
// with the server before committing to a redirect; while that's in flight we
// render nothing rather than bouncing to /login and back.
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, sessionChecked, ensureSession } = useAuth();
  const { isAdmin, isChecking } = useAdminAuth();
  const location = useLocation();
  const redirect = (pathname) => ({
    pathname,
    search: location.search,
  });

  useEffect(() => {
    if (!adminOnly && !user && !sessionChecked) ensureSession();
  }, [adminOnly, user, sessionChecked, ensureSession]);

  if (adminOnly) {
    if (isChecking) return null;
    if (isAdmin) return children;
    return <Navigate to={redirect('/admin/login')} state={{ from: location }} replace />;
  }

  if (!user) {
    if (!sessionChecked) return null; // still confirming — don't redirect yet
    return <Navigate to={redirect('/login')} state={{ from: location }} replace />;
  }
  return children;
}
