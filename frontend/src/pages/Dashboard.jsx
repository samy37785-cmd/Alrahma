import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { getMe, getCourses, getMyEnrollment } from '../api/client';
import UpcomingClasses from '../components/features/UpcomingClasses';
import { site } from '../data';
import '../styles/dashboard.css';

const SESSIONS_BY_PLAN = { starter: 2, base: 2, debutant: 2, einstieg: 2, inicial: 2, 'البداية': 2, standard: 3, القياسية: 3, premium: 4, المميزة: 4 };

function sessionsFromPlan(plan) {
  if (!plan) return '—';
  const key = plan.toLowerCase().trim();
  for (const [k, v] of Object.entries(SESSIONS_BY_PLAN)) {
    if (key.includes(k)) return v;
  }
  return '—';
}

function daysLeft(validUntil) {
  if (!validUntil) return null;
  const diff = Math.ceil((new Date(validUntil) - Date.now()) / 86400000);
  return diff;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const d = t.dashboard;
  const navigate = useNavigate();

  const [sub, setSub]           = useState(user?.subscription || null);
  const [enrollment, setEnroll] = useState(null);
  const [courses, setCourses]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      getMe().catch(() => null),
      getMyEnrollment().catch(() => null),
      getCourses().catch(() => []),
    ]).then(([me, enroll, crs]) => {
      if (me?.subscription) setSub(me.subscription);
      setEnroll(enroll);
      setCourses(crs || []);
    }).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => { logout(); navigate('/'); };

  const isActive  = sub?.status === 'active';
  const days      = daysLeft(sub?.validUntil);
  const sessions  = sessionsFromPlan(sub?.plan);
  const waText    = encodeURIComponent(`Hi! I'm ${user?.name}, a student at Al-Rahma Academy.`);

  if (loading) {
    return (
      <div className="dash">
        <div className="dash__loading">
          <div style={{ width: 40, height: 40, border: '4px solid #cfe6dc', borderTopColor: '#0b6e4f', borderRadius: '50%', animation: 'it-spin 0.8s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      {/* top bar */}
      <header className="dash__bar">
        <div className="container dash__bar-inner">
          <strong>{d.bar}</strong>
          <div className="dash__bar-right">
            <Link to="/" className="btn btn--ghost btn--sm">{d.backToSite}</Link>
            <Link to="/profile" className="btn btn--ghost btn--sm">{d.settings}</Link>
            <button className="btn btn--gold btn--sm" onClick={handleLogout}>{d.logout}</button>
          </div>
        </div>
      </header>

      {/* welcome */}
      <section className="dash__welcome">
        <div className="container">
          <h1>{d.welcome} {user?.name?.split(' ')[0]} 👋</h1>
          {isActive && sub?.plan && (
            <p>{sub.plan} · {d.subExpires} {new Date(sub.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          )}
          {!isActive && <p style={{ color: '#fca5a5' }}>{d.noSub}</p>}

          {/* stats */}
          <div className="dash__stats">
            <div className="dash__stat">
              <p className="dash__stat-label">{d.planCard}</p>
              <p className="dash__stat-value dash__stat-value--gold">{sub?.plan || '—'}</p>
            </div>
            <div className="dash__stat">
              <p className="dash__stat-label">{d.sessionsCard}</p>
              <p className="dash__stat-value">{sessions}</p>
            </div>
            <div className="dash__stat">
              <p className="dash__stat-label">{d.daysCard}</p>
              <p className={`dash__stat-value ${days !== null && days <= 7 ? 'dash__stat-value--warn' : ''}`}>
                {days !== null ? (days > 0 ? days : 0) : '—'}
              </p>
            </div>
            <div className="dash__stat">
              <p className="dash__stat-label">{d.statusCard}</p>
              <p className={`dash__stat-value ${isActive ? 'dash__stat-value--ok' : 'dash__stat-value--muted'}`}>
                {isActive ? d.active : d.inactive}
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="container dash__main">
        {/* expired banner */}
        {!isActive && (
          <div className="dash__expired">
            <span>⚠️</span>
            <span>{d.subExpired} — {d.noSub}</span>
            <Link to="/#pricing" className="btn btn--green btn--sm" style={{ marginLeft: 'auto' }}>{d.viewPlans}</Link>
          </div>
        )}

        {/* upcoming live classes (hidden when none) */}
        <UpcomingClasses />

        {/* schedule note */}
        <div className="dash__note">
          <span>📱</span>
          <span>{d.scheduleNote}</span>
        </div>

        {/* tutor + quick actions */}
        <div className="dash__row2">
          {/* tutor card */}
          <div className="dash__panel">
            <h2>👨‍🏫 {d.tutor}</h2>
            {enrollment?.teacherName ? (
              <>
                <p className="dash__tutor-name">{enrollment.teacherName}</p>
                {enrollment.subjects?.length > 0 && (
                  <p className="dash__tutor-sub">{d.subjects} {enrollment.subjects.join(', ')}</p>
                )}
                {enrollment.plan && (
                  <p className="dash__tutor-sub" style={{ marginTop: 0 }}>Plan: {enrollment.plan}</p>
                )}
                <div className="dash__tutor-actions">
                  <a
                    href={`https://wa.me/${site.whatsapp}?text=${waText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--green btn--sm"
                  >
                    {d.contactTutor}
                  </a>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{d.noTutor}</p>
            )}
          </div>

          {/* quick actions */}
          <div className="dash__panel">
            <h2>⚡ {d.quickActions}</h2>
            <div className="dash__actions">
              <a href={`https://wa.me/${site.whatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="dash__action-btn">
                <span className="dash__action-icon">💬</span> {d.contactTutor}
              </a>
              <Link to="/messages" className="dash__action-btn">
                <span className="dash__action-icon">💬</span> {d.messages || 'Messages'}
              </Link>
              <Link to="/billing" className="dash__action-btn">
                <span className="dash__action-icon">💳</span> {d.viewInvoices}
              </Link>
              <Link to="/profile" className="dash__action-btn">
                <span className="dash__action-icon">⚙️</span> {d.profileSettings}
              </Link>
              {!isActive && (
                <Link to="/#pricing" className="dash__action-btn">
                  <span className="dash__action-icon">🚀</span> {d.viewPlans}
                </Link>
              )}
              {!enrollment && (
                <Link to="/enroll" className="dash__action-btn">
                  <span className="dash__action-icon">📋</span> {d.enrollNow}
                </Link>
              )}
              <Link to="/quran" className="dash__action-btn">
                <span className="dash__action-icon">📖</span> {t.nav.hadith || 'Quran'}
              </Link>
            </div>
          </div>
        </div>

        {/* my courses */}
        {isActive && courses.length > 0 && (
          <div className="dash__panel">
            <h2>📚 {d.myCoursesTitle}</h2>
            <div className="dash__courses">
              {courses.map((c) => (
                <div key={c._id} className="dash__course-card">
                  <span className="dash__course-icon">{c.icon || '📘'}</span>
                  <p className="dash__course-title">{c.title}</p>
                  <Link to={`/courses/${c._id}`} className="btn btn--green btn--sm">{d.startLearning}</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {isActive && courses.length === 0 && (
          <div className="dash__panel">
            <h2>📚 {d.myCoursesTitle}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{d.noCoursesMsg}</p>
          </div>
        )}
      </main>
    </div>
  );
}
