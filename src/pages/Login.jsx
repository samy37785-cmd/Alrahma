import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';

export default function Login() {
  useSEO({ title: 'Login', description: 'Sign in to your AL-Rahma Academy account to manage your classes and invoices.' });
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await loginAndGet();
      // admins go to the dashboard, everyone else to home
      navigate(user?.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  // login() updates context; we also read the stored user to decide where to go
  const loginAndGet = async () => {
    await login(form);
    return JSON.parse(localStorage.getItem('user'));
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <Brand />
        </div>
        <h1>Welcome back</h1>
        <p className="auth__sub">Log in to your account</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" name="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" name="password" value={form.password} onChange={handleChange} required />
          </div>
          {error && <p className="auth__error">{error}</p>}
          <button type="submit" className="btn btn--green btn--block" disabled={busy}>
            {busy ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <p className="auth__switch">
          No account? <Link to="/register">Create one</Link>
        </p>
        <p className="auth__switch">
          <Link to="/">← Back to website</Link>
        </p>
      </div>
    </div>
  );
}
