import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const ICONS = { youtube: '▶', pdf: '📄', link: '🔗' };

export default function CourseContent() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const [course, setCourse]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.get(`/courses/${id}`)
      .then((r) => setCourse(r.data))
      .catch(() => setError('Course not found.'))
      .finally(() => setLoading(false));
  }, [id, user, navigate]);

  const isActive = user?.subscription?.status === 'active';

  if (loading) return <div className="auth"><div className="auth__card"><p>Loading…</p></div></div>;
  if (error)   return <div className="auth"><div className="auth__card"><p className="auth__error">{error}</p><Link to="/">← Back</Link></div></div>;

  return (
    <div className="billing-page">
      <header className="billing-page__bar">
        <div className="container billing-page__bar-inner">
          <strong>{course.icon} {course.title}</strong>
          <Link to="/profile" className="btn btn--ghost btn--sm">← My Account</Link>
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
            <p style={{ margin: 0, fontWeight: 600 }}>You need an active subscription to access course materials.</p>
            <Link to="/#pricing" className="btn btn--green btn--sm" style={{ marginTop: '12px', display: 'inline-block' }}>View Plans</Link>
          </div>
        ) : course.resources?.length > 0 ? (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Course Materials</h2>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {course.resources.map((r, i) => (
                <li key={i} style={{ background: '#fff', border: '1px solid #e0e8e4', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '1.4rem' }}>{ICONS[r.type] || '🔗'}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{r.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#888', textTransform: 'capitalize' }}>{r.type}</p>
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm">
                    {r.type === 'youtube' ? 'Watch' : r.type === 'pdf' ? 'Download' : 'Open'}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div style={{ marginTop: '2rem', background: '#f4f7f4', borderRadius: 10, padding: '24px', textAlign: 'center' }}>
            <p style={{ color: '#888', margin: 0 }}>No materials uploaded yet for this course. Check back soon!</p>
          </div>
        )}
      </main>
    </div>
  );
}
