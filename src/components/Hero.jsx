import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';

export default function Hero() {
  const { t } = useLang();
  const h = t.hero;

  return (
    <section className="hero">
      <div className="hero__orb hero__orb--1" aria-hidden="true" />
      <div className="hero__orb hero__orb--2" aria-hidden="true" />

      <div className="container hero__inner">

        {/* ── Left: Text ── */}
        <div className="hero__text">
          <p className="hero__eyebrow">
            <span className="hero__eyebrow-dot" />
            {h.eyebrow}
          </p>

          <h1>
            {h.title.split(' ').map((word, i) =>
              word.toLowerCase() === 'quran' || word === 'Quran' || word === 'Corano' || word === 'Coran' || word === 'القرآن' || word === 'Corán' || word === 'Koran'
                ? <span key={i} className="hero__highlight">{word} </span>
                : <span key={i}>{word} </span>
            )}
          </h1>

          <p className="hero__sub">{h.sub}</p>

          <div className="hero__actions">
            <Link to="/enroll" className="btn btn--gold btn--lg">{h.cta1}</Link>
            <a href="#courses" className="btn btn--ghost-white">{h.cta3}</a>
          </div>

          <ul className="hero__badges">
            <li><span className="hero__badge-check">✓</span>{h.badge1}</li>
            <li><span className="hero__badge-check">✓</span>{h.badge2}</li>
            <li><span className="hero__badge-check">✓</span>{h.badge3}</li>
          </ul>
        </div>

        {/* ── Right: Visual ── */}
        <div className="hero__visual" aria-hidden="true">

          {/* Central circle */}
          <div className="hero__circle">
            <div className="hero__ring hero__ring--1" />
            <div className="hero__ring hero__ring--2" />
            <div className="hero__circle-inner">
              <span className="hero__arabic-big">ٱقْرَأْ</span>
              <span className="hero__arabic-tr">Read</span>
            </div>
          </div>

          {/* Floating pill — rating */}
          <div className="hero__pill hero__pill--top">
            <span className="hero__pill-icon">⭐</span>
            <div>
              <strong>4.9 / 5</strong>
              <span>1,200+ students</span>
            </div>
          </div>

          {/* Floating pill — certification */}
          <div className="hero__pill hero__pill--bottom">
            <span className="hero__pill-icon">🎓</span>
            <div>
              <strong>Al-Azhar</strong>
              <span>Certified tutors</span>
            </div>
          </div>

          {/* Verse card */}
          <div className="hero__verse">
            <p>{h.verseQuote}</p>
            <small>{h.verseRef}</small>
          </div>

        </div>
      </div>

      {/* Bottom wave */}
      <div className="hero__wave" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#ffffff"/>
        </svg>
      </div>
    </section>
  );
}
