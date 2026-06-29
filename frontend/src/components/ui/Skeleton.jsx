/**
 * Skeleton loaders — shape-accurate loading placeholders.
 *
 * <Skeleton width="100%" height={20} />          basic line
 * <Skeleton.Text lines={3} />                     paragraph block
 * <Skeleton.Card />                               generic card
 * <Skeleton.Avatar size="md" />                   circular avatar
 * <Skeleton.Table rows={5} cols={4} />            data table
 * <Skeleton.Stat />                               KPI stat card
 */

/* ── Base Skeleton ── */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)',
  className = '',
  style = {},
  ...props
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

/* ── Text block ── */
Skeleton.Text = function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`skeleton-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? '72%' : '100%'}
          style={{ marginBottom: i < lines - 1 ? 8 : 0 }}
        />
      ))}
    </div>
  );
};

/* ── Avatar circle ── */
Skeleton.Avatar = function SkeletonAvatar({ size = 'md' }) {
  const sizes = { xs: 24, sm: 32, md: 40, lg: 48, xl: 56, '2xl': 72 };
  const px = typeof size === 'number' ? size : (sizes[size] || 40);
  return <Skeleton width={px} height={px} radius="50%" />;
};

/* ── Generic card ── */
Skeleton.Card = function SkeletonCard({ className = '' }) {
  return (
    <div className={`card skeleton-card ${className}`} aria-hidden="true">
      <div className="skeleton-card__header">
        <Skeleton.Avatar size="md" />
        <div style={{ flex: 1 }}>
          <Skeleton height={14} width="60%" style={{ marginBottom: 6 }} />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <Skeleton.Text lines={3} />
      <div className="skeleton-card__footer">
        <Skeleton height={36} width={100} radius="var(--radius-full)" />
        <Skeleton height={36} width={80} radius="var(--radius-full)" />
      </div>
    </div>
  );
};

/* ── KPI stat card ── */
Skeleton.Stat = function SkeletonStat({ className = '' }) {
  return (
    <div className={`card ${className}`} aria-hidden="true" style={{ padding: 'var(--space-5)' }}>
      <Skeleton height={12} width="50%" style={{ marginBottom: 12 }} />
      <Skeleton height={32} width="70%" style={{ marginBottom: 8 }} />
      <Skeleton height={12} width="40%" />
    </div>
  );
};

/* ── Table ── */
Skeleton.Table = function SkeletonTable({ rows = 5, cols = 4, className = '' }) {
  return (
    <div className={`table-wrap ${className}`} aria-hidden="true">
      <div className="skeleton-table__header">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} height={12} width={`${60 + (i % 3) * 20}%`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-table__row">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={14} width={`${50 + (c % 4) * 12}%`} />
          ))}
        </div>
      ))}
    </div>
  );
};

/* ── Dashboard welcome bar ── */
Skeleton.Welcome = function SkeletonWelcome() {
  return (
    <div aria-hidden="true" style={{ padding: 'var(--space-8) 0' }}>
      <Skeleton height={28} width="220px" style={{ marginBottom: 12 }} />
      <Skeleton height={16} width="360px" style={{ marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[0,1,2,3].map(i => <Skeleton.Stat key={i} />)}
      </div>
    </div>
  );
};

/* ── Dashboard Shell skeletons (use ds- CSS classes) ── */
export function SkeletonStatCard() {
  return (
    <div className="ds-skel-stat">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="ds-skel" style={{ width: 38, height: 38, borderRadius: 10, display: 'block' }} />
        <span className="ds-skel" style={{ width: 52, height: 20, borderRadius: 99, display: 'block' }} />
      </div>
      <span className="ds-skel" style={{ width: 80, height: 28, borderRadius: 6, marginBottom: 6, display: 'block' }} />
      <span className="ds-skel" style={{ width: 110, height: 12, borderRadius: 4, display: 'block' }} />
    </div>
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="ds-skel-card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span className="ds-skel" style={{ width: 20, height: 20, borderRadius: 4, display: 'block', flexShrink: 0 }} />
        <span className="ds-skel" style={{ width: 120, height: 16, borderRadius: 4, display: 'block' }} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="ds-skel"
          style={{ display: 'block', height: 14, borderRadius: 4, width: i === rows - 1 ? '65%' : '100%', marginBottom: 6 }}
        />
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span className="ds-skel" style={{ display: 'block', width: 120, height: 12, borderRadius: 4, marginBottom: 8 }} />
        <span className="ds-skel" style={{ display: 'block', width: 260, height: 28, borderRadius: 6, marginBottom: 6 }} />
        <span className="ds-skel" style={{ display: 'block', width: 340, height: 14, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 14 }}>
        {[1,2,3,4].map((k) => <SkeletonStatCard key={k} />)}
      </div>
      <div className="ds-grid ds-grid-main-side">
        <SkeletonCard rows={6} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
