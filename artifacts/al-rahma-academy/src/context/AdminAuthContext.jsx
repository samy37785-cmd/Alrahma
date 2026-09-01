import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  adminLogin, adminMfaSetup, adminMfaConfirm, adminMfaVerify, adminLogout, adminRefresh,
} from '../api/adminAuthApi';
import { isVerifiedAdminSession, ADMIN_SESSION_STATUS } from '../utils/accountRoles';

const AdminAuthContext = createContext(null);

// Separate from the regular AuthContext: this is the hardened AdminUser +
// TOTP-MFA session (admin_at/admin_rt cookies), required by /api/v1/admin/*
// since the SEC-2/SEC-3 migration.
//
// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md) closes a
// real fail-OPEN gap here: this used to restore `adminUser` from
// localStorage and let its mere presence answer `isAdmin` (via
// isVerifiedAdminSession(adminUser) = Boolean(adminUser)). A forged or
// stale localStorage.adminUser value was therefore, by itself, "proof" -
// AdminSessionGate/ProtectedRoute would render the Admin shell before any
// server ever confirmed the session.
//
// The cached `adminUser` object below is now PRESENTATION DATA ONLY (which
// email to show while a check is in flight) - it can never by itself set
// `isAdmin`. The only thing that can is `sessionStatus === 'verified'`,
// which is reached exactly two ways:
//   1. A fresh, real, in-session server response - a successful
//      confirmMfaSetup()/verifyMfa() during THIS session's own login flow.
//   2. verifySession() succeeding: a real round trip through the httpOnly
//      admin_rt cookie via the existing adminRefresh() endpoint (the exact
//      same call adminHttp.js already fires reactively on a 401 - this is
//      that same, already-production-exercised mechanism, just triggered
//      proactively at mount time instead of only after a failed data call,
//      so the Admin shell never renders on an unverified cached profile in
//      the first place). No new backend contract is invented here.
// Until one of those resolves, sessionStatus is 'checking' (if something
// was cached) or 'unauthenticated' (if nothing was) - both are NOT admin.
export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const saved = localStorage.getItem('adminUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [sessionStatus, setSessionStatus] = useState(() =>
    adminUser ? ADMIN_SESSION_STATUS.CHECKING : ADMIN_SESSION_STATUS.UNAUTHENTICATED
  );
  // 'mfa' | 'mfa_setup' | null — which step of login we're on.
  const [pendingStage, setPendingStage] = useState(null);
  const [mfaSetupInfo, setMfaSetupInfo] = useState(null); // { qrCode, secret }

  const persist = useCallback((profile) => {
    if (profile) localStorage.setItem('adminUser', JSON.stringify(profile));
    else localStorage.removeItem('adminUser');
    setAdminUser(profile);
  }, []);

  // Single-flight guarded with a ref (not just React state) so a
  // StrictMode double-invoke or two components mounting at once can't fire
  // two overlapping refreshes - admin_rt is one-time-use server-side, so a
  // second concurrent call would look like reuse and revoke the whole
  // session (see adminHttp.js's own identical concern/guard).
  //
  // `epochRef` guards a second, subtler race: a mount-time verifySession()
  // call is in flight, and the user (or a 401 elsewhere) triggers logout()
  // before it resolves. Without this guard, the stale verifySession promise
  // could resolve AFTER logout and incorrectly flip sessionStatus back to
  // 'verified' (or clear a cache logout() didn't ask to clear). Every
  // state-resetting action (logout, an explicit persist(null)) bumps the
  // epoch; a verifySession() call only applies its result if the epoch is
  // still the one it started with.
  const epochRef = useRef(0);
  const verifyPromise = useRef(null);
  const verifySession = useCallback(() => {
    if (verifyPromise.current) return verifyPromise.current;
    const epoch = epochRef.current;
    const promise = adminRefresh()
      .then(() => {
        if (epochRef.current === epoch) setSessionStatus(ADMIN_SESSION_STATUS.VERIFIED);
        return true;
      })
      .catch(() => {
        if (epochRef.current === epoch) {
          persist(null);
          setSessionStatus(ADMIN_SESSION_STATUS.UNAUTHENTICATED);
        }
        return false;
      })
      .finally(() => {
        verifyPromise.current = null;
      });
    verifyPromise.current = promise;
    return promise;
  }, [persist]);

  // On mount, a cached profile is only ever a hint to verify, never a
  // conclusion. Nothing cached means nothing to check - stay
  // 'unauthenticated' without spending a refresh call for no reason.
  useEffect(() => {
    if (adminUser) verifySession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // on the credentials step to seed a minimal cached profile. This IS a
  // real, fresh, in-session server result, so it verifies immediately -
  // no extra round trip needed.
  const confirmMfaSetup = useCallback(async (token, email) => {
    await adminMfaConfirm(token);
    persist({ email });
    setSessionStatus(ADMIN_SESSION_STATUS.VERIFIED);
    setPendingStage(null);
    setMfaSetupInfo(null);
  }, [persist]);

  const verifyMfa = useCallback(async (token) => {
    const res = await adminMfaVerify(token);
    persist(res.admin);
    setSessionStatus(ADMIN_SESSION_STATUS.VERIFIED);
    setPendingStage(null);
    return res.admin;
  }, [persist]);

  const logout = useCallback(async () => {
    epochRef.current += 1; // invalidate any in-flight verifySession() result
    try { await adminLogout(); } catch { /* clear locally regardless */ }
    persist(null);
    setSessionStatus(ADMIN_SESSION_STATUS.UNAUTHENTICATED);
  }, [persist]);

  const value = {
    adminUser, pendingStage, mfaSetupInfo, sessionStatus,
    login, confirmMfaSetup, verifyMfa, logout, verifySession,
    // The one correct answer to "is the current visitor an admin?" - derived
    // centrally here from a real verified server round trip, never from
    // the mere presence of a cached object. See src/utils/accountRoles.js.
    isAdmin: isVerifiedAdminSession(sessionStatus),
    // True while a cached profile's validity is being confirmed - callers
    // (ProtectedRoute, AdminSessionGate, AdminLogin) must render nothing/a
    // loading state here, not redirect either way, to avoid both a false
    // bounce to /admin/login and a flash of the Admin shell.
    isChecking: sessionStatus === ADMIN_SESSION_STATUS.CHECKING,
  };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return ctx;
}
