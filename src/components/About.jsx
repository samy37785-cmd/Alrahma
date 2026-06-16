import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import { stats, values } from '../data';

export default function About() {
  const { t } = useLang();
  const a = t.about;

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
            <a href="#trial" className="btn btn--green" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
              {t.nav.trial}
            </a>
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
          {values.map((v) => (
            <Reveal className="value-card" key={v.title}>
              <span className="value-card__icon">{v.icon}</span>
              <h4 className="value-card__title">{v.title}</h4>
              <p className="value-card__desc">{v.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
