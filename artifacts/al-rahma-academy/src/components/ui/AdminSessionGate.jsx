import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

// Second-factor gate for /admin: on top of the regular ProtectedRoute
// adminOnly check, actual data mutations require a separate AdminUser +
// TOTP-MFA session (see AdminAuthContext).
//
// Stage 2C Final Corrective: this used to gate on the mere presence of a
// cached `adminUser` object, which meant a forged/stale localStorage value
// alone could pass this gate. It now gates on `isAdmin` (a real, server-
// verified session - see AdminAuthContext.jsx/accountRoles.js), and
// renders nothing while `isChecking` is true rather than redirecting away
// before verification has had a chance to resolve.
export default function AdminSessionGate({ children }) {
  const location = useLocation();
  const { isAdmin, isChecking } = useAdminAuth();
  if (isChecking) return null;
  if (!isAdmin) {
    return (
      <Navigate
        to={{ pathname: '/admin/login', search: location.search }}
        state={{ from: location }}
        replace
      />
    );
  }
  return children;
}
