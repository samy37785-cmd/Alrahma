import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/Brand';
import useSEO from '../hooks/useSEO';

export default function Register() {
  useSEO({ title: 'Create an Account', description: 'Create a free AL-Rahma Academy account to track your sessions, view invoices and manage your subscription.' });
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/'); // new accounts are students -> go home
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
        <h1>Create your account</h1>
        <p className="auth__sub">Join AL-Rahma Academy</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input type="text" id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" name="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={6}
              required
            />
          </div>
          {error && <p className="auth__error">{error}</p>}
          <button type="submit" className="btn btn--green btn--block" disabled={busy}>
            {busy ? 'Creating…' : 'Register'}
          </button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
        <p className="auth__switch">
          <Link to="/">← Back to website</Link>
        </p>
      </div>
    </div>
  );
}
