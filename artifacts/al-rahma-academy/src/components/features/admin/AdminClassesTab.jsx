import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Trash2, X, Video } from 'lucide-react';
import { getClasses, createClass, deleteClass } from '../../../api/classApi';

const EMPTY = { student: '', title: '', startsAt: '', durationMin: 30, meetingUrl: '' };

const fmt = (d) =>
  new Date(d).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

const statusBadge = (status) => {
  if (status === 'cancelled') return 'ds-badge ds-badge--red';
  if (status === 'completed') return 'ds-badge ds-badge--green';
  return 'ds-badge ds-badge--blue';
};

export default function AdminClassesTab({ users = [], onError }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState('upcoming');

  const students = users.filter((u) => u.role === 'student');

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['admin', 'classes', filter],
    queryFn: () => getClasses(filter === 'upcoming' ? { upcoming: 1 } : {}),
    staleTime: 60000,
  });

  const createMut = useMutation({
    mutationFn: createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'classes'] });
      setForm(EMPTY);
      setShowForm(false);
    },
    onError: (err) => onError(err.response?.data?.message || 'Could not schedule class'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'classes'] }),
    onError: (err) => onError(err.response?.data?.message || 'Could not delete class'),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.student || !form.title.trim() || !form.startsAt) {
      onError('Please fill in student, title and date.');
      return;
    }
    createMut.mutate({
      student:     form.student,
      title:       form.title.trim(),
      startsAt:    new Date(form.startsAt).toISOString(),
      durationMin: Number(form.durationMin) || 30,
      meetingUrl:  form.meetingUrl,
    });
  };

  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Live Classes ({classes.length})</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-page)', color: 'var(--text-primary)',
            }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="all">All time</option>
          </select>
          <button
            className="btn btn--green btn--sm"
            onClick={() => setShowForm((v) => !v)}
            style={{ borderRadius: 7, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <CalendarDays size={13} aria-hidden="true" /> Schedule Class
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--bg-page)', border: '1px solid var(--border-default)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Video size={14} aria-hidden="true" /> Schedule a Live Class
            </strong>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
              aria-label="Close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Student</label>
                <select value={form.student} onChange={set('student')}>
                  <option value="">— Select student —</option>
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Class title</label>
                <input value={form.title} onChange={set('title')} placeholder="Tajweed lesson" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Date &amp; time</label>
                <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Duration (min)</label>
                <input type="number" min="5" max="240" value={form.durationMin} onChange={set('durationMin')} />
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Meeting link</label>
              <input
                value={form.meetingUrl}
                onChange={set('meetingUrl')}
                placeholder="https://meet.google.com/…"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="btn btn--green"
                disabled={createMut.isPending}
                style={{ borderRadius: 7, fontSize: '0.855rem', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {createMut.isPending ? '…' : <><CalendarDays size={13} aria-hidden="true" /> Schedule</>}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowForm(false)}
                style={{ borderRadius: 7, fontSize: '0.855rem' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Student</th>
              <th>Teacher</th>
              <th>Date &amp; time</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Join</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan="8" className="admin__empty">Loading…</td></tr>
            )}
            {!isLoading && classes.length === 0 && (
              <tr><td colSpan="8" className="admin__empty">No classes found.</td></tr>
            )}
            {classes.map((c) => (
              <tr key={c._id}>
                <td style={{ fontWeight: 600 }}>{c.title}</td>
                <td>{c.student?.name || '—'}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{c.teacher?.name || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmt(c.startsAt)}</td>
                <td>{c.durationMin} min</td>
                <td><span className={statusBadge(c.status)}>{c.status}</span></td>
                <td>
                  {c.meetingUrl
                    ? (
                      <a
                        href={c.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--green btn--sm"
                        style={{ borderRadius: 6, fontSize: '0.72rem' }}
                      >
                        Join
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>—</span>
                    )}
                </td>
                <td>
                  <button
                    className="btn btn--ghost btn--sm"
                    title="Delete class"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(c._id)}
                    style={{ borderRadius: 6, color: 'var(--color-danger-text)', padding: '4px 7px' }}
                    aria-label={`Delete ${c.title}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
