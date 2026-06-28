import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { loginUser, registerUser, logoutUser, updateMe, getMe } from '../api/client';

const AuthContext = createContext(null);

// The auth TOKEN now lives in an httpOnly cookie the browser sends automatically
// — JS never sees it (so XSS can't steal it). We only cache the public PROFILE
// in localStorage, purely so the UI can render instantly on refresh before the
// server confirms the session. The cached profile is not a credential.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Cache (or clear) the public profile for instant render on next load.
  const persist = useCallback((profile) => {
    if (profile) localStorage.setItem('user', JSON.stringify(profile));
    else localStorage.removeItem('user');
    setUser(profile);
  }, []);

  // On first load, if a profile was cached we likely have a valid cookie — ask
  // the server who we are so subscription status/expiry is current. A 401 means
  // the cookie is gone or expired → drop the stale cached profile.
  useEffect(() => {
    if (!localStorage.getItem('user')) return;
    getMe()
      .then((fresh) => persist(fresh))
      .catch((err) => {
        if (err.response?.status === 401) persist(null);
      });
  }, [persist]);

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
    persist(null);
  }, [persist]);

  const updateProfile = useCallback(async (data) => {
    const updated = await updateMe(data);
    persist(updated);
  }, [persist]);

  const value = {
    user, login, register, logout, updateProfile,
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
