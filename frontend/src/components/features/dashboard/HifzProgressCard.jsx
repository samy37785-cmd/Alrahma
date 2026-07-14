import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ProgressRing from '../../ui/ProgressRing';

export default function HifzProgressCard({ t, firstCourse, firstProgress, overallPct }) {
  const lastReviewedDays = useMemo(() => {
    const dates = firstProgress?.completedAt;
    if (!dates?.length) return null;
    const mostRecent = Math.max(...dates.map((d) => new Date(d).getTime()));
    return Math.floor((Date.now() - mostRecent) / 86400000);
  }, [firstProgress]);

  return (
    <div className="ds-card ds-card--gold-ring">
      <div className="ds-card__hd" style={{ justifyContent: 'center' }}>
        <h2 className="ds-card__title">{t.dashboard.hifzTitle}</h2>
      </div>
      <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <ProgressRing
          value={overallPct}
          size={96}
          stroke={8}
          color="var(--text-accent)"
          trackColor="var(--bg-surface-raised)"
          sublabel={firstCourse.title}
        />
        {lastReviewedDays !== null && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Last reviewed {lastReviewedDays === 0 ? 'today' : `${lastReviewedDays} day${lastReviewedDays === 1 ? '' : 's'} ago`}
          </div>
        )}
        <Link to={`/courses/${firstCourse._id}`} className="btn btn--sm" style={{ marginTop: 8, borderRadius: 8, fontSize: '0.78rem', background: 'none', border: 'none', color: 'var(--text-accent-dark)', fontWeight: 700 }}>
          {t.dashboard.hifzCta}
        </Link>
      </div>
    </div>
  );
}
