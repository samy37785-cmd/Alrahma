import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMe, getCourses, getMyCertificates, getMyLinkCode } from '../api/client';
import { useLang } from '../context/LangContext';


// Opens a clean printable certificate in a new window and triggers print.
function printCertificate(cert, typeLabel) {
  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) return;
  const date = new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cert.certificateNumber}</title>
  <style>
    body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#fff;}
    .cert{width:780px;margin:24px auto;padding:48px 56px;border:3px solid #0b6e4f;border-radius:8px;position:relative;}
    .cert::after{content:'';position:absolute;inset:10px;border:1px solid #c9a227;border-radius:4px;pointer-events:none;}
    .hdr{color:#0b6e4f;font-size:14px;letter-spacing:3px;text-transform:uppercase;}
    h1{color:#0b6e4f;font-size:40px;margin:6px 0 2px;}
    .sub{color:#888;font-size:13px;margin:0 0 28px;}
    .lbl{color:#888;font-size:13px;margin:24px 0 4px;}
    .name{font-size:30px;color:#222;margin:0;border-bottom:1px solid #ddd;display:inline-block;padding:0 20px 6px;}
    .title{font-size:22px;color:#0b6e4f;margin:18px 0 4px;font-weight:bold;}
    .grade{color:#c9a227;font-weight:bold;}
    .foot{display:flex;justify-content:space-between;margin-top:48px;font-size:13px;color:#555;}
    .num{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#bbb;font-size:11px;}
  </style></head><body onload="window.print()">
    <div class="cert">
      <p class="hdr">🕌 AL-Rahma Academy</p>
      <h1>Certificate</h1>
      <p class="sub">${typeLabel || cert.type}</p>
      <p class="lbl">This is proudly presented to</p>
      <p class="name">${cert.studentName}</p>
      <p class="title">${cert.title}</p>
      ${cert.grade ? `<p class="grade">Grade: ${cert.grade}</p>` : ''}
      ${cert.notes ? `<p style="color:#555;font-size:14px;">${cert.notes}</p>` : ''}
      <div class="foot">
        <div><strong>Issued by</strong><br>${cert.issuedBy || 'AL-Rahma Academy'}</div>
        <div style="text-align:right;"><strong>Date</strong><br>${date}</div>
      </div>
      <p class="num">Certificate No. ${cert.certificateNumber}</p>
    </div>
  </body></html>`);
  w.document.close();
}

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useLang();
  const pg = t.authPg.profile;

  const [subscription, setSubscription] = useState(user?.subscription || null);
  const [courses, setCourses]           = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [linkCode, setLinkCode]         = useState('');
  const [codeLoading, setCodeLoading]   = useState(false);

  const isStudent = !user?.role || user.role === 'student';

  const revealCode = async () => {
    setCodeLoading(true);
    try {
      const { code } = await getMyLinkCode();
      setLinkCode(code);
    } finally {
      setCodeLoading(false);
    }
  };

  useEffect(() => {
    getMe().then((u) => setSubscription(u.subscription)).catch(() => {});
    getCourses().then(setCourses).catch(() => {});
    getMyCertificates().then(setCertificates).catch(() => {});
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
            <Link to="/dashboard" className="btn btn--ghost btn--sm">{pg.dashboard}</Link>
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
                <input value={
                  user?.role === 'admin'   ? pg.roleAdmin
                  : user?.role === 'teacher' ? pg.roleTeacher
                  : user?.role === 'parent'  ? pg.roleParent
                  : pg.roleStudent
                } disabled />
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

        {certificates.length > 0 && (
          <section className="admin__panel" style={{ marginTop: '1.5rem' }}>
            <h2>🎓 {pg.myCertificates}</h2>
            <ul className="admin__list">
              {certificates.map((c) => (
                <li key={c._id} style={{ alignItems: 'center' }}>
                  <span>
                    <strong>{c.title}</strong>
                    <small style={{ display: 'block', color: '#888' }}>
                      {pg.certTypes[c.type] || c.type} · {c.certificateNumber} · {new Date(c.issuedAt).toLocaleDateString('en-GB')}
                    </small>
                  </span>
                  <button className="btn btn--green btn--sm" onClick={() => printCertificate(c, pg.certTypes[c.type])}>
                    🖨 {pg.printCert}
                  </button>
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

        {/* Parent-link code — lets a parent connect to this student's account */}
        {isStudent && (
          <section className="admin__panel" style={{ marginTop: '1.5rem' }}>
            <h2>👨‍👩‍👧 {pg.parentLink}</h2>
            <p style={{ color: '#888', fontSize: '.9rem', marginTop: 0 }}>{pg.parentLinkDesc}</p>
            {linkCode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <code style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '4px', background: '#f1f6f3', color: '#0b6e4f', padding: '8px 18px', borderRadius: 8, border: '1px dashed #0b6e4f' }}>
                  {linkCode}
                </code>
                <button className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(linkCode)}>
                  📋 {pg.copy}
                </button>
              </div>
            ) : (
              <button className="btn btn--green btn--sm" onClick={revealCode} disabled={codeLoading}>
                {codeLoading ? '…' : pg.showLinkCode}
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
