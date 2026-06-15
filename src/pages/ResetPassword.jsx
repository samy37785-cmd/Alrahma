import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../api/client';

export default function ResetPassword() {
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
    if (password !== confirm) return setErr('Passwords do not match.');
    if (password.length < 6)  return setErr('Password must be at least 6 characters.');
    setLoading(true);
    try {
      const res = await resetPassword({ token, password });
      setMsg(res.message);
      setTimeout(() => navigate('/login'), 2500);
    } catch (e) {
      setErr(e.response?.data?.message || 'Reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="auth__error">Invalid reset link. <Link to="/forgot-password">Request a new one</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="auth__title">Reset Password</h1>
        {msg && <p className="profile-page__success">{msg} Redirecting to login…</p>}
        {err && <p className="auth__error">{err}</p>}
        {!msg && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="new-pass">New password</label>
              <input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min. 6 characters"
              />
            </div>
            <div className="field">
              <label htmlFor="conf-pass">Confirm new password</label>
              <input
                id="conf-pass"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn--green btn--block" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>
        )}
        <p className="auth__foot"><Link to="/login">Back to Login</Link></p>
      </div>
    </div>
  );
}
