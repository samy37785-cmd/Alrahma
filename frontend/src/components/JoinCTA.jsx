import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import LiveCounter from './LiveCounter';

/* Inline SVG icons — same Lucide-style used across the homepage, replacing
   raw emoji so the stats row matches the rest of the icon language. */
const ICONS = [
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>,
  <svg key="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7-5.4-4.7 7.1-.6L12 2z"/>
  </svg>,
  <svg key="grad" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>,
  <svg key="gift" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>,
];

/* Mosque dome — same mark as Courses' Islamic Studies icon, replacing the
   raw 🕌 emoji baked into the `promise` translation string. */
const MOSQUE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v2" />
    <path d="M8 14c0-4.5 1.8-7 4-7s4 2.5 4 7Z" />
    <rect x="8" y="13" width="8" height="2.5" rx=".5" />
    <rect x="4" y="16.5" width="16" height="2.5" rx=".5" />
  </svg>
);

export default function JoinCTA({ onTrialClick }) {
  const { t } = useLang();
  const jc = t.joinCta;

  return (
    <Reveal as="section" className="join-cta">
      {/* Decorative rings */}
      <div className="join-cta__ring join-cta__ring--1" />
      <div className="join-cta__ring join-cta__ring--2" />

      {/* Aurora light orbs */}
      <div className="join-cta__aurora join-cta__aurora--1" aria-hidden="true" />
      <div className="join-cta__aurora join-cta__aurora--2" aria-hidden="true" />

      <div className="container join-cta__inner">
        <p className="eyebrow" style={{ color: 'var(--gold)' }}>{jc.eyebrow}</p>
        <h2>{jc.heading}</h2>
        <p className="join-cta__sub">{jc.sub}</p>

        {jc.promise && (
          <p className="join-cta__promise">
            <span aria-hidden="true" className="join-cta__promise-icon">{MOSQUE_ICON}</span>
            {jc.promise.replace(/^🕌\s*/, '')}
          </p>
        )}

        <div className="join-cta__stats">
          {jc.stats.map((label, i) => (
            <div className="join-cta__stat" key={i}>
              <span className="join-cta__stat-icon" aria-hidden="true">{ICONS[i]}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Primary CTA — opens the quick modal */}
        <button
          type="button"
          className="btn btn--gold btn--lg join-cta__btn"
          onClick={onTrialClick}
        >
          {jc.cta}
        </button>

        {/* Secondary CTA */}
        <Link to="/courses" className="join-cta__secondary">
          Browse courses first →
        </Link>

        {/* Live activity */}
        <div className="join-cta__live">
          <LiveCounter />
        </div>

        {/* Risk reversal */}
        <div className="join-cta__guarantee">
          <span aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </span>
          <span>14-day money-back guarantee · No credit card required · Cancel anytime</span>
        </div>
      </div>
    </Reveal>
  );
}
