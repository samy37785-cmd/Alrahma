import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../api/authApi';
import { useLang } from '../context/LangContext';
import useSEO from '../hooks/useSEO';

export default function ResetPassword() {
  const { t } = useLang();
  const rp = t.authPg.resetPwd;
  const networkError = t.authPg.login.networkError;
  useSEO({ title: rp.title, noindex: true });
  const [params]            = useSearchParams();
  const token               = params.get('token') || '';
  const navigate            = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [msg, setMsg]           = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (password !== confirm) return setErr(rp.noMatch);
    if (password.length < 8)  return setErr(t.authPg.profile.passShort);
    setLoading(true);
    try {
      const res = await resetPassword({ token, password });
      setMsg(res.message || rp.success);
      setTimeout(() => navigate('/login'), 2500);
    } catch (e) {
      setErr(e.response?.data?.message || (!e.response ? networkError : rp.errorFallback));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="auth__error" role="alert">{rp.noMatch} <Link to="/forgot-password">{rp.btn}</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="auth__title">{rp.title}</h1>
        <p className="auth__sub">{rp.sub}</p>
        {msg && <p className="profile-page__success" role="status">{msg}</p>}
        {err && <p className="auth__error" role="alert">{err}</p>}
        {!msg && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="new-pass">{rp.newPass}</label>
              <input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="conf-pass">{rp.confirmPass}</label>
              <input
                id="conf-pass"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              className={`btn btn--green btn--block${loading ? ' btn--loading' : ''}`}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? rp.busy : rp.btn}
            </button>
          </form>
        )}
        <p className="auth__foot"><Link to="/login">{rp.back}</Link></p>
      </div>
    </div>
  );
}
