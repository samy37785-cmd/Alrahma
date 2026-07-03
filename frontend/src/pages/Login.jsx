import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { googleLogin } from '../api/authApi';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { t } = useLang();
  const lg = t.authPg.login;
  useSEO({ title: lg.title, noindex: true });
  const { login, setUser, user, authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const googleBtnRef = useRef(null);

  const goToRole = (user) => {
    const roleDest = { admin: '/admin', teacher: '/teacher', parent: '/parent' }[user?.role] || '/dashboard';
    const raw = searchParams.get('redirect') || '';
    // Only allow relative internal paths (prevents open redirect to external URLs)
    const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
    navigate(redirect || roleDest, { replace: true });
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setError('');
          setBusy(true);
          try {
            const user = await googleLogin(credential);
            setUser(user);
            goToRole(user);
          } catch (err) {
            setError(err.response?.data?.message || 'Google sign-in failed');
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: googleBtnRef.current.offsetWidth || 320,
        logo_alignment: 'center',
      });
    };
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form);
      goToRole(user);
    } catch (err) {
      setError(err.response?.data?.message || (!err.response ? lg.networkError : lg.errorFallback));
    } finally {
      setBusy(false);
    }
  };

  // Wait for the server session check to complete before redirecting.
  // Without this guard a stale localStorage profile triggers an immediate
  // Navigate before getMe() confirms the cookie is still valid.
  if (authLoading) return null;
  if (user) {
    const dest = { admin: '/admin', teacher: '/teacher', parent: '/parent' }[user.role] || '/dashboard';
    return <Navigate to={dest} replace />;
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Brand />
        </div>
        <h1>{lg.title}</h1>
        <p className="auth__sub">{lg.sub}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">{lg.email}</label>
            <input
              type="email"
              id="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">{lg.password}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                enterKeyHint="go"
                required
                style={{ paddingRight: '2.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', padding: '0', lineHeight: 1,
                  minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {showPwd ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <button
            type="submit"
            className={`btn btn--green btn--block${busy ? ' btn--loading' : ''}`}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? lg.busy : lg.btn}
          </button>
        </form>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="auth__divider"><span>or</span></div>
            <div ref={googleBtnRef} className="auth__google-btn" aria-label="Sign in with Google" />
          </>
        )}

        <p className="auth__switch">
          {lg.noAccount} <Link to="/register">{lg.createOne}</Link>
        </p>
        <p className="auth__switch">
          <Link to="/forgot-password">{lg.forgot}</Link>
        </p>
        <p className="auth__switch">
          <Link to="/">{lg.back}</Link>
        </p>
      </div>
    </div>
  );
}
