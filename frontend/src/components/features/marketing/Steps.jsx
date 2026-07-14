import Reveal from '../../ui/Reveal';
import { steps } from '../../../data';
import { useLang } from '../../../context/LangContext';

const STEP_ICONS = ['📋', '🗓️', '💻'];

export default function Steps() {
  const { t } = useLang();

  return (
    <section className="steps">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.steps.eyebrow}</p>
          <h2>{t.steps.heading}</h2>
        </Reveal>
        <div className="steps__timeline">
          {steps.map((s, i) => {
            const item = t.steps.items[i] || {};
            return (
              <div className="timeline-step" key={s.num}>
                <div className="timeline-step__connector">
                  <div className="timeline-step__circle">
                    <span className="timeline-step__num">{s.num}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="timeline-step__line">
                      <span className="timeline-step__arrow">›</span>
                    </div>
                  )}
                </div>
                <Reveal className="timeline-step__card">
                  <span className="timeline-step__icon">{STEP_ICONS[i]}</span>
                  <h3>{item.title || s.title}</h3>
                  <p>{item.text || s.text}</p>
                </Reveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
