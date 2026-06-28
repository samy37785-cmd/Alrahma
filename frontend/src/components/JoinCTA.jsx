import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';

const ICONS = ['🌍', '⭐', '🎓', '🕒'];

export default function JoinCTA() {
  const { t } = useLang();
  const jc = t.joinCta;

  return (
    <section className="join-cta">
      <div className="join-cta__ring join-cta__ring--1" />
      <div className="join-cta__ring join-cta__ring--2" />
      <div className="container join-cta__inner">
        <p className="eyebrow" style={{ color: 'var(--gold)' }}>{jc.eyebrow}</p>
        <h2>{jc.heading}</h2>
        <p className="join-cta__sub">{jc.sub}</p>
        <div className="join-cta__stats">
          {jc.stats.map((label, i) => (
            <div className="join-cta__stat" key={i}>
              <span className="join-cta__stat-icon">{ICONS[i]}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <Link to="/enroll" className="btn btn--gold btn--lg">
          {jc.cta}
        </Link>
      </div>
    </section>
  );
}
