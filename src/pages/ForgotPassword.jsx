import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/client';
import { useLang } from '../context/LangContext';

export default function ForgotPassword() {
  const { t } = useLang();
  const fp = t.authPg.forgotPwd;
  const [email, setEmail]   = useState('');
  const [msg, setMsg]       = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setMsg(res.message || fp.success);
    } catch {
      setErr(fp.sub);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="auth__title">{fp.title}</h1>
        <p className="auth__sub">{fp.sub}</p>
        {msg && <p className="profile-page__success">{msg}</p>}
        {err && <p className="auth__error">{err}</p>}
        {!msg && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">{fp.email}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" className="btn btn--green btn--block" disabled={loading}>
              {loading ? fp.busy : fp.btn}
            </button>
          </form>
        )}
        <p className="auth__foot"><Link to="/login">{fp.back}</Link></p>
      </div>
    </div>
  );
}
