import Reveal from '../../ui/Reveal';
import { features } from '../../../data';
import { useLang } from '../../../context/LangContext';

const GRADS = [
  'linear-gradient(135deg,#d4af37,#f0c040)',  /* gold  — Free Trial */
  'linear-gradient(135deg,#0b6e4f,#1a9e72)',  /* green — Al-Azhar  */
  'linear-gradient(135deg,#1a5fa0,#2176c7)',  /* blue  — Schedule  */
  'linear-gradient(135deg,#7a3a8a,#a04dba)',  /* purple— Female    */
  'linear-gradient(135deg,#2c3e50,#3d5166)',  /* dark  — Multilang */
  'linear-gradient(135deg,#c0392b,#e74c3c)',  /* red   — 1-to-1   */
];

/* Per-card top-accent gradient (hover reveal line) */
const ACCENTS = [
  'linear-gradient(90deg,#d4af37,#f0c040)',
  'linear-gradient(90deg,#0b6e4f,#1a9e72)',
  'linear-gradient(90deg,#1a5fa0,#2176c7)',
  'linear-gradient(90deg,#7a3a8a,#a04dba)',
  'linear-gradient(90deg,#2c3e50,#3d5166)',
  'linear-gradient(90deg,#c0392b,#e74c3c)',
];

/* Inline SVG icons — consistent Lucide-style, 24×24 viewBox, white stroke */
const ICONS = [
  /* 0 — Gift: Free Trial */
  <svg key="gift" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>,
  /* 1 — Shield-check: Al-Azhar Certified */
  <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>,
  /* 2 — Clock: Flexible Schedule */
  <svg key="clock" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>,
  /* 3 — User-heart: Female Tutors */
  <svg key="user-heart" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
    <path d="M8.8 18.6 12 22l3.2-3.4a2.2 2.2 0 0 0-3.2-3 2.2 2.2 0 0 0-3.2 3z"
          fill="rgba(255,255,255,.2)"/>
  </svg>,
  /* 4 — Globe: Multilingual */
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>,
  /* 5 — User-circle: One-to-One */
  <svg key="user-circle" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="feature__icon-svg" aria-hidden="true">
    <path d="M18 20a6 6 0 0 0-12 0"/>
    <circle cx="12" cy="10" r="4"/>
    <circle cx="12" cy="12" r="10"/>
  </svg>,
];

export default function Features() {
  const { t } = useLang();

  return (
    <section className="features">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.features.eyebrow}</p>
          <h2>{t.features.heading}</h2>
        </Reveal>
        <div className="features__grid">
          {features.map((f, i) => {
            const item = t.features.items[i] || {};
            const isFeatured = i === 0;
            return (
              <Reveal
                as="article"
                className={`feature${isFeatured ? ' feature--featured' : ''}`}
                key={f.title}
                style={{ '--feature-grad': ACCENTS[i % ACCENTS.length] }}
              >
                <div className="feature__row">
                  <div
                    className="feature__icon-wrap"
                    style={{ background: GRADS[i % GRADS.length] }}
                  >
                    {ICONS[i % ICONS.length]}
                  </div>
                  <h3>{item.title || f.title}</h3>
                </div>
                <p>{item.text || f.text}</p>
                {isFeatured && (
                  <a href="#trial" className="feature__link">
                    Start your free trial <span aria-hidden="true">→</span>
                  </a>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
