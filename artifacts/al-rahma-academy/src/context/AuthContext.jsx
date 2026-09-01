import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loginUser, registerUser, logoutUser, updateMe, getMe } from '../api/authApi';
import { normalizeAccountRole } from '../utils/accountRoles';

const AuthContext = createContext(null);

// Applies the account-role contract (see src/utils/accountRoles.js) to
// whatever a server response's `role` field says, at every single boundary
// where a profile enters this context's state - cached-profile restoration,
// login, registration, getMe/ensureSession, and updateProfile. No matter
// what a legacy response claims (admin/student/teacher/parent/null/
// undefined/garbage), the object this app ever holds as `user` always has
// role: 'user'. This is what actually enforces the contract Stage 2A/2B/2C
// documented but never applied at the data boundary itself - previously
// `user.role` could still literally be a raw legacy string, and any code
// reading it directly (e.g. Profile.jsx's old role label) could leak it.
function normalizeProfile(profile) {
  if (!profile) return profile;
  return { ...profile, role: normalizeAccountRole(profile.role) };
}

// The auth TOKEN now lives in an httpOnly cookie the browser sends automatically
// — JS never sees it (so XSS can't steal it). We only cache the public PROFILE
// in localStorage, purely so the UI can render instantly on refresh before the
// server confirms the session. The cached profile is not a credential.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? normalizeProfile(JSON.parse(saved)) : null;
    } catch {
      return null;
    }
  });

  // True while a server-side session check is in-flight.
  // Consumers can gate redirects on this to prevent the stale-cache flicker.
  // Reuse the already-safely-initialised `user` value to avoid a second
  // localStorage call that has no try/catch protection.
  const [authLoading, setAuthLoading] = useState(!!user);

  // True once we've confirmed, one way or another, whether a session really
  // exists — via the mount-time check below (cached profile) or an on-demand
  // ensureSession() call (nothing cached). A visitor can have no cached
  // profile (cleared storage, a new browser profile) but a still-valid
  // session cookie, so ProtectedRoute needs to tell "confirmed no session"
  // apart from "haven't checked yet" instead of treating `!user` as an
  // immediate "not logged in".
  const [sessionChecked, setSessionChecked] = useState(false);
  // Dedupes concurrent ensureSession() calls (e.g. more than one
  // ProtectedRoute mounting during the same navigation) into one request.
  const sessionCheckPromise = useRef(null);

  // Cache (or clear) the public profile for instant render on next load.
  // This is the SINGLE funnel every public path (login, register, getMe/
  // ensureSession, updateProfile, and setUser itself) goes through, so
  // normalizing here is what makes the contract actually apply everywhere
  // at once, not just wherever a call site remembered to.
  const persist = useCallback((profile) => {
    const normalized = normalizeProfile(profile);
    if (normalized) localStorage.setItem('user', JSON.stringify(normalized));
    else localStorage.removeItem('user');
    setUser(normalized);
  }, []);

  // Asks the server who we are (if we don't already know) and updates state
  // accordingly. Safe to call from multiple places at once.
  const ensureSession = useCallback(() => {
    if (sessionCheckPromise.current) return sessionCheckPromise.current;
    setAuthLoading(true);
    const promise = getMe()
      .then((fresh) => { persist(fresh); return fresh; })
      .catch((err) => {
        if (err.response?.status === 401) persist(null);
        return null;
      })
      .finally(() => {
        setSessionChecked(true);
        setAuthLoading(false);
        sessionCheckPromise.current = null;
      });
    sessionCheckPromise.current = promise;
    return promise;
  }, [persist]);

  // On first load, if a profile was cached we likely have a valid cookie —
  // confirm it now so subscription status/expiry is current. If nothing was
  // cached we don't check yet here — most page loads are anonymous public
  // pages, and an unauthenticated /api/auth/me call on every single one would
  // be wasted server work. ProtectedRoute calls ensureSession() itself the
  // moment a route actually requires auth, so a visitor with no cache but a
  // valid cookie still gets revalidated instead of a false "not logged in".
  useEffect(() => {
    if (user) ensureSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (credentials) => {
    const profile = await loginUser(credentials);
    persist(profile);
    return profile;
  }, [persist]);

  const register = useCallback(async (info) => {
    const profile = await registerUser(info);
    persist(profile);
    return profile;
  }, [persist]);

  const logout = useCallback(async () => {
    try { await logoutUser(); } catch { /* clear locally regardless */ }
    queryClient.clear();
    persist(null);
    setSessionChecked(true); // we just confirmed there's no session — no need to re-check
  }, [persist, queryClient]);

  const updateProfile = useCallback(async (data) => {
    const updated = await updateMe(data);
    persist(updated);
  }, [persist]);

  // No isAdmin/isTeacher/isParent here. Stage 2A (see
  // docs/user-admin-auth-contract.md and src/utils/accountRoles.js): a
  // regular account's own `role` field - however it was set at signup, and
  // whatever a legacy API response still claims - is NEVER a trust source
  // for admin status, and teacher/parent are no longer distinct account
  // types at all. Admin status is only ever proven by a real AdminUser +
  // MFA session (useAdminAuth().adminUser via isVerifiedAdminSession()).
  const value = {
    user, login, register, logout, updateProfile,
    setUser: persist,
    authLoading,
    sessionChecked,
    ensureSession,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
