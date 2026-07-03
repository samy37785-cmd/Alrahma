import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getCourse, getCourseProgress, toggleLessonDone } from '../api/courseApi';
import { useLang } from '../context/LangContext';

const ICONS = { youtube: '▶', pdf: '📄', link: '🔗', video: '▶', text: '📖' };
const lessonKey = (l) => `lesson:${l._id}`;

function CheckBtn({ isDone, onClick, markDone, markUndone }) {
  return (
    <button
      onClick={onClick}
      title={isDone ? markUndone : markDone}
      aria-label={isDone ? markUndone : markDone}
      style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', border: `2px solid ${isDone ? '#0b6e4f' : '#c7d4cd'}`, background: isDone ? '#0b6e4f' : '#fff', color: '#fff', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1, display: 'grid', placeItems: 'center' }}
    >
      {isDone ? '✓' : ''}
    </button>
  );
}

export default function CourseContent() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const { t }        = useLang();
  const cc           = t.courseContent;
  const queryClient  = useQueryClient();

  const [openText, setOpenText] = useState(null);

  // No local "redirect if not logged in" effect here — this route is always
  // wrapped in <ProtectedRoute> (App.jsx), which already owns that decision
  // and (unlike a local check) correctly waits for server confirmation when
  // there's no cached profile instead of assuming !user means logged out.
  const { data: course, isLoading, isError } = useQuery({
    queryKey: ['courses', 'detail', id],
    queryFn:  () => getCourse(id),
    enabled:  Boolean(user),
    staleTime: 1000 * 60 * 5,
    retry:    false,
  });

  const { data: progressData } = useQuery({
    queryKey: ['courses', 'progress', id],
    queryFn:  () => getCourseProgress(id),
    enabled:  Boolean(user) && Boolean(course) && !course.locked,
    staleTime: 0,
  });

  // Memoize the Set so it's only recreated when progressData changes,
  // not on every render triggered by openText or other local state.
  const completed = useMemo(() => new Set(progressData?.completed || []), [progressData]);

  const toggleMutation = useMutation({
    mutationFn: ({ payload, done }) => toggleLessonDone(id, { ...payload, done }),
    onMutate: async ({ key, done }) => {
      await queryClient.cancelQueries({ queryKey: ['courses', 'progress', id] });
      const previous = queryClient.getQueryData(['courses', 'progress', id]);
      queryClient.setQueryData(['courses', 'progress', id], (old) => {
        const next = new Set(old?.completed || []);
        if (done) next.add(key); else next.delete(key);
        return { ...(old ?? {}), completed: [...next] };
      });
      return { previous };
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['courses', 'progress', id], (old) => ({
        ...(old ?? {}),
        completed: res.completed || [],
      }));
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['courses', 'progress', id], ctx.previous);
      }
    },
  });

  // Trust the server's `locked` flag (it re-checks subscription + expiry) rather
  // than the cached user, which can be stale.
  const isActive = course ? !course.locked : false;
  const modules  = course?.modules || [];

  const lessons   = modules.flatMap((m) => m.lessons || []);
  const total     = lessons.length + (course?.resources?.length || 0);
  const doneCount =
    lessons.filter((l) => completed.has(lessonKey(l))).length +
    (course?.resources?.filter((r) => completed.has(r.url)).length || 0);
  const percent   = total ? Math.round((doneCount / total) * 100) : 0;

  const toggleItem = (key, payload) => {
    const done = !completed.has(key);
    toggleMutation.mutate({ key, payload, done });
  };

  const markDone   = cc.markDone   || 'Mark as done';
  const markUndone = cc.markUndone || 'Mark as not done';

  if (isLoading) return <div className="auth"><div className="auth__card"><p>{cc.loading}</p></div></div>;
  if (isError || !course) return <div className="auth"><div className="auth__card"><p className="auth__error">{cc.notFound}</p><Link to="/">← {cc.myAccount}</Link></div></div>;

  const getLabel = (type) => {
    if (type === 'youtube' || type === 'video') return cc.watch;
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
        ) : total > 0 ? (
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

            {/* ── Structured modules → lessons ── */}
            {modules.map((m, mi) => (
              <section key={m._id || mi} style={{ marginBottom: '1.75rem' }}>
                <h3 style={{ margin: '0 0 4px', color: '#0b6e4f' }}>{`${mi + 1}. ${m.title}`}</h3>
                {m.summary && <p style={{ margin: '0 0 10px', color: '#888', fontSize: '.9rem' }}>{m.summary}</p>}
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(m.lessons || []).map((l) => {
                    const isDone = completed.has(lessonKey(l));
                    const isText = l.type === 'text';
                    const isOpen = openText === l._id;
                    return (
                      <li key={l._id} style={{ background: isDone ? '#f0f8f4' : '#fff', border: `1px solid ${isDone ? '#bfe0cf' : '#e0e8e4'}`, borderRadius: 10, padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <CheckBtn isDone={isDone} onClick={() => toggleItem(lessonKey(l), { lessonId: l._id })} markDone={markDone} markUndone={markUndone} />
                          <span style={{ fontSize: '1.3rem' }}>{ICONS[l.type] || '▶'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#5a7a6a' : 'inherit' }}>{l.title}</p>
                            {l.duration && <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#888' }}>{l.duration}</p>}
                          </div>
                          {isText ? (
                            <button className="btn btn--green btn--sm" onClick={() => setOpenText(isOpen ? null : l._id)}>
                              {isOpen ? (cc.close || 'Close') : (cc.read || 'Read')}
                            </button>
                          ) : l.url ? (
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm">{getLabel(l.type)}</a>
                          ) : null}
                        </div>
                        {isText && isOpen && (
                          <div style={{ marginTop: 12, padding: '12px 14px', background: '#f7faf8', borderRadius: 8, whiteSpace: 'pre-wrap', color: '#333', fontSize: '.95rem', lineHeight: 1.7 }}>
                            {l.content}
                          </div>
                        )}
                        {(l.resources?.length > 0) && (
                          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {l.resources.map((r, ri) => (
                              <a key={ri} href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.82rem', color: '#0b6e4f', textDecoration: 'underline' }}>
                                {ICONS[r.type] || '🔗'} {r.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {/* ── Legacy flat resources (kept for older courses) ── */}
            {course.resources?.length > 0 && (
              <section>
                {modules.length > 0 && <h3 style={{ margin: '0 0 10px', color: '#0b6e4f' }}>{cc.materials}</h3>}
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {course.resources.map((r, i) => {
                    const isDone = completed.has(r.url);
                    return (
                      <li key={i} style={{ background: isDone ? '#f0f8f4' : '#fff', border: `1px solid ${isDone ? '#bfe0cf' : '#e0e8e4'}`, borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <CheckBtn isDone={isDone} onClick={() => toggleItem(r.url, { url: r.url })} markDone={markDone} markUndone={markUndone} />
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
              </section>
            )}
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