import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { getMyStudents } from '../api/teacherApi';
import { getCourses } from '../api/courseApi';
import { getClasses, createClass, deleteClass } from '../api/classApi';
import { COURSE_KEYS } from '../hooks/useCourses';
import DashboardLayout from '../components/layout/DashboardLayout';
import ProgressRing from '../components/ui/ProgressRing';
import { SkeletonDashboard } from '../components/ui/Skeleton';
import { DsBarChart, DsChartEmpty } from '../components/ui/DsChart';
import {
  Users, CalendarDays, ClipboardList, Brain, GraduationCap, BarChart3,
  Calendar, CheckSquare, FileText, MessageSquare, X, Save, AlertCircle,
  Video, Clock,
} from 'lucide-react';
import { getNameInitials } from '../utils/nameInitials';
import { minutesUntil } from '../utils/date';
import StudentModal from '../components/features/teacher/StudentModal';

/* ── i18n ──────────────────────────────────────────────────────── */
const EMPTY_CLASS  = { student: '', title: '', startsAt: '', durationMin: 30, meetingUrl: '' };
export default function TeacherDashboard() {
  const { user }   = useAuth();
  const { t, lang } = useLang();
  const L          = t.teacherDash;
  const queryClient = useQueryClient();

  const [openId,     setOpenId]     = useState(null);
  const [error,      setError]      = useState('');
  const [classForm,  setClassForm]  = useState(EMPTY_CLASS);
  const [search,     setSearch]     = useState('');
  const [showSched,  setShowSched]  = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['teacher', 'students'],
    queryFn:  getMyStudents,
    staleTime: 120000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: COURSE_KEYS.list,
    queryFn:  () => getCourses().catch(() => []),
    staleTime: 300000,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['teacher', 'classes'],
    queryFn:  () => getClasses({ upcoming: 1 }).catch(() => []),
    staleTime: 120000,
  });

  const createClassMutation = useMutation({
    mutationFn: createClass,
    onSuccess: (created) => {
      queryClient.setQueryData(['teacher', 'classes'], (old = []) =>
        [...old, created].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
      );
      setClassForm(EMPTY_CLASS);
      setError('');
      setShowSched(false);
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not schedule class'),
  });

  const deleteClassMutation = useMutation({
    mutationFn: deleteClass,
    onSuccess: (_, id) => {
      queryClient.setQueryData(['teacher', 'classes'], (old = []) => old.filter((c) => c._id !== id));
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not cancel'),
  });

  const scheduleClass = (e) => {
    e.preventDefault();
    setError('');
    if (!classForm.student || !classForm.title.trim() || !classForm.startsAt) {
      setError(L.classNeed);
      return;
    }
    createClassMutation.mutate({
      student:     classForm.student,
      title:       classForm.title,
      startsAt:    new Date(classForm.startsAt).toISOString(),
      durationMin: Number(classForm.durationMin) || 30,
      meetingUrl:  classForm.meetingUrl || '',
    });
  };

  const setCls = (k) => (e) => setClassForm((f) => ({ ...f, [k]: e.target.value }));

  const filteredStudents = useMemo(
    () => students.filter((s) =>
      !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
    ),
    [students, search],
  );

  const todayClasses = classes.filter((c) => {
    const d = new Date(c.startsAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  /* KPIs */
  const totalRecords     = students.reduce((a, s) => a + (s.recordCount || 0), 0);
  const totalVerses      = students.reduce((a, s) => a + (s.memorizedVerses || 0), 0);
  const avgVerses        = students.length ? Math.round(totalVerses / students.length) : 0;

  if (isLoading) {
    return <DashboardLayout><SkeletonDashboard /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><GraduationCap size={14} style={{ display: 'inline', marginRight: 5 }} aria-hidden="true" /> Teacher Portal</div>
          <h1 className="ds-page-hd__title">Welcome, {user?.name?.split(' ')[0]}</h1>
          <p className="ds-page-hd__sub">Manage your students, track progress, and schedule live sessions.</p>
        </div>
        <div className="ds-page-hd__actions">
          <button
            className="btn btn--green btn--sm"
            onClick={() => setShowSched(true)}
            style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <CalendarDays size={13} aria-hidden="true" /> Schedule Class
          </button>
          <Link to="/attendance" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckSquare size={13} aria-hidden="true" /> Attendance
          </Link>
          <Link to="/homework" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={13} aria-hidden="true" /> Homework
          </Link>
          <Link to="/messages" className="btn btn--ghost btn--sm" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={13} aria-hidden="true" /> Messages
          </Link>
        </div>
      </div>

      {error && !openId && (
        <div style={{
          background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
          borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: '0.855rem', color: 'var(--color-danger-text)',
        }}>
          {error}
        </div>
      )}

      {/* KPI Stats */}
      <div className="ds-stats">
        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--green"><Users size={18} aria-hidden="true" /></div>
          </div>
          <div className="ds-stat__value">{students.length}</div>
          <div className="ds-stat__label">My Students</div>
          <div className="ds-stat__sub">Assigned to you</div>
        </div>

        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--blue"><CalendarDays size={18} aria-hidden="true" /></div>
          </div>
          <div className="ds-stat__value">{todayClasses.length}</div>
          <div className="ds-stat__label">Classes Today</div>
          <div className="ds-stat__sub">{classes.length} total upcoming</div>
        </div>

        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--gold"><ClipboardList size={18} aria-hidden="true" /></div>
          </div>
          <div className="ds-stat__value">{totalRecords}</div>
          <div className="ds-stat__label">Follow-up Records</div>
          <div className="ds-stat__sub">Across all students</div>
        </div>

        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--purple"><Brain size={18} aria-hidden="true" /></div>
          </div>
          <div className="ds-stat__value">{avgVerses}</div>
          <div className="ds-stat__label">Avg. Verses / Student</div>
          <div className="ds-stat__sub">{totalVerses} total memorized</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="ds-grid ds-grid-main-side" style={{ marginBottom: 20 }}>

        {/* LEFT — Students table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Students */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><Users size={14} aria-hidden="true" /></span> My Students ({students.length})</span>
            </div>
            <div style={{ padding: '10px 18px 0' }}>
              <input
                type="search"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-default)', background: 'var(--bg-page)',
                  fontSize: '0.855rem', color: 'var(--text-primary)', outline: 'none',
                  marginBottom: 12,
                }}
              />
            </div>

            {filteredStudents.length === 0 ? (
              <div className="ds-empty">
                <div className="ds-empty__icon">👥</div>
                <div className="ds-empty__title">No students found</div>
                <div className="ds-empty__desc">
                  {search ? 'Try a different search term.' : 'No students have been assigned to you yet. Contact the admin.'}
                </div>
              </div>
            ) : (
              <div className="ds-table-wrap" style={{ margin: '0 0 4px', borderRadius: '0 0 13px 13px', border: 'none', borderTop: '1px solid var(--border-default)' }}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Records</th>
                      <th>Hifz Verses</th>
                      <th>Engagement</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => {
                      const engagePct = Math.min(100, Math.round((s.recordCount || 0) / Math.max(totalRecords / students.length, 1) * 100));
                      return (
                        <tr key={s._id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%', background: 'var(--grad-green)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: '0.78rem', flexShrink: 0,
                              }}>
                                {getNameInitials(s.name)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{s.name}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="ds-badge ds-badge--gray">{s.recordCount || 0}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.memorizedVerses || 0}</span>
                          </td>
                          <td style={{ minWidth: 100 }}>
                            <div className="ds-bar">
                              <div className="ds-bar__fill" style={{ width: `${engagePct}%` }} />
                            </div>
                          </td>
                          <td>
                            <button
                              className="btn btn--green btn--sm"
                              onClick={() => setOpenId(s._id)}
                              style={{ borderRadius: 7, fontSize: '0.78rem' }}
                            >
                              Open →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Schedule form (inline toggle) */}
          {showSched && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <span className="ds-card__title"><span className="ds-card__title-icon"><Video size={14} aria-hidden="true" /></span> Schedule a Live Class</span>
                <button onClick={() => setShowSched(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><X size={16} aria-hidden="true" /></button>
              </div>
              <div className="ds-card__body">
                <form onSubmit={scheduleClass} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>{L.student}</label>
                      <select value={classForm.student} onChange={setCls('student')}>
                        <option value="">—</option>
                        {students.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>{L.classTitle}</label>
                      <input value={classForm.title} onChange={setCls('title')} placeholder="Tajweed lesson" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>{L.dateTime}</label>
                      <input type="datetime-local" value={classForm.startsAt} onChange={setCls('startsAt')} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>{L.duration}</label>
                      <input type="number" min="5" max="240" value={classForm.durationMin} onChange={setCls('durationMin')} />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>{L.meetingUrl}</label>
                    <input value={classForm.meetingUrl} onChange={setCls('meetingUrl')} placeholder="https://meet.google.com/…" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn--green" style={{ borderRadius: 8, fontSize: '0.855rem', display: 'flex', alignItems: 'center', gap: 5 }} disabled={createClassMutation.isPending}>
                      {createClassMutation.isPending ? '…' : <><CalendarDays size={13} aria-hidden="true" /> {L.schedule}</>}
                    </button>
                    <button type="button" className="btn btn--ghost" style={{ borderRadius: 8, fontSize: '0.855rem' }} onClick={() => setShowSched(false)}>
                      Cancel
                    </button>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: 0 }}>
                    🕒 {L.tzNote}
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Today's schedule */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><CalendarDays size={14} aria-hidden="true" /></span> Today&apos;s Classes</span>
              <button
                className="ds-card__link"
                onClick={() => setShowSched(true)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-brand)', fontSize: '0.75rem', fontWeight: 600 }}
              >
                + Add
              </button>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayClasses.length === 0 ? (
                <div className="ds-empty" style={{ padding: '14px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 36, height: 36, fontSize: '1rem' }}>🗓</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No classes today</div>
                </div>
              ) : (
                todayClasses.map((c) => {
                  const mins = minutesUntil(c.startsAt);
                  return (
                    <div key={c._id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9,
                      background: 'var(--bg-page)', border: '1px solid var(--border-default)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.845rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {new Date(c.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {c.durationMin}min
                          {c.student && ` · ${c.student.name}`}
                        </div>
                      </div>
                      {mins <= 15
                        ? <span className="ds-badge ds-badge--green">Now</span>
                        : <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>in {mins}m</span>
                      }
                      {c.meetingUrl && (
                        <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm" style={{ borderRadius: 6, fontSize: '0.72rem' }}>
                          Join
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Upcoming classes */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><Clock size={14} aria-hidden="true" /></span> Upcoming ({classes.length})</span>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {classes.length === 0 ? (
                <div className="ds-empty" style={{ padding: '14px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 36, height: 36, fontSize: '0.9rem' }}>📅</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{L.noClasses}</div>
                </div>
              ) : (
                classes.slice(0, 5).map((c) => (
                  <div key={c._id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        {new Date(c.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' · '}{new Date(c.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteClassMutation.mutate(c._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.72rem' }}
                      title={L.cancelClass}
                      disabled={deleteClassMutation.isPending}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Student engagement chart */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title"><span className="ds-card__title-icon"><BarChart3 size={14} aria-hidden="true" /></span> Top Students by Hifz</span>
            </div>
            <div className="ds-card__body">
              {students.length === 0 ? (
                <DsChartEmpty height={120} message="No memorization data yet" />
              ) : (() => {
                const top5 = [...students]
                  .sort((a, b) => (b.memorizedVerses || 0) - (a.memorizedVerses || 0))
                  .slice(0, 5);
                const chartData = top5.map((s) => ({
                  name: s.name?.split(' ')[0] || '—',
                  Verses: s.memorizedVerses || 0,
                }));
                return (
                  <DsBarChart
                    data={chartData}
                    bars={[{ key: 'Verses', label: 'Verses Memorized', color: '#c8842a' }]}
                    height={150}
                    xKey="name"
                    showGrid={false}
                    maxBarSize={28}
                  />
                );
              })()}
            </div>
          </div>

          {/* Quick links */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <span className="ds-card__title">Quick Actions</span>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { to: '/calendar',   Icon: Calendar,     label: 'View Calendar',  sub: 'Monthly schedule view' },
                { to: '/attendance', Icon: CheckSquare,  label: 'Mark Attendance', sub: 'One-click session marking' },
                { to: '/homework',   Icon: FileText,     label: 'Assignments',    sub: 'Create & grade homework' },
                { to: '/messages',   Icon: MessageSquare, label: 'Messages',      sub: 'Student communications' },
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
        </div>
      </div>

      {/* Student detail modal */}
      {openId && (
        <StudentModal
          studentId={openId}
          students={students}
          courses={courses}
          L={L}
          lang={lang}
          onClose={() => setOpenId(null)}
        />
      )}
    </DashboardLayout>
  );
}
