import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import { useAdminAuth } from '../context/AdminAuthContext';

// Second-factor sign-in for the admin console: the hardened AdminUser +
// TOTP-MFA session required by /api/v1/admin/* (see AdminAuthContext /
// AdminSessionGate). Reached only from within the console (this route is
// itself wrapped in the regular ProtectedRoute adminOnly), and separate from
// the site-wide /login page's regular User session.
export default function AdminLogin() {
  const navigate = useNavigate();
  const { login, confirmMfaSetup, verifyMfa, pendingStage, mfaSetupInfo } = useAdminAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp]         = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSetupConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await confirmMfaSetup(totp, email);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyMfa(totp);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Brand />
        </div>
        <h1>Admin Sign In</h1>
        <p className="auth__sub">Hardened access — a second factor is required to manage users and payments.</p>

        {error && <p className="auth__error" role="alert">{error}</p>}

        {!pendingStage && (
          <form onSubmit={handleCredentials} noValidate>
            <div className="field">
              <label htmlFor="admin-email">Email</label>
              <input
                type="email" id="admin-email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <input
                type="password" id="admin-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required
              />
            </div>
            <button type="submit" className={`btn btn--green btn--block${busy ? ' btn--loading' : ''}`} disabled={busy}>
              {busy ? 'Signing in…' : 'Continue'}
            </button>
          </form>
        )}

        {pendingStage === 'mfa_setup' && (
          <form onSubmit={handleMfaSetupConfirm} noValidate>
            <p>Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to finish setup.</p>
            {mfaSetupInfo?.qrCode && (
              <img src={mfaSetupInfo.qrCode} alt="TOTP QR code" width={200} height={200} style={{ display: 'block', margin: '0 auto 12px' }} />
            )}
            {mfaSetupInfo?.secret && (
              <p style={{ fontFamily: 'monospace', fontSize: '.82rem', textAlign: 'center', wordBreak: 'break-all' }}>
                Manual entry key: {mfaSetupInfo.secret}
              </p>
            )}
            <div className="field">
              <label htmlFor="admin-totp-setup">6-digit code</label>
              <input
                id="admin-totp-setup" value={totp} onChange={(e) => setTotp(e.target.value)}
                inputMode="numeric" maxLength={6} required autoFocus
              />
            </div>
            <button type="submit" className={`btn btn--green btn--block${busy ? ' btn--loading' : ''}`} disabled={busy}>
              {busy ? 'Verifying…' : 'Activate & Sign In'}
            </button>
          </form>
        )}

        {pendingStage === 'mfa' && (
          <form onSubmit={handleMfaVerify} noValidate>
            <p>Enter the 6-digit code from your authenticator app.</p>
            <div className="field">
              <label htmlFor="admin-totp">6-digit code</label>
              <input
                id="admin-totp" value={totp} onChange={(e) => setTotp(e.target.value)}
                inputMode="numeric" maxLength={6} required autoFocus
              />
            </div>
            <button type="submit" className={`btn btn--green btn--block${busy ? ' btn--loading' : ''}`} disabled={busy}>
              {busy ? 'Verifying…' : 'Sign In'}
            </button>
          </form>
        )}

        <p className="auth__switch">
          <Link to="/admin">Back to console</Link>
        </p>
      </div>
    </div>
  );
}
