/**
 * EmptyState — zero-state screens with illustration, heading, and CTAs.
 *
 * <EmptyState
 *   type="no-courses"
 *   title="No courses yet"
 *   description="Enroll in a course to get started."
 *   action={{ label: 'Browse Courses', href: '/courses' }}
 * />
 */

import { Link } from 'react-router-dom';

/* ── Illustrations (inline SVG, no external dependency) ── */
const ILLUSTRATIONS = {
  'no-courses': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="20" width="88" height="60" rx="8" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <rect x="28" y="32" width="40" height="5" rx="2.5" fill="var(--color-primary)"/>
      <rect x="28" y="42" width="64" height="4" rx="2" fill="var(--border-default)"/>
      <rect x="28" y="50" width="56" height="4" rx="2" fill="var(--border-default)"/>
      <rect x="28" y="58" width="48" height="4" rx="2" fill="var(--border-default)"/>
      <circle cx="88" cy="28" r="16" fill="var(--color-accent-surface)" stroke="var(--color-accent)" strokeWidth="2"/>
      <path d="M84 28l3 3 5-6" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'no-messages': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="16" width="96" height="64" rx="10" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <path d="M12 30l48 30 48-30" stroke="var(--color-primary)" strokeWidth="2"/>
      <rect x="36" y="56" width="24" height="5" rx="2.5" fill="var(--border-default)"/>
      <rect x="36" y="65" width="48" height="4" rx="2" fill="var(--border-default)"/>
    </svg>
  ),
  'no-payments': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="28" width="88" height="52" rx="8" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <rect x="16" y="38" width="88" height="10" fill="var(--color-primary)"/>
      <rect x="26" y="58" width="24" height="8" rx="4" fill="var(--border-default)"/>
      <rect x="58" y="58" width="16" height="8" rx="4" fill="var(--border-default)"/>
      <circle cx="95" cy="24" r="14" fill="var(--color-accent-surface)" stroke="var(--color-accent)" strokeWidth="2"/>
      <path d="M95 18v6m0 6v2" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'no-results': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="52" cy="44" r="28" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <path d="M72 64l18 18" stroke="var(--text-secondary)" strokeWidth="4" strokeLinecap="round"/>
      <path d="M44 40h16M52 32v16" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'no-notifications': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M60 20c-15 0-26 11-26 26v8L24 68h72l-10-14v-8C86 31 75 20 60 20z" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <path d="M54 68c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="var(--color-primary)" strokeWidth="2"/>
      <circle cx="60" cy="20" r="5" fill="var(--color-accent)" stroke="var(--color-accent-surface)" strokeWidth="2"/>
    </svg>
  ),
  'no-data': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="60" width="72" height="12" rx="4" fill="var(--color-primary-surface)" stroke="var(--color-primary-border)" strokeWidth="2"/>
      <rect x="32" y="46" width="56" height="12" rx="4" fill="var(--border-default)"/>
      <rect x="40" y="32" width="40" height="12" rx="4" fill="var(--border-default)"/>
      <rect x="48" y="20" width="24" height="10" rx="4" fill="var(--border-subtle)"/>
    </svg>
  ),
  'no-internet': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="48" r="32" fill="var(--color-danger-surface)" stroke="var(--color-danger-border)" strokeWidth="2"/>
      <path d="M40 60c5.5-8 14.5-14 20-14s14.5 6 20 14" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round"/>
      <path d="M46 48c4-6 8.5-10 14-10s10 4 14 10" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="60" cy="40" r="4" fill="var(--color-danger)"/>
      <path d="M36 30l48 36" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  'error': (
    <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="48" r="32" fill="var(--color-danger-surface)" stroke="var(--color-danger-border)" strokeWidth="2"/>
      <path d="M60 32v20M60 58v4" stroke="var(--color-danger)" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  ),
};

export function EmptyState({
  type = 'no-data',
  illustration,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className = '',
}) {
  const visual = illustration || ILLUSTRATIONS[type] || ILLUSTRATIONS['no-data'];

  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''} ${className}`} role="status">
      {visual && (
        <div className="empty-state__illustration" aria-hidden="true">
          {visual}
        </div>
      )}
      {title && <h3 className="empty-state__title">{title}</h3>}
      {description && <p className="empty-state__desc">{description}</p>}
      {(action || secondaryAction) && (
        <div className="empty-state__actions">
          {action && <ActionBtn {...action} primary />}
          {secondaryAction && <ActionBtn {...secondaryAction} />}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, href, onClick, primary }) {
  const cls = `btn ${primary ? 'btn--primary' : 'btn--secondary'} btn--sm`;
  if (href) return <Link to={href} className={cls}>{label}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{label}</button>;
}

export default EmptyState;
