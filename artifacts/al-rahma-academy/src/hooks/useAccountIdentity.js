import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminAuth } from '../context/AdminAuthContext';

// Which account the site shows as "signed in". A browser can hold two
// sessions at once: a regular account and the separate AdminUser + MFA
// session. While the admin session is verified, the admin account is the one
// shown everywhere (header, dashboard shell) — never the regular account's
// name next to an "Administrator" label. Signing out ends both sessions.
export function useAccountIdentity() {
  const { user, logout: logoutUser } = useAuth();
  const { isAdmin, adminUser, logout: logoutAdmin } = useAdminAuth();

  const logout = useCallback(async () => {
    if (isAdmin) await logoutAdmin();
    if (user) await logoutUser();
  }, [isAdmin, logoutAdmin, user, logoutUser]);

  if (isAdmin) {
    const email = adminUser?.email ?? '';
    return {
      signedIn: true,
      isAdmin: true,
      name: adminUser?.name || email.split('@')[0] || 'Admin',
      email,
      logout,
    };
  }
  return {
    signedIn: Boolean(user),
    isAdmin: false,
    name: user?.name ?? '',
    email: user?.email ?? '',
    logout,
  };
}
