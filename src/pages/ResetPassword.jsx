import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../api/client';
import { useLang } from '../context/LangContext';

export default function ResetPassword() {
  const { t } = useLang();
  const rp = t.authPg.resetPwd;
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
    if (password.length < 6)  return setErr(t.authPg.profile.passShort);
    setLoading(true);
    try {
      const res = await resetPassword({ token, password });
      setMsg(res.message || rp.success);
      setTimeout(() => navigate('/login'), 2500);
    } catch (e) {
      setErr(e.response?.data?.message || rp.noMatch);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="auth__error">{rp.noMatch} <Link to="/forgot-password">{rp.btn}</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="auth__title">{rp.title}</h1>
        <p className="auth__sub">{rp.sub}</p>
        {msg && <p className="profile-page__success">{msg}</p>}
        {err && <p className="auth__error">{err}</p>}
        {!msg && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="new-pass">{rp.newPass}</label>
              <input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                required
              />
            </div>
            <button type="submit" className="btn btn--green btn--block" disabled={loading}>
              {loading ? rp.busy : rp.btn}
            </button>
          </form>
        )}
        <p className="auth__foot"><Link to="/login">{rp.back}</Link></p>
      </div>
    </div>
  );
}
