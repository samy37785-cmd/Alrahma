import { createContext, useContext, useState, useCallback } from 'react';
import {
  adminLogin, adminMfaSetup, adminMfaConfirm, adminMfaVerify, adminLogout,
} from '../api/adminAuthApi';

const AdminAuthContext = createContext(null);

// Separate from the regular AuthContext: this is the hardened AdminUser +
// TOTP-MFA session (admin_at/admin_rt cookies), required by /api/v1/admin/*
// since the SEC-2/SEC-3 migration. The cached profile below is not a
// credential — the httpOnly cookie is the real session; this just lets the
// UI render instantly and lets AdminSessionGate decide whether to redirect.
export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const saved = localStorage.getItem('adminUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  // 'mfa' | 'mfa_setup' | null — which step of login we're on.
  const [pendingStage, setPendingStage] = useState(null);
  const [mfaSetupInfo, setMfaSetupInfo] = useState(null); // { qrCode, secret }

  const persist = useCallback((profile) => {
    if (profile) localStorage.setItem('adminUser', JSON.stringify(profile));
    else localStorage.removeItem('adminUser');
    setAdminUser(profile);
  }, []);

  const login = useCallback(async (email, password) => {
    const { stage } = await adminLogin({ email, password });
    setPendingStage(stage);
    if (stage === 'mfa_setup') {
      const info = await adminMfaSetup();
      setMfaSetupInfo(info);
    }
    return stage;
  }, []);

  // First-time MFA activation. The confirm endpoint only returns a message
  // (no admin profile), so the caller passes back the email already entered
  // on the credentials step to seed a minimal cached profile.
  const confirmMfaSetup = useCallback(async (token, email) => {
    await adminMfaConfirm(token);
    persist({ email });
    setPendingStage(null);
    setMfaSetupInfo(null);
  }, [persist]);

  const verifyMfa = useCallback(async (token) => {
    const res = await adminMfaVerify(token);
    persist(res.admin);
    setPendingStage(null);
    return res.admin;
  }, [persist]);

  const logout = useCallback(async () => {
    try { await adminLogout(); } catch { /* clear locally regardless */ }
    persist(null);
  }, [persist]);

  const value = {
    adminUser, pendingStage, mfaSetupInfo,
    login, confirmMfaSetup, verifyMfa, logout,
  };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return ctx;
}
