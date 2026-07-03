import { useQuery } from '@tanstack/react-query';
import { getClasses } from '../../api/classApi';
import { useLang } from '../../context/LangContext';

// Times formatted in the browser's LOCAL timezone so each student sees their
// own wall-clock time. The server stores UTC.
const fmt = (d) =>
  new Date(d).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

const UPCOMING_KEY = ['classes', 'upcoming'];

export default function UpcomingClasses({ showStudent = false, title }) {
  const { t } = useLang();
  const d = t.dashboard;

  const { data: classes = [], isLoading } = useQuery({
    queryKey: UPCOMING_KEY,
    queryFn:  () => getClasses({ upcoming: 1 }),
    staleTime: 1000 * 60 * 2, // 2 min — classes are time-sensitive
    retry: false,
  });

  if (isLoading || classes.length === 0) return null;

  return (
    <section className="admin__panel" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>{title ?? d.upcomingClasses}</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {classes.map((c) => (
          <li key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f7faf8', border: '1px solid #e0e8e4', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{c.title}</p>
              <p style={{ margin: '2px 0 0', fontSize: '.85rem', color: '#666' }}>
                🕒 {fmt(c.startsAt)} · {c.durationMin} min
                {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                {showStudent && c.student?.name ? ` · ${d.forStudent} ${c.student.name}` : ''}
              </p>
            </div>
            {c.meetingUrl
              ? <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn--green btn--sm">{d.joinBtn}</a>
              : <span style={{ fontSize: '.8rem', color: '#999' }}>{d.linkSoon}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
