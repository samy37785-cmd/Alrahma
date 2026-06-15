import Reveal from './ui/Reveal';
import { site, stats, about, objectives, values, offers } from '../data';

export default function About() {
  return (
    <>
      {/* ── Who we are ───────────────────────────────────────────────────── */}
      <section className="about" id="about">
        <div className="container about__inner">
          <div className="about__text">
            <p className="eyebrow">Who we are</p>
            <h2>About {site.name} Academy</h2>
            <p className="about__mission">{about.mission}</p>
            <p className="about__vision">{about.vision}</p>
            <a href="#trial" className="btn btn--green">Book Your Free Trial</a>
          </div>
          <div className="about__stats">
            {stats.map((s) => (
              <Reveal className="stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Objectives ───────────────────────────────────────────────── */}
      <section className="obj">
        <div className="container">
          <p className="eyebrow obj__eyebrow">What we set out to do</p>
          <h2 className="obj__heading">Our Objectives</h2>
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

      {/* ── Our Values ───────────────────────────────────────────────────── */}
      <section className="values">
        <div className="container">
          <p className="eyebrow values__eyebrow">What guides us</p>
          <h2 className="values__heading">Our Core Values</h2>
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

      {/* ── What We Offer ────────────────────────────────────────────────── */}
      <section className="offers">
        <div className="container">
          <p className="eyebrow offers__eyebrow">What you get</p>
          <h2 className="offers__heading">What We Offer</h2>
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