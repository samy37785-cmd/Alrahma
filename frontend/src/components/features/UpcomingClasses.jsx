import { useEffect, useState } from 'react';
import { getClasses } from '../../api/client';

// Renders a viewer's upcoming live classes. Times are formatted with the
// browser's LOCAL timezone (toLocaleString with no timeZone arg), so each
// student/parent sees the class in their own time — the server stores UTC.
// `showStudent` adds the child's name (used in the parent portal).
const fmt = (d) =>
  new Date(d).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

export default function UpcomingClasses({ showStudent = false, title = '📅 Upcoming live classes' }) {
  const [classes, setClasses] = useState([]);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    getClasses({ upcoming: 1 })
      .then(setClasses)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || classes.length === 0) return null; // hide the card when empty

  return (
    <section className="admin__panel" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {classes.map((c) => (
          <li key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f7faf8', border: '1px solid #e0e8e4', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{c.title}</p>
              <p style={{ margin: '2px 0 0', fontSize: '.85rem', color: '#666' }}>
                🕒 {fmt(c.startsAt)} · {c.durationMin} min
                {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                {showStudent && c.student?.name ? ` · for ${c.student.name}` : ''}
              </p>
            </div>
            {c.meetingUrl
              ? <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm">Join</a>
              : <span style={{ fontSize: '.8rem', color: '#999' }}>link soon</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
