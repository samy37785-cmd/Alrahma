import { createContext, useContext, useState, useCallback } from 'react';
import { loginUser, registerUser } from '../api/client';

const AuthContext = createContext(null);

// Wrap the app so any component can read/update auth state.
export function AuthProvider({ children }) {
  // Initialise from localStorage so the session survives refresh.
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // Store the auth result (token + user) in state + localStorage.
  const persist = useCallback((data) => {
    const { token, ...profile } = data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
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

  const value = { user, login, register, logout, isAdmin: user?.role === 'admin' };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook for consuming auth anywhere: const { user, login } = useAuth();
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
