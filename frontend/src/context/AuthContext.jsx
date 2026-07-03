import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loginUser, registerUser, logoutUser, updateMe, getMe } from '../api/client';

const AuthContext = createContext(null);

// The auth TOKEN now lives in an httpOnly cookie the browser sends automatically
// — JS never sees it (so XSS can't steal it). We only cache the public PROFILE
// in localStorage, purely so the UI can render instantly on refresh before the
// server confirms the session. The cached profile is not a credential.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
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
  const persist = useCallback((profile) => {
    if (profile) localStorage.setItem('user', JSON.stringify(profile));
    else localStorage.removeItem('user');
    setUser(profile);
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

  const value = {
    user, login, register, logout, updateProfile,
    setUser: persist,
    authLoading,
    sessionChecked,
    ensureSession,
    isAdmin:   user?.role === 'admin',
    isTeacher: user?.role === 'teacher',
    isParent:  user?.role === 'parent',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
