import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  getMyChildren, getChildDetail, linkChild, unlinkChild,
} from '../api/parentApi';
import { getClasses } from '../api/classApi';
import DashboardLayout from '../components/layout/DashboardLayout';
import ProgressRing from '../components/ui/ProgressRing';
import {
  Users, CalendarDays, Brain, ClipboardList, Link2, GraduationCap,
  BarChart3, X, Check, AlertTriangle, Calendar, CheckSquare, FileText,
  MessageSquare, Clock, Download, Share2,
} from 'lucide-react';
import '../styles/dashboard-shell.css';

const TXT = {
  en: {
    linkTitle: 'Link a child account',
    linkHelp: 'Ask your child to open their Profile page and copy the link code, then enter it below.',
    code: 'Link code', link: 'Link', linked: 'Child linked successfully.',
    children: 'My children', noChildren: 'No children linked yet.',
    records: 'records', verses: 'memorized verses', view: 'View progress', unlink: 'Unlink',
    close: 'Close', history: 'Teacher follow-up', noRecords: 'No follow-up records yet.',
    courseProgress: 'Course progress', hifz: 'Memorization (Hifz)',
    noCourses: 'No course activity.', noHifz: 'No memorization recorded.',
    surah: 'Surah', ayah: 'verses',
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
    by: 'by',
  },
  ar: {
    linkTitle: 'ربط حساب الابن',
    linkHelp: 'اطلب من ابنك فتح صفحة "الملف الشخصي" ونسخ كود الربط ثم أدخله هنا.',
    code: 'كود الربط', link: 'ربط', linked: 'تم ربط الابن بنجاح.',
    children: 'أبنائي', noChildren: 'لم يُربط أبناء بعد.',
    records: 'سجل', verses: 'آية محفوظة', view: 'عرض التقدم', unlink: 'إلغاء الربط',
    close: 'إغلاق', history: 'متابعة المعلم', noRecords: 'لا توجد سجلات متابعة.',
    courseProgress: 'تقدّم الكورسات', hifz: 'الحفظ',
    noCourses: 'لا يوجد نشاط.', noHifz: 'لم يُسجَّل حفظ.',
    surah: 'سورة', ayah: 'آية',
    present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر',
    by: 'بواسطة',
  },
  it: {
    linkTitle: 'Collega un account figlio',
    linkHelp: 'Chiedi a tuo figlio di aprire la pagina Profilo e copiare il codice di collegamento, poi inseriscilo qui sotto.',
    code: 'Codice collegamento', link: 'Collega', linked: 'Figlio collegato con successo.',
    children: 'I miei figli', noChildren: 'Nessun figlio collegato ancora.',
    records: 'registri', verses: 'versetti memorizzati', view: 'Vedi progressi', unlink: 'Scollega',
    close: 'Chiudi', history: 'Seguito insegnante', noRecords: 'Nessun registro di seguito.',
    courseProgress: 'Progressi nel corso', hifz: 'Memorizzazione (Hifz)',
    noCourses: 'Nessuna attività nel corso.', noHifz: 'Nessuna memorizzazione registrata.',
    surah: 'Surah', ayah: 'versetti',
    present: 'Presente', absent: 'Assente', late: 'In ritardo', excused: 'Giustificato',
    by: 'da',
  },
  fr: {
    linkTitle: 'Lier un compte enfant',
    linkHelp: 'Demandez à votre enfant d\'ouvrir sa page Profil et de copier le code de liaison, puis entrez-le ci-dessous.',
    code: 'Code de liaison', link: 'Lier', linked: 'Enfant lié avec succès.',
    children: 'Mes enfants', noChildren: 'Aucun enfant lié pour l\'instant.',
    records: 'enregistrements', verses: 'versets mémorisés', view: 'Voir les progrès', unlink: 'Délier',
    close: 'Fermer', history: 'Suivi enseignant', noRecords: 'Aucun enregistrement de suivi.',
    courseProgress: 'Progression du cours', hifz: 'Mémorisation (Hifz)',
    noCourses: 'Aucune activité dans le cours.', noHifz: 'Aucune mémorisation enregistrée.',
    surah: 'Sourate', ayah: 'versets',
    present: 'Présent', absent: 'Absent', late: 'En retard', excused: 'Excusé',
    by: 'par',
  },
  de: {
    linkTitle: 'Kindkonto verknüpfen',
    linkHelp: 'Bitte dein Kind, die Profilseite zu öffnen und den Verknüpfungscode zu kopieren, dann hier eingeben.',
    code: 'Verknüpfungscode', link: 'Verknüpfen', linked: 'Kind erfolgreich verknüpft.',
    children: 'Meine Kinder', noChildren: 'Noch keine Kinder verknüpft.',
    records: 'Einträge', verses: 'auswendig gelernte Verse', view: 'Fortschritt ansehen', unlink: 'Trennen',
    close: 'Schließen', history: 'Lehrerbegleitung', noRecords: 'Noch keine Begleitungseinträge.',
    courseProgress: 'Kursfortschritt', hifz: 'Memorierung (Hifz)',
    noCourses: 'Noch keine Kursaktivität.', noHifz: 'Keine Memorierung aufgezeichnet.',
    surah: 'Sure', ayah: 'Verse',
    present: 'Anwesend', absent: 'Abwesend', late: 'Zu spät', excused: 'Entschuldigt',
    by: 'von',
  },
  es: {
    linkTitle: 'Vincular cuenta de hijo',
    linkHelp: 'Pide a tu hijo que abra su página de Perfil y copie el código de vinculación, luego ingrésalo abajo.',
    code: 'Código de vinculación', link: 'Vincular', linked: 'Hijo vinculado con éxito.',
    children: 'Mis hijos', noChildren: 'Aún no hay hijos vinculados.',
    records: 'registros', verses: 'versículos memorizados', view: 'Ver progreso', unlink: 'Desvincular',
    close: 'Cerrar', history: 'Seguimiento del profesor', noRecords: 'Sin registros de seguimiento.',
    courseProgress: 'Progreso del curso', hifz: 'Memorización (Hifz)',
    noCourses: 'Sin actividad en el curso.', noHifz: 'Sin memorización registrada.',
    surah: 'Surah', ayah: 'versículos',
    present: 'Presente', absent: 'Ausente', late: 'Tarde', excused: 'Justificado',
    by: 'por',
  },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function attendBadge(a) {
  if (a === 'present') return 'ds-badge--green';
  if (a === 'absent')  return 'ds-badge--red';
  if (a === 'late')    return 'ds-badge--yellow';
  return 'ds-badge--gray';
}

/* ── Child detail modal ──────────────────────────────────────── */
function ChildModal({ childId, childList, L, onClose }) {
  const { data: detail, isLoading, error: detailError } = useQuery({
    queryKey: ['parent', 'child', childId],
    queryFn:  () => getChildDetail(childId),
    enabled:  !!childId,
    staleTime: 60000,
  });
  const child = childList.find((c) => c._id === childId);
  const initials = child?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)', zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)', borderRadius: 16,
          width: '100%', maxWidth: 620, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--grad-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{child?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {child?.email} · {child?.recordCount || 0} records · {child?.memorizedVerses || 0} verses
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-default)', background: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {detailError ? (
            <p style={{ color: 'var(--color-danger)', margin: '20px 0', fontSize: '0.875rem' }}>Failed to load details</p>
          ) : isLoading || !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="ds-spinner" /></div>
          ) : (
            <>
              {/* Follow-up records */}
              <h4 style={{ margin: '18px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={14} aria-hidden="true" /> {L.history} ({detail.records.length})
              </h4>
              {detail.records.length === 0 ? (
                <div className="ds-empty" style={{ padding: '14px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 36, height: 36, fontSize: '0.9rem' }}>📋</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{L.noRecords}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.records.map((r) => (
                    <div key={r._id} style={{ background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 9, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmtDate(r.date)}</span>
                        {r.teacher?.name && <span className="ds-badge ds-badge--blue">{L.by} {r.teacher.name}</span>}
                        {r.grade != null && <span className="ds-badge ds-badge--green">{r.grade}/100</span>}
                        {r.gradeLabel && <span className="ds-badge ds-badge--gray">{r.gradeLabel}</span>}
                        {r.attendance && <span className={`ds-badge ${attendBadge(r.attendance)}`}>{r.attendance}</span>}
                        {r.course && <span className="ds-badge ds-badge--gray">{r.course.icon} {r.course.title}</span>}
                      </div>
                      {r.note && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.note}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Course progress */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={14} aria-hidden="true" /> {L.courseProgress}
              </h4>
              {detail.courses.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{L.noCourses}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detail.courses.map((c) => (
                    <div key={c.courseId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{c.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>{c.done}/{c.total}</span>
                        </div>
                        <div className="ds-bar"><div className="ds-bar__fill" style={{ width: `${c.percent}%` }} /></div>
                      </div>
                      <ProgressRing value={c.percent} size={36} stroke={4} />
                    </div>
                  ))}
                </div>
              )}

              {/* Hifz */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={14} aria-hidden="true" /> {L.hifz}
              </h4>
              {detail.hifz.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{L.noHifz}</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {detail.hifz.map((h) => (
                    <div key={h._id} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)', fontSize: '0.78rem' }}>
                      <strong style={{ color: 'var(--text-brand)' }}>{L.surah} {h.chapterId}</strong>
                      {h.chapterName && <span style={{ color: 'var(--text-secondary)' }}> — {h.chapterName}</span>}
                      <br />
                      <span style={{ color: 'var(--color-success-text)', fontSize: '0.72rem' }}>
                        {h.memorizedVerses?.length || 0}{h.totalVerses ? `/${h.totalVerses}` : ''} {L.ayah}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════════ */
export default function ParentDashboard() {
  const { user }   = useAuth();
  const { lang }   = useLang();
  const L          = TXT[lang] || TXT.en;
  const queryClient = useQueryClient();

  const [code,      setCode]      = useState('');
  const [msg,       setMsg]       = useState('');
  const [error,     setError]     = useState('');
  const [openId,    setOpenId]    = useState(null);
  const [unlinkId,  setUnlinkId]  = useState(null);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef(null);

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['parent', 'children'],
    queryFn:  getMyChildren,
    staleTime: 120000,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['classes', 'upcoming'],
    queryFn:  () => getClasses({ upcoming: 1 }).catch(() => []),
    enabled:  children.length > 0,
    staleTime: 60000,
  });

  const linkMutation = useMutation({
    mutationFn: linkChild,
    onSuccess: () => {
      setMsg(L.linked); setCode(''); setError('');
      queryClient.invalidateQueries({ queryKey: ['parent', 'children'] });
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not link'),
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkChild,
    onSuccess: (_, id) => {
      queryClient.setQueryData(['parent', 'children'], (old = []) => old.filter((c) => c._id !== id));
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not unlink'),
  });

  const handleLink = (e) => {
    e.preventDefault();
    setError(''); setMsg('');
    if (!code.trim()) return;
    linkMutation.mutate(code.trim());
  };

  const todayClasses = classes.filter((c) => new Date(c.startsAt).toDateString() === new Date().toDateString());
  const totalVerses  = children.reduce((a, c) => a + (c.memorizedVerses || 0), 0);
  const totalRecords = children.reduce((a, c) => a + (c.recordCount || 0), 0);

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><Users size={14} style={{ display: 'inline', marginRight: 5 }} aria-hidden="true" /> Parent Portal</div>
          <h1 className="ds-page-hd__title">Welcome, {user?.name?.split(' ')[0]}</h1>
          <p className="ds-page-hd__sub">Monitor your children&apos;s Islamic education journey.</p>
        </div>
        <div className="ds-page-hd__actions">
          <button
            className="btn btn--green btn--sm"
            style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setShowReport(true)}
            disabled={children.length === 0}
          >
            <Download size={13} aria-hidden="true" /> Weekly Report
          </button>
          <Link to="/attendance" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckSquare size={13} aria-hidden="true" /> Attendance
          </Link>
          <Link to="/homework" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={13} aria-hidden="true" /> Homework
          </Link>
          <Link to="/calendar" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={13} aria-hidden="true" /> Calendar
          </Link>
        </div>
      </div>

      {/* KPI stats */}
      <div className="ds-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
        <div className="ds-stat">
          <div className="ds-stat__top"><div className="ds-stat__icon ds-stat__icon--green"><Users size={18} aria-hidden="true" /></div></div>
          <div className="ds-stat__value">{children.length}</div>
          <div className="ds-stat__label">Linked Children</div>
        </div>
        <div className="ds-stat">
          <div className="ds-stat__top"><div className="ds-stat__icon ds-stat__icon--blue"><CalendarDays size={18} aria-hidden="true" /></div></div>
          <div className="ds-stat__value">{todayClasses.length}</div>
          <div className="ds-stat__label">Classes Today</div>
          <div className="ds-stat__sub">{classes.length} total upcoming</div>
        </div>
        <div className="ds-stat">
          <div className="ds-stat__top"><div className="ds-stat__icon ds-stat__icon--purple"><Brain size={18} aria-hidden="true" /></div></div>
          <div className="ds-stat__value">{totalVerses}</div>
          <div className="ds-stat__label">Verses Memorized</div>
          <div className="ds-stat__sub">Across all children</div>
        </div>
        <div className="ds-stat">
          <div className="ds-stat__top"><div className="ds-stat__icon ds-stat__icon--gold"><ClipboardList size={18} aria-hidden="true" /></div></div>
          <div className="ds-stat__value">{totalRecords}</div>
          <div className="ds-stat__label">Teacher Records</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="ds-grid ds-grid-main-side">

        {/* Children list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Link child */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><Link2 size={14} aria-hidden="true" /></span> {L.linkTitle}</span>
            </div>
            <div className="ds-card__body">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>{L.linkHelp}</p>
              {msg && (
                <div style={{ background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: 'var(--color-success-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={13} aria-hidden="true" /> {msg}
                </div>
              )}
              {error && (
                <div style={{ background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: 'var(--color-danger-text)' }}>
                  {error}
                </div>
              )}
              <form onSubmit={handleLink} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="A1B2C3D4"
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid var(--border-default)', background: 'var(--bg-page)',
                    fontSize: '0.95rem', fontFamily: 'monospace', letterSpacing: '3px',
                    color: 'var(--text-primary)', outline: 'none', textTransform: 'uppercase',
                  }}
                />
                <button
                  type="submit"
                  className="btn btn--green"
                  style={{ borderRadius: 8, flexShrink: 0 }}
                  disabled={linkMutation.isPending}
                >
                  {linkMutation.isPending ? '…' : L.link}
                </button>
              </form>
            </div>
          </div>

          {/* Children */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><GraduationCap size={14} aria-hidden="true" /></span> {L.children} ({children.length})</span>
            </div>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="ds-spinner" /></div>
            ) : children.length === 0 ? (
              <div className="ds-empty">
                <div className="ds-empty__icon">👧</div>
                <div className="ds-empty__title">{L.noChildren}</div>
                <div className="ds-empty__desc">Use the link code from your child&apos;s profile to connect their account.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 18px 18px' }}>
                {children.map((child) => (
                  <div key={child._id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: 'var(--bg-page)', border: '1px solid var(--border-default)',
                    borderRadius: 12,
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                      {child.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 3 }}>{child.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span><ClipboardList size={11} style={{ display: 'inline', marginRight: 3 }} aria-hidden="true" />{child.recordCount || 0} {L.records}</span>
                        <span><Brain size={11} style={{ display: 'inline', marginRight: 3 }} aria-hidden="true" />{child.memorizedVerses || 0} {L.verses}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn--green btn--sm" style={{ borderRadius: 7, fontSize: '0.78rem' }} onClick={() => setOpenId(child._id)}>
                        {L.view}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ borderRadius: 7, fontSize: '0.78rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger-border)' }}
                        onClick={() => setUnlinkId(child._id)}
                        disabled={unlinkMutation.isPending}
                      >
                        {L.unlink}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Upcoming classes */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><Clock size={14} aria-hidden="true" /></span> Upcoming Classes</span>
              <Link to="/calendar" style={{ fontSize: '0.75rem', color: 'var(--text-brand)', fontWeight: 600, textDecoration: 'none' }}>View all</Link>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {classes.length === 0 ? (
                <div className="ds-empty" style={{ padding: '16px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 38, height: 38, fontSize: '1rem' }}>📅</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No upcoming classes</div>
                </div>
              ) : (
                classes.slice(0, 5).map((c) => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 9 }}>
                    <CalendarDays size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.845rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {new Date(c.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' · '}{fmtTime(c.startsAt)}
                        {c.student?.name && ` · ${c.student.name}`}
                      </div>
                    </div>
                    {c.meetingUrl && (
                      <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm" style={{ borderRadius: 6, fontSize: '0.72rem', flexShrink: 0 }}>Join</a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Children overview cards */}
          {children.length > 0 && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <span className="ds-card__title"><span className="ds-card__title-icon"><BarChart3 size={14} aria-hidden="true" /></span> Progress Overview</span>
              </div>
              <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {children.map((child) => (
                  <div key={child._id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.845rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                        {child.name?.split(' ')[0]}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="ds-badge ds-badge--green"><Brain size={10} style={{ display: 'inline', marginRight: 3 }} aria-hidden="true" />{child.memorizedVerses || 0} verses</span>
                        <span className="ds-badge ds-badge--gray"><ClipboardList size={10} style={{ display: 'inline', marginRight: 3 }} aria-hidden="true" />{child.recordCount || 0}</span>
                      </div>
                    </div>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ borderRadius: 7, fontSize: '0.75rem', flexShrink: 0 }}
                      onClick={() => setOpenId(child._id)}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title">Track Progress</span>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { to: '/attendance', Icon: CheckSquare,  label: 'Attendance',     sub: 'View session presence history' },
                { to: '/homework',   Icon: FileText,     label: 'Homework',       sub: 'Track assignments and grades' },
                { to: '/calendar',   Icon: Calendar,     label: 'Schedule',       sub: 'See upcoming class sessions' },
                { to: '/messages',   Icon: MessageSquare, label: 'Messages',     sub: 'Contact teachers directly' },
              ].map(({ to, Icon, label, sub }) => (
                <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, background: 'var(--bg-page)', border: '1px solid var(--border-subtle)', textDecoration: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-primary-surface, #e6f4ef)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Guidance panel */}
          <div style={{
            padding: '14px 16px', background: 'var(--color-primary-surface)',
            border: '1px solid var(--color-primary-border)', borderRadius: 12,
            fontSize: '0.82rem', color: 'var(--text-brand)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><GraduationCap size={13} aria-hidden="true" /> Parent Tip</div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Encourage your child to recite their memorized surahs daily. Consistent revision is key to retention.
            </p>
          </div>
        </div>
      </div>

      {/* Weekly Report modal */}
      {showReport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowReport(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Weekly Progress Report"
        >
          <div
            ref={reportRef}
            style={{ background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Report header */}
            <div style={{ background: 'var(--grad-green, linear-gradient(135deg,#0b6e4f,#1a9e72))', padding: '28px 32px', borderRadius: '18px 18px 0 0', position: 'relative' }}>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                Weekly Progress Report — {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.4rem', margin: 0 }}>
                Al-Rahma Academy
              </h2>
              <p style={{ color: 'rgba(255,255,255,.75)', margin: '6px 0 0', fontSize: '0.88rem' }}>
                Learning progress report for your {children.length > 1 ? `${children.length} children` : 'child'}
              </p>
              <button
                style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowReport(false)}
                aria-label="Close"
              >×</button>
            </div>

            {/* Summary KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--border-default)', margin: 0 }}>
              {[
                { icon: '📅', value: classes.filter((c) => new Date(c.startsAt) > new Date(Date.now() - 7*86400000)).length, label: 'Classes this week' },
                { icon: '🧠', value: totalVerses, label: 'Total verses memorized' },
                { icon: '📋', value: totalRecords, label: 'Teacher records' },
              ].map((k) => (
                <div key={k.label} style={{ background: 'var(--bg-surface)', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{k.icon}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Per-child breakdown */}
            <div style={{ padding: '24px 28px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={16} aria-hidden="true" /> Children Progress
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {children.map((child) => (
                  <div key={child._id} style={{ padding: '16px', background: 'var(--bg-page)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--grad-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                        {child.name?.split(' ').map((n) => n[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{child.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{child.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '10px 12px', background: 'var(--color-success-surface)', borderRadius: 8, border: '1px solid var(--color-success-border)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-success-text)' }}>{child.memorizedVerses || 0}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>Verses memorized</div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--color-primary-surface)', borderRadius: 8, border: '1px solid var(--color-primary-border)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)' }}>{child.recordCount || 0}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>Teacher records</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ padding: '0 28px 24px', display: 'flex', gap: 10 }}>
              <button
                className="btn btn--green"
                style={{ flex: 1, justifyContent: 'center', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 7 }}
                onClick={() => window.print()}
              >
                <Download size={15} aria-hidden="true" /> Print / Save as PDF
              </button>
              <button
                className="btn btn--ghost"
                style={{ borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  const txt = `📊 Weekly report from Al-Rahma Academy:\n${children.map((c) => `• ${c.name}: ${c.memorizedVerses||0} verses memorized, ${c.recordCount||0} teacher records`).join('\n')}\nTotal classes this week: ${classes.filter((c)=>new Date(c.startsAt)>new Date(Date.now()-7*86400000)).length}`;
                  if (navigator.share) navigator.share({ title: 'Weekly Report', text: txt }).catch(()=>{});
                  else navigator.clipboard?.writeText(txt);
                }}
              >
                <Share2 size={15} aria-hidden="true" /> Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child detail modal */}
      {openId && (
        <ChildModal
          childId={openId}
          childList={children}
          L={L}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Unlink confirmation dialog */}
      {unlinkId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(3px)', zIndex: 'var(--z-modal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlink-dialog-title"
          onClick={() => setUnlinkId(null)}
        >
          <div
            style={{
              background: 'var(--bg-surface)', borderRadius: 16,
              padding: '28px 24px', width: '100%', maxWidth: 380,
              border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-danger-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AlertTriangle size={22} style={{ color: '#dc2626' }} aria-hidden="true" /></div>
              <div>
                <div id="unlink-dialog-title" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 6 }}>
                  {L.unlink}?
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {lang === 'ar'
                    ? 'سيتم إلغاء ربط هذا الحساب. يمكنك إعادة ربطه في أي وقت.'
                    : 'This child will be unlinked from your account. You can re-link them anytime using their link code.'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn--ghost btn--sm"
                style={{ borderRadius: 8, minHeight: 44, paddingInline: 18 }}
                onClick={() => setUnlinkId(null)}
              >
                {L.close}
              </button>
              <button
                className="btn btn--sm"
                style={{ borderRadius: 8, minHeight: 44, paddingInline: 18, background: 'var(--color-danger)', color: '#fff', border: 'none' }}
                onClick={() => { unlinkMutation.mutate(unlinkId); setUnlinkId(null); }}
                disabled={unlinkMutation.isPending}
              >
                {unlinkMutation.isPending ? '…' : L.unlink}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
