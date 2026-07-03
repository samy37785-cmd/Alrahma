import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

function GdprText({ raw }) {
  const m = raw.match(/^([\s\S]*?)<a[^>]*>([\s\S]*?)<\/a>([\s\S]*)$/);
  if (!m) return <span>{raw}</span>;
  const [, pre, linkText, post] = m;
  return (
    <span>
      {pre}
      <Link to="/academy/privacy" style={{ color: 'var(--green)' }}>{linkText}</Link>
      {post}
    </span>
  );
}

export default function Register() {
  const { t } = useLang();
  const rg = t.authPg.register;
  const profile = t.authPg.profile;
  const networkError = t.authPg.login.networkError;
  useSEO({ title: rg.title, noindex: true });
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [gdpr, setGdpr] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!gdpr) { setError(rg.gdprRequired); return; }
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate(form.role === 'parent' ? '/parent' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || (!err.response ? networkError : rg.errorFallback));
    } finally {
      setBusy(false);
    }
  };

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Brand />
        </div>
        <h1>{rg.title}</h1>
        <p className="auth__sub">{rg.sub}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="role">{profile.accountType}</label>
            <select id="role" name="role" value={form.role} onChange={handleChange}>
              <option value="student">{profile.roleStudent}</option>
              <option value="parent">{profile.roleParent}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="name">{rg.name}</label>
            <input
              type="text"
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              enterKeyHint="next"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">{rg.email}</label>
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
            <label htmlFor="password">{rg.password}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                enterKeyHint="go"
                minLength={8}
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
          <div className="field field--checkbox">
            <label className="auth__gdpr-label">
              <input
                type="checkbox"
                checked={gdpr}
                onChange={(e) => setGdpr(e.target.checked)}
              />
              <GdprText raw={rg.gdprConsent} />
            </label>
          </div>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <button
            type="submit"
            className={`btn btn--green btn--block${busy ? ' btn--loading' : ''}`}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? rg.busy : rg.btn}
          </button>
        </form>

        <p className="auth__switch">
          {rg.haveAccount} <Link to="/login">{rg.signIn}</Link>
        </p>
        <p className="auth__switch">
          <Link to="/">{rg.back}</Link>
        </p>
      </div>
    </div>
  );
}
