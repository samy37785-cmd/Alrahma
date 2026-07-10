import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import LiveCounter from './LiveCounter';

const ICONS = ['🌍', '⭐', '🎓', '🎁'];

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
          <p className="join-cta__promise">{jc.promise}</p>
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
          <span aria-hidden="true">🛡️</span>
          <span>14-day money-back guarantee · No credit card required · Cancel anytime</span>
        </div>
      </div>
    </Reveal>
  );
}
