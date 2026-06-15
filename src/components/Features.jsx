import Reveal from './ui/Reveal';
import { features } from '../data';
import { useLang } from '../context/LangContext';

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
            return (
              <Reveal as="article" className="feature" key={f.title}>
                <div className="feature__icon">{f.icon}</div>
                <h3>{item.title || f.title}</h3>
                <p>{item.text || f.text}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
