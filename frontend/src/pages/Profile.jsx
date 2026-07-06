import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getMe, getMyLinkCode } from '../api/authApi';
import { getCourses, getMyCertificates } from '../api/courseApi';
import { COURSE_KEYS } from '../hooks/useCourses';
import { useLang } from '../context/LangContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import '../styles/dashboard-shell.css';


function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Opens a clean printable certificate in a new window and triggers print.
function printCertificate(cert, typeLabel) {
  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) return;
  const date = new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(cert.certificateNumber)}</title>
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
      <p class="hdr">Al-Rahma Academy</p>
      <h1>Certificate</h1>
      <p class="sub">${escHtml(typeLabel || cert.type)}</p>
      <p class="lbl">This is proudly presented to</p>
      <p class="name">${escHtml(cert.studentName)}</p>
      <p class="title">${escHtml(cert.title)}</p>
      ${cert.grade ? `<p class="grade">Grade: ${escHtml(cert.grade)}</p>` : ''}
      ${cert.notes ? `<p style="color:#555;font-size:14px;">${escHtml(cert.notes)}</p>` : ''}
      <div class="foot">
        <div><strong>Issued by</strong><br>${escHtml(cert.issuedBy || 'Al-Rahma Academy')}</div>
        <div style="text-align:right;"><strong>Date</strong><br>${escHtml(date)}</div>
      </div>
      <p class="num">Certificate No. ${escHtml(cert.certificateNumber)}</p>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { t } = useLang();
  const pg = t.authPg.profile;

  const [linkCode, setLinkCode]       = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const isStudent = !user?.role || user.role === 'student';

  const { data: me } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn:  getMe,
    staleTime: 1000 * 60 * 5,
  });

  const { data: courses = [] } = useQuery({
    queryKey: COURSE_KEYS.list,
    queryFn:  getCourses,
    staleTime: 1000 * 60 * 5,
  });

  const { data: certificates = [] } = useQuery({
    queryKey: ['profile', 'certificates'],
    queryFn:  getMyCertificates,
    staleTime: 1000 * 60 * 5,
  });

  const subscription = me?.subscription ?? user?.subscription ?? null;

  const revealCode = async () => {
    setCodeLoading(true);
    try {
      const { code } = await getMyLinkCode();
      setLinkCode(code);
    } finally {
      setCodeLoading(false);
    }
  };

  const [info, setInfo] = useState({ name: user?.name || '', email: user?.email || '' });
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [infoMsg, setInfoMsg]   = useState('');
  const [infoErr, setInfoErr]   = useState('');
  const [passMsg, setPassMsg]   = useState('');
  const [passErr, setPassErr]   = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!infoMsg) return;
    const id = setTimeout(() => setInfoMsg(''), 5000);
    return () => clearTimeout(id);
  }, [infoMsg]);

  useEffect(() => {
    if (!passMsg) return;
    const id = setTimeout(() => setPassMsg(''), 5000);
    return () => clearTimeout(id);
  }, [passMsg]);

  const handleInfo = async (e) => {
    e.preventDefault();
    setInfoMsg(''); setInfoErr('');
    setSaving(true);
    try {
      await updateProfile({ name: info.name, email: info.email });
      setInfoMsg(pg.infoSuccess);
    } catch (err) {
      setInfoErr(err.response?.data?.message || pg.infoError || 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePass = async (e) => {
    e.preventDefault();
    setPassMsg(''); setPassErr('');
    if (pass.newPassword !== pass.confirm) return setPassErr(pg.passNoMatch);
    if (pass.newPassword.length < 8)       return setPassErr(pg.passShort);
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

  const initials = user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roleLabel = user?.role === 'admin' ? pg.roleAdmin : user?.role === 'teacher' ? pg.roleTeacher : user?.role === 'parent' ? pg.roleParent : pg.roleStudent;

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><span>👤</span> Account</div>
          <h1 className="ds-page-hd__title">{pg.myAccount}</h1>
          <p className="ds-page-hd__sub">Manage your profile, password, and subscription.</p>
        </div>
      </div>

      {/* Profile hero card */}
      <div className="ds-card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'var(--grad-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '1.4rem', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: 3 }}>{user?.name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="ds-badge ds-badge--green">{roleLabel}</span>
              {subscription?.status === 'active' && (
                <span className="ds-badge ds-badge--gold">{subscription.plan}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="ds-grid ds-grid-main-side" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Personal info */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon">📝</span> {pg.personalInfo}</span>
            </div>
            <div className="ds-card__body">
              {infoMsg && (
                <div role="status" aria-live="polite" style={{ background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-success-text)' }}>
                  ✓ {infoMsg}
                </div>
              )}
              {infoErr && (
                <div id="info-error" role="alert" style={{ background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-danger-text)' }}>
                  {infoErr}
                </div>
              )}
              <form onSubmit={handleInfo} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="prof-name">{pg.fullName}</label>
                  <input
                    id="prof-name"
                    value={info.name}
                    onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))}
                    required
                    aria-invalid={infoErr ? 'true' : undefined}
                    aria-describedby={infoErr ? 'info-error' : undefined}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="prof-email">{pg.email}</label>
                  <input
                    id="prof-email"
                    type="email"
                    value={info.email}
                    onChange={(e) => setInfo((p) => ({ ...p, email: e.target.value }))}
                    required
                    aria-invalid={infoErr ? 'true' : undefined}
                    aria-describedby={infoErr ? 'info-error' : undefined}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>{pg.accountType}</label>
                  <input value={roleLabel} disabled style={{ background: 'var(--bg-disabled)', cursor: 'not-allowed' }} />
                </div>
                <button type="submit" className="btn btn--green" style={{ alignSelf: 'flex-start', borderRadius: 9 }} disabled={saving} aria-busy={saving}>
                  {saving ? pg.saving : pg.saveChanges}
                </button>
              </form>
            </div>
          </div>

          {/* Change password */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon">🔒</span> {pg.changePass}</span>
            </div>
            <div className="ds-card__body">
              {passMsg && (
                <div role="status" aria-live="polite" style={{ background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-success-text)' }}>
                  ✓ {passMsg}
                </div>
              )}
              {passErr && (
                <div id="pass-error" role="alert" style={{ background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-danger-text)' }}>
                  {passErr}
                </div>
              )}
              <form onSubmit={handlePass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="cur-pass">{pg.currentPass}</label>
                  <input
                    id="cur-pass"
                    type="password"
                    value={pass.currentPassword}
                    onChange={(e) => setPass((p) => ({ ...p, currentPassword: e.target.value }))}
                    required
                    aria-invalid={passErr ? 'true' : undefined}
                    aria-describedby={passErr ? 'pass-error' : undefined}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="new-pass">{pg.newPass}</label>
                  <input
                    id="new-pass"
                    type="password"
                    value={pass.newPassword}
                    onChange={(e) => setPass((p) => ({ ...p, newPassword: e.target.value }))}
                    required
                    aria-invalid={passErr ? 'true' : undefined}
                    aria-describedby={passErr ? 'pass-error' : undefined}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="conf-pass">{pg.confirmPass}</label>
                  <input
                    id="conf-pass"
                    type="password"
                    value={pass.confirm}
                    onChange={(e) => setPass((p) => ({ ...p, confirm: e.target.value }))}
                    required
                    aria-invalid={passErr ? 'true' : undefined}
                    aria-describedby={passErr ? 'pass-error' : undefined}
                  />
                </div>
                <button type="submit" className="btn btn--green" style={{ alignSelf: 'flex-start', borderRadius: 9 }} disabled={saving} aria-busy={saving}>
                  {saving ? pg.saving : pg.changeBtn}
                </button>
              </form>
            </div>
          </div>

          {/* Courses */}
          {subscription?.status === 'active' && courses.length > 0 && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <span className="ds-card__title"><span className="ds-card__title-icon">📚</span> {pg.myCourses}</span>
              </div>
              <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {courses.map((c) => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '1.2rem' }}>{c.icon || '📘'}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.title}</span>
                    <Link to={`/courses/${c._id}`} className="btn btn--green btn--sm" style={{ borderRadius: 7, fontSize: '0.78rem' }}>{pg.startLearning}</Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certificates */}
          {certificates.length > 0 && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <span className="ds-card__title"><span className="ds-card__title-icon">🎓</span> {pg.myCertificates}</span>
              </div>
              <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {certificates.map((c) => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {pg.certTypes?.[c.type] || c.type} · #{c.certificateNumber} · {new Date(c.issuedAt).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                    <button className="btn btn--ghost btn--sm" style={{ borderRadius: 7, fontSize: '0.78rem' }} onClick={() => printCertificate(c, pg.certTypes?.[c.type])}>
                      🖨 {pg.printCert}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Subscription */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon">💳</span> {pg.mySubscription}</span>
            </div>
            <div className="ds-card__body">
              {subscription?.status === 'active' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-success-surface)', borderRadius: 9, border: '1px solid var(--color-success-border)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-success-text)', fontWeight: 600 }}>Status</span>
                    <span className="ds-badge ds-badge--green">Active ✓</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 9, border: '1px solid var(--border-default)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 2 }}>PLAN</div>
                      <div style={{ fontWeight: 800, color: 'var(--text-brand)', fontSize: '0.9rem' }}>{subscription.plan}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 9, border: '1px solid var(--border-default)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 2 }}>EXPIRES</div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        {new Date(subscription.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  <Link to="/billing" className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center', borderRadius: 9, fontSize: '0.82rem' }}>
                    {pg.viewInvoices}
                  </Link>
                </div>
              ) : (
                <div>
                  <div style={{ padding: '10px 14px', background: 'var(--color-warning-surface)', borderRadius: 9, border: '1px solid var(--color-warning-border)', marginBottom: 12, fontSize: '0.82rem', color: 'var(--color-warning-text)' }}>
                    ⚠ {pg.noSub}
                  </div>
                  <Link to="/#pricing" className="btn btn--green" style={{ width: '100%', justifyContent: 'center', borderRadius: 9, fontSize: '0.855rem' }}>
                    {pg.viewPlans}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Parent link code */}
          {isStudent && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <span className="ds-card__title"><span className="ds-card__title-icon">🔗</span> {pg.parentLink}</span>
              </div>
              <div className="ds-card__body">
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>{pg.parentLinkDesc}</p>
                {linkCode ? (
                  <div>
                    <div style={{ textAlign: 'center', padding: '14px 18px', background: 'var(--color-primary-surface)', borderRadius: 10, border: '1px dashed var(--color-primary)', marginBottom: 10 }}>
                      <code style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '6px', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                        {linkCode}
                      </code>
                    </div>
                    <button
                      className="btn btn--ghost"
                      style={{ width: '100%', justifyContent: 'center', borderRadius: 9, fontSize: '0.82rem' }}
                      onClick={() => navigator.clipboard?.writeText(linkCode)}
                    >
                      📋 {pg.copy}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn--green" style={{ width: '100%', justifyContent: 'center', borderRadius: 9, fontSize: '0.855rem' }} onClick={revealCode} disabled={codeLoading}>
                    {codeLoading ? '…' : pg.showLinkCode}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon">⚡</span> Quick Links</span>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link to="/dashboard" className="ds-quick-action">
                <span className="ds-quick-action__icon">◧</span>
                <span className="ds-quick-action__label">Dashboard</span>
              </Link>
              <Link to="/billing" className="ds-quick-action">
                <span className="ds-quick-action__icon">💳</span>
                <span className="ds-quick-action__label">Billing</span>
              </Link>
              <Link to="/messages" className="ds-quick-action">
                <span className="ds-quick-action__icon">✉</span>
                <span className="ds-quick-action__label">Messages</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
