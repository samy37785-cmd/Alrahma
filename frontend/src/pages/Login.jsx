import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

export default function Login() {
  const { t } = useLang();
  const lg = t.authPg.login;
  useSEO({ title: lg.title, noindex: true });
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
      const user = await login(form);
      const dest = { admin: '/admin', teacher: '/teacher', parent: '/parent' }[user?.role] || '/';
      navigate(dest);
    } catch (err) {
      setError(err.response?.data?.message || lg.btn);
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
        <h1>{lg.title}</h1>
        <p className="auth__sub">{lg.sub}</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">{lg.email}</label>
            <input type="email" id="email" name="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="password">{lg.password}</label>
            <input type="password" id="password" name="password" value={form.password} onChange={handleChange} required />
          </div>
          {error && <p className="auth__error">{error}</p>}
          <button type="submit" className="btn btn--green btn--block" disabled={busy}>
            {busy ? lg.busy : lg.btn}
          </button>
        </form>

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
