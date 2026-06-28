export default function ProgressRing({
  value = 0,
  max = 100,
  size = 88,
  stroke = 8,
  color = 'var(--color-primary)',
  trackColor = 'var(--bg-surface-raised)',
  label,
  sublabel,
  className = '',
}) {
  const pct    = Math.min(Math.max(value / max, 0), 1);
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className={`ds-ring-wrap ${className}`}>
      <div className="ds-ring" style={{ width: size, height: size }}>
        <svg className="ds-ring__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            className="ds-ring__track"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke={trackColor}
          />
          <circle
            className="ds-ring__fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="ds-ring__label">
          <span className={`ds-ring__pct${size < 70 ? ' ds-ring__pct--sm' : ''}`}>
            {Math.round(pct * 100)}%
          </span>
          {sublabel && <span className="ds-ring__sub">{sublabel}</span>}
        </div>
      </div>
      {label && <span className="ds-ring__name">{label}</span>}
    </div>
  );
}
