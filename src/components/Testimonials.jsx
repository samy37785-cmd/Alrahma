import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';

const ALL = [
  {
    quote: "My children love their lessons. The tutors are patient, kind and truly knowledgeable. We've seen amazing progress in just a few months.",
    name: 'Aisha R.',
    location: 'Manchester, UK',
    flag: '🇬🇧',
    course: 'Quran Reading & Tajweed',
    avatar: 'AR',
    color: '#0b6e4f',
  },
  {
    quote: 'Flexible timing made it possible for me to study around work. My Tajweed has improved more than I imagined. Highly recommended.',
    name: 'Yusuf K.',
    location: 'Frankfurt, Germany',
    flag: '🇩🇪',
    course: 'Tajweed (Hafs)',
    avatar: 'YK',
    color: '#1a5fa0',
  },
  {
    quote: 'Professional, organized and very welcoming. The free trial convinced our whole family to join. May Allah reward the teachers.',
    name: 'Sarah M.',
    location: 'Texas, USA',
    flag: '🇺🇸',
    course: 'Islamic Studies',
    avatar: 'SM',
    color: '#7a3a8a',
  },
  {
    quote: "Our daughter memorised her first Juz in 3 months. The tutor's patience is incredible — she never gets frustrated and always finds a new way to explain.",
    name: 'Mariam O.',
    location: 'Amsterdam, Netherlands',
    flag: '🇳🇱',
    course: "Hifz (Quran Memorization)",
    avatar: 'MO',
    color: '#c07020',
  },
  {
    quote: 'I converted 2 years ago and wanted to learn how to read the Quran properly. Starting from zero, I can now read independently. Alhamdulillah.',
    name: 'Thomas B.',
    location: 'Lyon, France',
    flag: '🇫🇷',
    course: 'Noorani Qaida for Adults',
    avatar: 'TB',
    color: '#2a7a50',
  },
  {
    quote: 'La professoressa è pazientissima e molto brava. Mio figlio ha imparato le lettere arabe in poche settimane. Consiglio vivamente!',
    name: 'Fatima C.',
    location: 'Rome, Italy',
    flag: '🇮🇹',
    course: 'Arabic Alphabet for Children',
    avatar: 'FC',
    color: '#a03030',
  },
];

export default function Testimonials() {
  const { t } = useLang();
  const [idx, setIdx] = useState(0);
  const total = ALL.length;

  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);
  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);

  useEffect(() => {
    const id = setInterval(next, 5500);
    return () => clearInterval(id);
  }, [next]);

  const cur  = ALL[idx];
  const side = [ALL[(idx + 1) % total], ALL[(idx + 2) % total]];

  return (
    <section className="testimonials" id="testimonials">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.testimonials?.eyebrow || 'What students say'}</p>
          <h2>{t.testimonials?.heading || 'Trusted by Families Worldwide'}</h2>
          <p className="section-sub">Real experiences from real students — in their own words.</p>
        </Reveal>

        <div className="tst__layout">
          {/* Main featured testimonial */}
          <div className="tst__featured">
            <div className="tst__quote-mark">"</div>
            <blockquote className="tst__text">
              {cur.quote}
            </blockquote>
            <div className="tst__meta">
              <div className="tst__avatar" style={{ background: `linear-gradient(135deg,${cur.color},${cur.color}99)` }}>
                {cur.avatar}
              </div>
              <div className="tst__info">
                <strong className="tst__name">{cur.name}</strong>
                <span className="tst__loc">{cur.flag} {cur.location}</span>
                <span className="tst__course">📖 {cur.course}</span>
              </div>
              <div className="tst__stars">★★★★★</div>
            </div>

            <div className="tst__controls">
              <button className="tst__btn" onClick={prev} aria-label="Previous">‹</button>
              <div className="tst__dots">
                {ALL.map((_, i) => (
                  <button key={i}
                    className={`tst__dot${i === idx ? ' active' : ''}`}
                    onClick={() => setIdx(i)}
                    aria-label={`Go to review ${i + 1}`}
                  />
                ))}
              </div>
              <button className="tst__btn" onClick={next} aria-label="Next">›</button>
            </div>
          </div>

          {/* Side mini-cards */}
          <div className="tst__side">
            {side.map((item) => (
              <div key={item.name} className="tst__mini">
                <div className="tst__mini-top">
                  <div className="tst__mini-avatar" style={{ background: `linear-gradient(135deg,${item.color},${item.color}88)` }}>
                    {item.avatar}
                  </div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.flag} {item.location}</span>
                  </div>
                  <div className="tst__mini-stars">★★★★★</div>
                </div>
                <p className="tst__mini-text">"{item.quote.slice(0, 110)}…"</p>
                <span className="tst__mini-course">📖 {item.course}</span>
              </div>
            ))}

            {/* CTA card */}
            <div className="tst__cta-card">
              <p className="tst__cta-num">1,200+</p>
              <p className="tst__cta-label">happy students worldwide</p>
              <Link to="/enroll" className="btn btn--gold btn--block">
                Join them today →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
