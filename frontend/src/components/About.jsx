import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import { stats, values } from '../data';
import { VALUES_TEXT, pick } from '../i18n/content';

export default function About() {
  const { t, lang } = useLang();
  const a = t.about;
  const valuesT = pick(VALUES_TEXT, lang);

  return (
    <section className="about" id="about">
      <div className="container">
        {/* ── Mission & Stats ── */}
        <div className="about__inner">
          <Reveal className="about__text">
            <p className="eyebrow">{a.eyebrow}</p>
            <h2>{a.heading}</h2>
            <p className="about__desc">{a.description}</p>
            <p className="about__mission">{a.mission}</p>
            <Link to="/enroll" className="btn btn--green" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
              {t.nav.trial}
            </Link>
          </Reveal>

          <div className="about__right">
            <div className="about__stats">
              {stats.map((s, i) => (
                <Reveal className="stat" key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{a.statsLabel[i] || s.label}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* ── Values ── */}
        <Reveal className="section-head" style={{ marginTop: '80px' }}>
          <p className="eyebrow">{a.valuesHeading}</p>
          <h2>{a.valuesHeading}</h2>
        </Reveal>
        <div className="values__grid">
          {values.map((v, i) => {
            const vt = valuesT[i] || {};
            return (
              <Reveal className="value-card" key={v.title}>
                <span className="value-card__icon">{v.icon}</span>
                <h4 className="value-card__title">{vt.title || v.title}</h4>
                <p className="value-card__desc">{vt.desc || v.desc}</p>
              </Reveal>
            );
          })}
        </div>

        {/* ── Founder Story ── */}
        <Reveal className="founder">
          <div className="founder__avatar" aria-hidden="true">
            <span>م س</span>
          </div>
          <div className="founder__content">
            <p className="eyebrow">Our Story</p>
            <h2 className="founder__title">Why We Built Al-Rahma Academy</h2>
            <p className="founder__body">
              I am an Egyptian educator who moved to Europe and watched my children struggle to
              find a qualified Quran teacher — someone who could teach correctly, speak their
              language, and understand their world. Every option I found was either too expensive,
              too unreliable, or simply not qualified.
            </p>
            <p className="founder__body">
              That frustration became Al-Rahma Academy. We started with a handful of hand-picked
              Al-Azhar graduates and one clear rule: <strong>every tutor must be someone I would
              trust to teach my own children.</strong>
            </p>
            <p className="founder__body">
              Today, over 1,200 families across 40+ countries trust us with the most important
              thing they own — the Quran education of their children. Every tutor holds a verified
              Ijazah. Every lesson is one-to-one. Every family can change their tutor, pause their
              subscription, or request a refund — without any friction.
            </p>
            <p className="founder__body">
              We didn't build a platform. We built the academy we needed and couldn't find.
            </p>
            <div className="founder__sig">
              <span className="founder__sig-name" dir="rtl">— Mahmoud Samy, Founder</span>
              <span className="founder__sig-sub">Al-Rahma Academy</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
