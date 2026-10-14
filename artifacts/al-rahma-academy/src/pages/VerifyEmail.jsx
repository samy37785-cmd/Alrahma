import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { verifyEmail } from '../api/authApi';
import { useLang } from '../context/LangContext';
import useSEO from '../hooks/useSEO';
import Brand from '../components/layout/Brand';
import { readResetToken } from '../utils/resetToken';

// Audit AR-02: the page an email-confirmation link opens. The token arrives in
// the fragment (#token=…), which the browser never sends to a server; it is
// removed from the address bar once read, then sent to the API once.
export default function VerifyEmail() {
  const { t } = useLang();
  const ve = t.authPg.verifyEmail;
  useSEO({ title: ve.title, noindex: true });
  const [token] = useState(() => readResetToken());
  const [state, setState] = useState(token ? 'checking' : 'invalid');

  useEffect(() => {
    if (!token) return undefined;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    let cancelled = false;
    verifyEmail(token)
      .then(() => { if (!cancelled) setState('success'); })
      .catch(() => { if (!cancelled) setState('invalid'); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Brand />
        </div>
        <h1 className="auth__title">{ve.title}</h1>
        {state === 'checking' && <p className="auth__sub" role="status">{ve.checking}</p>}
        {state === 'success' && (
          <>
            <p className="profile-page__success" role="status">{ve.success}</p>
            <Link to="/dashboard" className="btn btn--green">{ve.toDashboard}</Link>
          </>
        )}
        {state === 'invalid' && (
          <>
            <p className="auth__error" role="alert">{ve.invalid}</p>
            <Link to="/dashboard">{ve.toDashboard}</Link>
          </>
        )}
      </div>
    </div>
  );
}
