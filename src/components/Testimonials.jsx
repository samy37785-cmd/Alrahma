import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import { TESTIMONIAL_TEXT, pick } from '../i18n/content';
import { TESTIMONIALS as ALL, HAPPY_STUDENTS, SHOW_TESTIMONIALS } from '../data/socialProof';

export default function Testimonials() {
  const { t, lang } = useLang();
  const [idx, setIdx] = useState(0);
  const total = ALL.length;

  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);
  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);

  useEffect(() => {
    const id = setInterval(next, 5500);
    return () => clearInterval(id);
  }, [next]);

  // Merge static data (name, location, flag, avatar, color) with translated text.
  const txt = pick(TESTIMONIAL_TEXT, lang);
  const items = ALL.map((item, i) => ({ ...item, quote: txt[i]?.quote || item.quote, course: txt[i]?.course || item.course }));
  const cur  = items[idx];
  const side = [items[(idx + 1) % total], items[(idx + 2) % total]];

  // Don't publish invented reviews: hide the whole section unless placeholder
  // content is explicitly enabled (or you've added real testimonials).
  if (!SHOW_TESTIMONIALS || total === 0) return null;

  return (
    <section className="testimonials" id="testimonials">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.testimonials?.eyebrow || 'What students say'}</p>
          <h2>{t.testimonials?.heading || 'Trusted by Families Worldwide'}</h2>
          <p className="section-sub">{t.testimonials?.sub || 'Real experiences from real students — in their own words.'}</p>
        </Reveal>

        <div className="tst__layout">
          {/* Main featured testimonial */}
          <div className="tst__featured">
            <div className="tst__quote-mark">&quot;</div>
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
              <div className="tst__stars">
                {[1,2,3,4,5].map((s) => (
                  <span key={s} style={{ opacity: s <= Math.round(cur.rating) ? 1 : 0.25 }}>★</span>
                ))}
                <span className="tst__rating-num">{cur.rating?.toFixed(1)}</span>
              </div>
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
                  <div className="tst__mini-stars">
                    {[1,2,3,4,5].map((s) => (
                      <span key={s} style={{ opacity: s <= Math.round(item.rating) ? 1 : 0.25 }}>★</span>
                    ))}
                    <span className="tst__rating-num">{item.rating?.toFixed(1)}</span>
                  </div>
                </div>
                <p className="tst__mini-text">&quot;{item.quote.slice(0, 110)}…&quot;</p>
                <span className="tst__mini-course">📖 {item.course}</span>
              </div>
            ))}

            {/* CTA card */}
            <div className="tst__cta-card">
              <p className="tst__cta-num">{HAPPY_STUDENTS}</p>
              <p className="tst__cta-label">{t.testimonials?.happyStudents || 'happy students worldwide'}</p>
              <Link to="/enroll" className="btn btn--gold btn--block">
                {t.testimonials?.joinToday || 'Join them today →'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
