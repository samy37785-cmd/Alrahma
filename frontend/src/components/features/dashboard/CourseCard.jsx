import { Link } from 'react-router-dom';
import ProgressRing from '../../ui/ProgressRing';
import WishlistButton from '../../ui/WishlistButton';

export default function CourseCard({ course, progress }) {
  const pct = progress?.percent ?? 0;
  return (
    <Link
      to={`/courses/${course._id}`}
      style={{ textDecoration: 'none' }}
    >
      <div className="ds-card ds-card--hover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--color-primary-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem', flexShrink: 0,
        }}>
          {course.icon || '📘'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {course.title}
          </div>
          <div className="ds-bar" style={{ marginBottom: 4 }}>
            <div className="ds-bar__fill" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {progress ? `${progress.done} / ${progress.total} lessons · ${pct}%` : 'Not started'}
          </div>
        </div>
        <WishlistButton courseId={course._id} />
        <ProgressRing value={pct} size={44} stroke={5} />
      </div>
    </Link>
  );
}
