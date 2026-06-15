import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/client';

export default function ForgotPassword() {
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
      setMsg(res.message);
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="auth__title">Forgot Password</h1>
        <p className="auth__sub">Enter your email and we'll send you a reset link.</p>
        {msg && <p className="profile-page__success">{msg}</p>}
        {err && <p className="auth__error">{err}</p>}
        {!msg && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
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
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}
        <p className="auth__foot"><Link to="/login">Back to Login</Link></p>
      </div>
    </div>
  );
}
