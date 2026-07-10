import { useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getCourse, getCourseProgress, toggleLessonDone } from '../api/courseApi';
import { useLang } from '../context/LangContext';
import CourseReviews from '../components/features/courses/CourseReviews';
import { Skeleton } from '../components/ui/Skeleton';
import { getYouTubeEmbedUrl } from '../utils/courseLessonHelpers';

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

  const [openItem, setOpenItem] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const lessonRefs = useRef({});
  const highlightTimeout = useRef(null);

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

  // First not-yet-completed lesson, in module/lesson order — powers the
  // "Continue learning" jump-to shortcut so returning students don't have to
  // scan a long flat list to find where they left off.
  const nextLesson = lessons.find((l) => !completed.has(lessonKey(l))) ?? null;

  const jumpToLesson = (lessonId) => {
    const el = lessonRefs.current[lessonId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(highlightTimeout.current);
    setHighlightedId(lessonId);
    highlightTimeout.current = setTimeout(() => setHighlightedId(null), 1600);
  };

  const toggleItem = (key, payload) => {
    const done = !completed.has(key);
    toggleMutation.mutate({ key, payload, done });
  };

  const markDone   = cc.markDone   || 'Mark as done';
  const markUndone = cc.markUndone || 'Mark as not done';

  if (isLoading) {
    return (
      <div className="billing-page">
        <main className="container billing-page__main" style={{ maxWidth: 800 }}>
          <div style={{ marginTop: '2rem' }}>
            <Skeleton width="40%" height={28} style={{ marginBottom: 10 }} />
            <Skeleton width="70%" height={16} style={{ marginBottom: 24 }} />
            <Skeleton width="100%" height={8} radius="var(--radius-full)" style={{ marginBottom: 24 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton height={62} radius="var(--radius-md)" />
              <Skeleton height={62} radius="var(--radius-md)" />
              <Skeleton height={62} radius="var(--radius-md)" />
            </div>
          </div>
        </main>
      </div>
    );
  }
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

            {/* Continue learning — jump to the first not-yet-completed lesson,
                so returning students don't have to scan the whole list. */}
            {nextLesson && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                background: 'var(--color-primary-surface)', border: '1px solid var(--color-primary-border)',
                borderRadius: 10, padding: '14px 18px', marginBottom: '1.5rem',
              }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }} aria-hidden="true">{ICONS[nextLesson.type] || '▶'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    Continue learning
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nextLesson.title}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--green btn--sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => jumpToLesson(nextLesson._id)}
                >
                  Jump to lesson →
                </button>
              </div>
            )}

            {/* ── Structured modules → lessons ── */}
            {modules.map((m, mi) => (
              <section key={m._id || mi} style={{ marginBottom: '1.75rem' }}>
                <h3 style={{ margin: '0 0 4px', color: '#0b6e4f' }}>{`${mi + 1}. ${m.title}`}</h3>
                {m.summary && <p style={{ margin: '0 0 10px', color: '#888', fontSize: '.9rem' }}>{m.summary}</p>}
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(m.lessons || []).map((l) => {
                    const isDone = completed.has(lessonKey(l));
                    const isText = l.type === 'text';
                    const isMedia = l.type === 'youtube' || l.type === 'video';
                    const isOpen = openItem === l._id;
                    const embedUrl = isMedia && l.type === 'youtube' ? getYouTubeEmbedUrl(l.url) : null;
                    const isHighlighted = highlightedId === l._id;
                    return (
                      <li
                        key={l._id}
                        id={`lesson-${l._id}`}
                        ref={(el) => { lessonRefs.current[l._id] = el; }}
                        style={{
                          background: isDone ? '#f0f8f4' : '#fff',
                          border: `1px solid ${isHighlighted ? 'var(--color-primary)' : isDone ? '#bfe0cf' : '#e0e8e4'}`,
                          borderRadius: 10, padding: '14px 20px',
                          boxShadow: isHighlighted ? '0 0 0 3px var(--color-primary-surface)' : 'none',
                          transition: 'box-shadow .3s ease, border-color .3s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <CheckBtn isDone={isDone} onClick={() => toggleItem(lessonKey(l), { lessonId: l._id })} markDone={markDone} markUndone={markUndone} />
                          <span style={{ fontSize: '1.3rem' }}>{ICONS[l.type] || '▶'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#5a7a6a' : 'inherit' }}>{l.title}</p>
                            {l.duration && <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#888' }}>{l.duration}</p>}
                          </div>
                          {isText ? (
                            <button className="btn btn--green btn--sm" onClick={() => setOpenItem(isOpen ? null : l._id)}>
                              {isOpen ? (cc.close || 'Close') : (cc.read || 'Read')}
                            </button>
                          ) : isMedia && l.url ? (
                            <button className="btn btn--green btn--sm" onClick={() => setOpenItem(isOpen ? null : l._id)}>
                              {isOpen ? (cc.close || 'Close') : getLabel(l.type)}
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
                        {isMedia && isOpen && (
                          <div style={{ marginTop: 12 }}>
                            {embedUrl ? (
                              <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden' }}>
                                <iframe
                                  src={embedUrl}
                                  title={l.title}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                                />
                              </div>
                            ) : l.type === 'video' ? (
                              <video controls src={l.url} style={{ width: '100%', borderRadius: 8, display: 'block' }}>
                                Your browser doesn&apos;t support embedded video.
                              </video>
                            ) : (
                              <p style={{ margin: 0, fontSize: '.85rem', color: '#888' }}>
                                This video can&apos;t be played inline.
                              </p>
                            )}
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-block', marginTop: 8, fontSize: '.8rem', color: '#0b6e4f', textDecoration: 'underline' }}
                            >
                              Open in new tab ↗
                            </a>
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

        <CourseReviews courseId={id} />
      </main>
    </div>
  );
}