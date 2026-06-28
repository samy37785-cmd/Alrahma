import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  getMyChildren, getChildDetail, linkChild, unlinkChild,
} from '../api/client';
import UpcomingClasses from '../components/features/UpcomingClasses';
import '../styles/dashboard.css';

const TXT = {
  en: {
    bar: 'AL-Rahma · Parent', back: 'View site', logout: 'Logout',
    hi: 'Welcome', linkTitle: 'Link your child', linkHelp: "Ask your child to open their Profile page and copy the link code, then paste it here.",
    code: 'Link code', link: 'Link child', children: 'My children', noChildren: 'No children linked yet. Use the box above to link one.',
    records: 'records', verses: 'verses memorized', view: 'View', unlink: 'Unlink', close: 'Close',
    history: 'Follow-up from teachers', noRecords: 'No follow-up records yet.', by: 'by',
    courseProgress: 'Course progress', hifz: 'Memorization (Hifz)', noCourses: 'No course activity yet.',
    noHifz: 'No memorization recorded yet.', surah: 'Surah', ayah: 'ayah',
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
    linked: 'Child linked successfully.', upcomingClasses: 'Upcoming live classes',
  },
  ar: {
    bar: 'الرحمة · ولي الأمر', back: 'عرض الموقع', logout: 'خروج',
    hi: 'أهلاً', linkTitle: 'اربط ابنك', linkHelp: 'اطلب من ابنك يفتح صفحة "الملف الشخصي" وينسخ كود الربط، وبعدين اكتبه هنا.',
    code: 'كود الربط', link: 'ربط', children: 'أبنائي', noChildren: 'لسه مفيش أبناء مربوطين. استخدم الخانة فوق عشان تربط واحد.',
    records: 'سجل', verses: 'آية محفوظة', view: 'عرض', unlink: 'إلغاء الربط', close: 'إغلاق',
    history: 'متابعة المعلمين', noRecords: 'لا توجد سجلات متابعة بعد.', by: 'بواسطة',
    courseProgress: 'تقدّم الكورسات', hifz: 'الحفظ', noCourses: 'لا يوجد نشاط في الكورسات بعد.',
    noHifz: 'لم يُسجَّل حفظ بعد.', surah: 'سورة', ayah: 'آية',
    present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر',
    linked: 'تم ربط الابن بنجاح.', upcomingClasses: 'الحصص المباشرة القادمة',
  },
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (dt.getHours() || dt.getMinutes())
    ? `${date} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : date;
}

export default function ParentDashboard() {
  const { user, logout } = useAuth();
  const { lang } = useLang();
  const L = TXT[lang === 'ar' ? 'ar' : 'en'];
  const navigate = useNavigate();

  const [children, setChildren] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [code, setCode]         = useState('');
  const [msg, setMsg]           = useState('');
  const [error, setError]       = useState('');

  const [openId, setOpenId]     = useState(null);
  const [detail, setDetail]     = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setChildren(await getMyChildren());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLink = async (e) => {
    e.preventDefault();
    setError(''); setMsg('');
    if (!code.trim()) return;
    try {
      await linkChild(code.trim());
      setCode('');
      setMsg(L.linked);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not link');
    }
  };

  const openChild = async (id) => {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getChildDetail(id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally {
      setDetailLoading(false);
    }
  };
  const closeChild = () => { setOpenId(null); setDetail(null); };

  const handleUnlink = async (id) => {
    if (!confirm(L.unlink + '?')) return;
    try {
      await unlinkChild(id);
      setChildren((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not unlink');
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>{L.bar}</strong>
          <div className="admin__bar-right">
            <span>{L.hi}, {user?.name}</span>
            <Link to="/" className="btn btn--ghost btn--sm">{L.back}</Link>
            <button className="btn btn--gold btn--sm" onClick={handleLogout}>{L.logout}</button>
          </div>
        </div>
      </header>

      <main className="container admin__main">
        {error && !openId && <p className="auth__error">{error}</p>}
        {msg && <p style={{ color: '#0b6e4f', fontWeight: 600 }}>{msg}</p>}

        {/* Upcoming live classes for the linked children (hidden when none) */}
        <UpcomingClasses showStudent title={`📅 ${L.upcomingClasses}`} />

        {/* Link a child */}
        <section className="admin__panel" style={{ marginBottom: '1.5rem' }}>
          <h2>🔗 {L.linkTitle}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{L.linkHelp}</p>
          <form onSubmit={handleLink} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>{L.code}</label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A1B2C3D4" style={{ fontFamily: 'monospace', letterSpacing: '2px' }} />
            </div>
            <button type="submit" className="btn btn--green">{L.link}</button>
          </form>
        </section>

        {/* Children list */}
        <section className="admin__panel">
          <h2>👨‍👩‍👧 {L.children} ({children.length})</h2>
          {loading ? (
            <p className="admin__empty">…</p>
          ) : children.length === 0 ? (
            <p className="admin__empty">{L.noChildren}</p>
          ) : (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>{lang === 'ar' ? 'الاسم' : 'Name'}</th><th>Email</th><th>{L.records}</th><th>{L.verses}</th><th></th></tr>
                </thead>
                <tbody>
                  {children.map((c) => (
                    <tr key={c._id}>
                      <td>{c.name}</td>
                      <td>{c.email}</td>
                      <td>{c.recordCount || 0}</td>
                      <td>{c.memorizedVerses || 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn--green btn--sm" onClick={() => openChild(c._id)}>{L.view}</button>
                          <button className="admin__del" onClick={() => handleUnlink(c._id)}>{L.unlink}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── Child detail modal (read-only) ── */}
      {openId && (
        <div className="modal" onClick={closeChild}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 640, width: '94%' }}>
            <button className="modal__close" onClick={closeChild} aria-label={L.close}>×</button>

            {detailLoading || !detail ? (
              <p className="admin__empty">…</p>
            ) : (
              <>
                <h3 className="modal__title" style={{ marginBottom: 4 }}>👤 {detail.student.name}</h3>
                <p style={{ color: '#888', fontSize: '.85rem', marginTop: 0 }}>{detail.student.email}</p>

                {/* Teacher follow-up */}
                <h4 style={{ margin: '1rem 0 .6rem' }}>🗂 {L.history}</h4>
                {detail.records.length === 0 ? (
                  <p className="admin__empty">{L.noRecords}</p>
                ) : (
                  <ul className="admin__list">
                    {detail.records.map((r) => (
                      <li key={r._id} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                        <strong style={{ fontSize: '.86rem' }}>
                          {fmtDate(r.date)}{r.teacher?.name ? ` · ${L.by} ${r.teacher.name}` : ''}
                        </strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {r.grade != null && <span className="admin__badge admin__badge--approved">{r.grade}/100</span>}
                          {r.gradeLabel && <span className="admin__badge">{r.gradeLabel}</span>}
                          {r.attendance && <span className="admin__badge">{L[r.attendance] || r.attendance}</span>}
                          {r.course && <span className="admin__badge">{r.course.icon} {r.course.title}</span>}
                        </div>
                        {r.note && <p style={{ margin: '2px 0 0', fontSize: '.85rem', color: '#444' }}>{r.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Course progress */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>📚 {L.courseProgress}</h4>
                {detail.courses.length ? (
                  <ul className="admin__list">
                    {detail.courses.map((c) => (
                      <li key={c.courseId} style={{ alignItems: 'center' }}>
                        <span>{c.icon} {c.title}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                          <div style={{ flex: 1, height: 7, background: '#e6efe9', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${c.percent}%`, height: '100%', background: '#0b6e4f' }} />
                          </div>
                          <span style={{ fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.done}/{c.total}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="admin__empty">{L.noCourses}</p>}

                {/* Hifz */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>🧠 {L.hifz}</h4>
                {detail.hifz.length ? (
                  <ul className="admin__list">
                    {detail.hifz.map((h) => (
                      <li key={h._id} style={{ alignItems: 'center' }}>
                        <span>{L.surah} {h.chapterId} — {h.chapterName || ''}</span>
                        <span style={{ fontSize: '.82rem', fontWeight: 600 }}>
                          {h.memorizedVerses?.length || 0}{h.totalVerses ? `/${h.totalVerses}` : ''} {L.ayah}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="admin__empty">{L.noHifz}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
