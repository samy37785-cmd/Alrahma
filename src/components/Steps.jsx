import Reveal from './ui/Reveal';
import { steps } from '../data';
import { useLang } from '../context/LangContext';

export default function Steps() {
  const { t } = useLang();

  return (
    <section className="steps">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.steps.eyebrow}</p>
          <h2>{t.steps.heading}</h2>
        </Reveal>
        <div className="steps__grid">
          {steps.map((s, i) => {
            const item = t.steps.items[i] || {};
            return (
              <Reveal className="step" key={s.num}>
                <span className="step__num">{s.num}</span>
                <h3>{item.title || s.title}</h3>
                <p>{item.text || s.text}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
