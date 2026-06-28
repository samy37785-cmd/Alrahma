import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { loginUser, registerUser, updateMe, getMe } from '../api/client';

const AuthContext = createContext(null);

// Wrap the app so any component can read/update auth state.
export function AuthProvider({ children }) {
  // Initialise from localStorage so the session survives refresh.
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Store the auth result (token + user) in state + localStorage.
  const persist = useCallback((data) => {
    const { token, ...profile } = data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
  }, []);

  // On first load, if we have a token, refresh the profile from the server so
  // subscription status (and expiry) is current — not whatever was cached at
  // login time. A 401 here means the token is stale → log the user out.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    getMe()
      .then((fresh) => {
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      });
  }, []);

  const login = useCallback(async (credentials) => {
    persist(await loginUser(credentials));
  }, [persist]);

  const register = useCallback(async (info) => {
    persist(await registerUser(info));
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data) => {
    const updated = await updateMe(data);
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  }, []);

  const value = { user, login, register, logout, updateProfile, isAdmin: user?.role === 'admin' };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
