import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMe, getCourses } from '../api/client';
import { useLang } from '../context/LangContext';

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useLang();
  const pg = t.authPg.profile;

  const [subscription, setSubscription] = useState(user?.subscription || null);
  const [courses, setCourses]           = useState([]);

  useEffect(() => {
    getMe().then((u) => setSubscription(u.subscription)).catch(() => {});
    getCourses().then(setCourses).catch(() => {});
  }, []);

  const [info, setInfo] = useState({ name: user?.name || '', email: user?.email || '' });
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [infoMsg, setInfoMsg]   = useState('');
  const [infoErr, setInfoErr]   = useState('');
  const [passMsg, setPassMsg]   = useState('');
  const [passErr, setPassErr]   = useState('');
  const [saving, setSaving]     = useState(false);

  const handleInfo = async (e) => {
    e.preventDefault();
    setInfoMsg(''); setInfoErr('');
    setSaving(true);
    try {
      await updateProfile({ name: info.name, email: info.email });
      setInfoMsg(pg.infoSuccess);
    } catch (err) {
      setInfoErr(err.response?.data?.message || pg.infoSuccess);
    } finally {
      setSaving(false);
    }
  };

  const handlePass = async (e) => {
    e.preventDefault();
    setPassMsg(''); setPassErr('');
    if (pass.newPassword !== pass.confirm) return setPassErr(pg.passNoMatch);
    if (pass.newPassword.length < 6)       return setPassErr(pg.passShort);
    setSaving(true);
    try {
      await updateProfile({ currentPassword: pass.currentPassword, newPassword: pass.newPassword });
      setPassMsg(pg.passSuccess);
      setPass({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPassErr(err.response?.data?.message || pg.passNoMatch);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>AL-Rahma · {pg.myAccount}</strong>
          <div className="admin__bar-right">
            <Link to="/dashboard" className="btn btn--ghost btn--sm">← Dashboard</Link>
            <Link to="/billing" className="btn btn--ghost btn--sm">{pg.billing}</Link>
            {user?.role === 'admin' && (
              <Link to="/admin" className="btn btn--ghost btn--sm">{pg.admin}</Link>
            )}
            <button className="btn btn--gold btn--sm" onClick={logout}>{pg.logout}</button>
          </div>
        </div>
      </header>

      <main className="container profile-page__main">
        <div className="profile-page__grid">

          <section className="admin__panel">
            <h2>{pg.personalInfo}</h2>
            {infoMsg && <p className="profile-page__success">{infoMsg}</p>}
            {infoErr && <p className="auth__error">{infoErr}</p>}
            <form onSubmit={handleInfo}>
              <div className="field">
                <label htmlFor="prof-name">{pg.fullName}</label>
                <input
                  id="prof-name"
                  value={info.name}
                  onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="prof-email">{pg.email}</label>
                <input
                  id="prof-email"
                  type="email"
                  value={info.email}
                  onChange={(e) => setInfo((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>{pg.accountType}</label>
                <input value={user?.role === 'admin' ? pg.roleAdmin : pg.roleStudent} disabled />
              </div>
              <button type="submit" className="btn btn--green btn--block" disabled={saving}>
                {saving ? pg.saving : pg.saveChanges}
              </button>
            </form>
          </section>

          <section className="admin__panel">
            <h2>{pg.changePass}</h2>
            {passMsg && <p className="profile-page__success">{passMsg}</p>}
            {passErr && <p className="auth__error">{passErr}</p>}
            <form onSubmit={handlePass}>
              <div className="field">
                <label htmlFor="cur-pass">{pg.currentPass}</label>
                <input
                  id="cur-pass"
                  type="password"
                  value={pass.currentPassword}
                  onChange={(e) => setPass((p) => ({ ...p, currentPassword: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-pass">{pg.newPass}</label>
                <input
                  id="new-pass"
                  type="password"
                  value={pass.newPassword}
                  onChange={(e) => setPass((p) => ({ ...p, newPassword: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="conf-pass">{pg.confirmPass}</label>
                <input
                  id="conf-pass"
                  type="password"
                  value={pass.confirm}
                  onChange={(e) => setPass((p) => ({ ...p, confirm: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn btn--green btn--block" disabled={saving}>
                {saving ? pg.saving : pg.changeBtn}
              </button>
            </form>
          </section>
        </div>

        {subscription?.status === 'active' && courses.length > 0 && (
          <section className="admin__panel" style={{ marginTop: '1.5rem' }}>
            <h2>{pg.myCourses}</h2>
            <ul className="admin__list">
              {courses.map((c) => (
                <li key={c._id}>
                  <span>{c.icon} {c.title}</span>
                  <Link to={`/courses/${c._id}`} className="btn btn--green btn--sm">{pg.startLearning}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="admin__panel" style={{ marginTop: '1.5rem' }}>
          <h2>{pg.mySubscription}</h2>
          {subscription?.status === 'active' ? (
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, color: '#888', fontSize: '.85rem' }}>{pg.currentPlan}</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: '#0b6e4f' }}>{subscription.plan}</p>
              </div>
              <div>
                <p style={{ margin: 0, color: '#888', fontSize: '.85rem' }}>{pg.status}</p>
                <span className="admin__badge admin__badge--approved">{pg.active}</span>
              </div>
              <div>
                <p style={{ margin: 0, color: '#888', fontSize: '.85rem' }}>{pg.validUntil}</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{new Date(subscription.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <Link to="/billing" className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }}>{pg.viewInvoices}</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: '#888' }}>{pg.noSub}</p>
              <Link to="/#pricing" className="btn btn--green btn--sm">{pg.viewPlans}</Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
