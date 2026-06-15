import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import { site, stats, objectives, values, offers } from '../data';

export default function About() {
  const { t } = useLang();
  const a = t.about;

  return (
    <>
      <section className="about" id="about">
        <div className="container about__inner">
          <div className="about__text">
            <p className="eyebrow">{a.eyebrow}</p>
            <h2>{a.heading}</h2>
            <p className="about__mission">{a.mission}</p>
            <p className="about__vision">{a.vision}</p>
            <a href="#trial" className="btn btn--green">{t.nav.trial}</a>
          </div>
          <div className="about__stats">
            {stats.map((s, i) => (
              <Reveal className="stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{a.statsLabel[i] || s.label}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="obj">
        <div className="container">
          <p className="eyebrow obj__eyebrow">{a.objectivesHeading}</p>
          <h2 className="obj__heading">{a.objectivesHeading}</h2>
          <div className="obj__grid">
            {objectives.map((o) => (
              <Reveal className="obj__item" key={o.num}>
                <span className="obj__num">{o.num}</span>
                <p className="obj__text">{o.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="values">
        <div className="container">
          <p className="eyebrow values__eyebrow">{a.valuesHeading}</p>
          <h2 className="values__heading">{a.valuesHeading}</h2>
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

      <section className="offers">
        <div className="container">
          <p className="eyebrow offers__eyebrow">{a.offersHeading}</p>
          <h2 className="offers__heading">{a.offersHeading}</h2>
          <div className="offers__grid">
            {offers.map((o) => (
              <Reveal className="offer-card" key={o.title}>
                <span className="offer-card__icon">{o.icon}</span>
                <h4 className="offer-card__title">{o.title}</h4>
                <p className="offer-card__desc">{o.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
