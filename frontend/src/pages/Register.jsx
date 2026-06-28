import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

export default function Register() {
  const { t } = useLang();
  const rg = t.authPg.register;
  useSEO({ title: rg.title, noindex: true });
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [gdpr, setGdpr] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isAr = t.dir === 'rtl';

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!gdpr) { setError(rg.gdprRequired); return; }
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate(form.role === 'parent' ? '/parent' : '/');
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
            <label htmlFor="role">{isAr ? 'نوع الحساب' : 'Account type'}</label>
            <select id="role" name="role" value={form.role} onChange={handleChange}>
              <option value="student">{isAr ? 'طالب' : 'Student'}</option>
              <option value="parent">{isAr ? 'ولي أمر' : 'Parent'}</option>
            </select>
          </div>
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
          <div className="field field--checkbox">
            <label className="auth__gdpr-label">
              <input
                type="checkbox"
                checked={gdpr}
                onChange={(e) => setGdpr(e.target.checked)}
              />
              <span dangerouslySetInnerHTML={{ __html: rg.gdprConsent }} />
            </label>
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
