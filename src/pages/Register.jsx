import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

export default function Register() {
  const { t } = useLang();
  const rg = t.authPg.register;
  useSEO({ title: rg.title });
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
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || rg.btn);
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
        <h1>{rg.title}</h1>
        <p className="auth__sub">{rg.sub}</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">{rg.name}</label>
            <input type="text" id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="email">{rg.email}</label>
            <input type="email" id="email" name="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="password">{rg.password}</label>
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
