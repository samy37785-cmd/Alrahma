import { Link } from 'react-router-dom';

const STATS = [
  { icon: '🌍', label: '30+ Countries' },
  { icon: '⭐', label: '5.0 Rating'    },
  { icon: '🎓', label: 'Al-Azhar Certified' },
  { icon: '🕒', label: '24/7 Available' },
];

export default function JoinCTA() {
  return (
    <section className="join-cta">
      <div className="join-cta__ring join-cta__ring--1" />
      <div className="join-cta__ring join-cta__ring--2" />
      <div className="container join-cta__inner">
        <p className="eyebrow" style={{ color: 'var(--gold)' }}>Start Today</p>
        <h2>Join 1,200+ Students Worldwide</h2>
        <p className="join-cta__sub">
          Learn the Quran from the comfort of your home with Al-Azhar certified tutors.
          Flexible schedules, personalised lessons — for every age and level.
        </p>
        <div className="join-cta__stats">
          {STATS.map((s) => (
            <div className="join-cta__stat" key={s.label}>
              <span className="join-cta__stat-icon">{s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <Link to="/enroll" className="btn btn--gold btn--lg">
          Book Your Free Trial →
        </Link>
      </div>
    </section>
  );
}
