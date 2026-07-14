import { useState } from 'react';
import { formatDayMonth as fmtDate, formatTime as fmtTime, minutesUntil } from '../../../utils/date';

// Detects if the meetingUrl is a Daily.co room (daily.co/<room> or custom domain).
function isDailyUrl(url) {
  return /daily\.co\//i.test(url);
}

function EmbeddedJoinBtn({ meetingUrl, title }) {
  const [open, setOpen] = useState(false);
  if (!isDailyUrl(meetingUrl)) {
    return (
      <a
        href={meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn--green btn--sm"
        style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        Join Now
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn btn--green btn--sm"
        style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6 }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        Join Now
      </button>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1300,
            background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Live class: ${title}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#0b6e4f', color: '#fff' }}>
            <span style={{ fontWeight: 700 }}>📹 {title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', padding: 4 }}
              aria-label="Leave class"
            >
              ✕ Leave
            </button>
          </div>
          <iframe
            src={meetingUrl}
            allow="camera; microphone; fullscreen; speaker; display-capture"
            style={{ flex: 1, border: 'none', width: '100%' }}
            title={title}
          />
        </div>
      )}
    </>
  );
}

export default function UpcomingClassCard({ cls }) {
  const mins  = minutesUntil(cls.startsAt);
  const isNow = mins <= 15;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: isNow ? 'var(--color-success-surface)' : 'var(--bg-page)',
      border: `1px solid ${isNow ? 'var(--color-success-border)' : 'var(--border-default)'}`,
      borderRadius: 10,
    }}>
      <div className="ds-date-badge" style={{
        background: isNow ? 'var(--color-success-surface)' : 'var(--color-primary-surface)',
        color: isNow ? 'var(--color-success-text)' : 'var(--color-primary)',
      }}>
        <span className="ds-date-badge__month">{new Date(cls.startsAt).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span>
        <span className="ds-date-badge__day">{new Date(cls.startsAt).getDate()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.855rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cls.title}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          {fmtDate(cls.startsAt)} · {fmtTime(cls.startsAt)} · {cls.durationMin} min
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {isNow ? (
          <span className="ds-badge ds-badge--green">Now</span>
        ) : (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            in {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`}
          </span>
        )}
        {cls.meetingUrl && (
          isNow
            ? <EmbeddedJoinBtn meetingUrl={cls.meetingUrl} title={cls.title} />
            : (
              <a
                href={cls.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--green btn--sm"
                style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                Join
              </a>
            )
        )}
      </div>
    </div>
  );
}
