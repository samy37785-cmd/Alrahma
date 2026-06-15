import { useLang } from '../context/LangContext';

export default function Hero() {
  const { t } = useLang();
  const h = t.hero;

  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__text">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1>{h.title}</h1>
          <p className="hero__sub">{h.sub}</p>
          <div className="hero__actions">
            <a href="#trial" className="btn btn--gold">{h.cta1}</a>
            <a href="/quran" className="btn btn--green">{h.cta2}</a>
            <a href="#courses" className="btn btn--ghost">{h.cta3}</a>
          </div>
          <ul className="hero__badges">
            <li>{h.badge1}</li>
            <li>{h.badge2}</li>
            <li>{h.badge3}</li>
          </ul>
        </div>
        <div className="hero__art" aria-hidden="true">
          <div className="hero__card">
            <span className="hero__arabic">ٱقْرَأْ</span>
            <p>{h.verseQuote}</p>
            <small>{h.verseRef}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
