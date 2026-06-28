import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { getCourseProgress, toggleLessonDone } from '../api/client';
import { useLang } from '../context/LangContext';

const ICONS = { youtube: '▶', pdf: '📄', link: '🔗' };

export default function CourseContent() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const { t }        = useLang();
  const cc           = t.courseContent;
  const [course, setCourse]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [completed, setCompleted] = useState(new Set()); // resource urls done

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.get(`/courses/${id}`)
      .then((r) => {
        setCourse(r.data);
        if (!r.data.locked) {
          getCourseProgress(id)
            .then((p) => setCompleted(new Set(p.completed || [])))
            .catch(() => {});
        }
      })
      .catch(() => setError(cc.notFound))
      .finally(() => setLoading(false));
  }, [id, user, navigate, cc]);

  // Trust the server's `locked` flag (it re-checks subscription + expiry) rather
  // than the cached localStorage user, which can be stale.
  const isActive = course ? !course.locked : false;

  const toggleDone = async (url) => {
    const done = !completed.has(url);
    // Optimistic update
    setCompleted((prev) => {
      const next = new Set(prev);
      if (done) next.add(url); else next.delete(url);
      return next;
    });
    try {
      const res = await toggleLessonDone(id, { url, done });
      setCompleted(new Set(res.completed || []));
    } catch {
      // Revert on failure
      setCompleted((prev) => {
        const next = new Set(prev);
        if (done) next.delete(url); else next.add(url);
        return next;
      });
    }
  };

  const total      = course?.resources?.length || 0;
  const doneCount  = course?.resources?.filter((r) => completed.has(r.url)).length || 0;
  const percent    = total ? Math.round((doneCount / total) * 100) : 0;

  if (loading) return <div className="auth"><div className="auth__card"><p>{cc.loading}</p></div></div>;
  if (error)   return <div className="auth"><div className="auth__card"><p className="auth__error">{error}</p><Link to="/">← {cc.myAccount}</Link></div></div>;

  const getLabel = (type) => {
    if (type === 'youtube') return cc.watch;
    if (type === 'pdf')     return cc.download;
    return cc.open;
  };

  return (
    <div className="billing-page">
      <header className="billing-page__bar">
        <div className="container billing-page__bar-inner">
          <strong>{course.icon} {course.title}</strong>
          <Link to="/profile" className="btn btn--ghost btn--sm">{cc.myAccount}</Link>
        </div>
      </header>

      <main className="container billing-page__main" style={{ maxWidth: 800 }}>
        <div className="billing-page__head">
          <p style={{ color: '#888', fontSize: '.9rem', marginBottom: '4px' }}>{course.level}</p>
          <h1>{course.icon} {course.title}</h1>
          <p className="section-sub">{course.description}</p>
        </div>

        {!isActive ? (
          <div style={{ background: '#fff8e7', border: '1px solid #f0c040', borderRadius: 10, padding: '20px 24px', marginTop: '2rem' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{cc.needSub}</p>
            <Link to="/#pricing" className="btn btn--green btn--sm" style={{ marginTop: '12px', display: 'inline-block' }}>{cc.viewPlans}</Link>
          </div>
        ) : course.resources?.length > 0 ? (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0 }}>{cc.materials}</h2>
              <span style={{ fontSize: '.9rem', fontWeight: 600, color: percent === 100 ? '#0b6e4f' : '#666' }}>
                {percent === 100 ? '🎉 ' : ''}{doneCount}/{total} · {percent}%
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ height: 8, background: '#e6efe9', borderRadius: 99, overflow: 'hidden', marginBottom: '1.5rem' }}>
              <div style={{ width: `${percent}%`, height: '100%', background: '#0b6e4f', transition: 'width .3s' }} />
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {course.resources.map((r, i) => {
                const isDone = completed.has(r.url);
                return (
                  <li key={i} style={{ background: isDone ? '#f0f8f4' : '#fff', border: `1px solid ${isDone ? '#bfe0cf' : '#e0e8e4'}`, borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                      onClick={() => toggleDone(r.url)}
                      title={isDone ? cc.markUndone || 'Mark as not done' : cc.markDone || 'Mark as done'}
                      aria-label={isDone ? cc.markUndone || 'Mark as not done' : cc.markDone || 'Mark as done'}
                      style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', border: `2px solid ${isDone ? '#0b6e4f' : '#c7d4cd'}`, background: isDone ? '#0b6e4f' : '#fff', color: '#fff', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1, display: 'grid', placeItems: 'center' }}
                    >
                      {isDone ? '✓' : ''}
                    </button>
                    <span style={{ fontSize: '1.4rem' }}>{ICONS[r.type] || '🔗'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#5a7a6a' : 'inherit' }}>{r.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#888', textTransform: 'capitalize' }}>{r.type}</p>
                    </div>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm">
                      {getLabel(r.type)}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div style={{ marginTop: '2rem', background: '#f4f7f4', borderRadius: 10, padding: '24px', textAlign: 'center' }}>
            <p style={{ color: '#888', margin: 0 }}>{cc.noMaterials}</p>
          </div>
        )}
      </main>
    </div>
  );
}
