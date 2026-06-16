import Reveal from './ui/Reveal';
import { features } from '../data';
import { useLang } from '../context/LangContext';

const GRADS = [
  'linear-gradient(135deg,#d4af37,#f0c040)',
  'linear-gradient(135deg,#0b6e4f,#1a9e72)',
  'linear-gradient(135deg,#1a5fa0,#2176c7)',
  'linear-gradient(135deg,#7a3a8a,#a04dba)',
  'linear-gradient(135deg,#2c3e50,#3d5166)',
  'linear-gradient(135deg,#c0392b,#e74c3c)',
];

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
                <div className="feature__icon-wrap" style={{ background: GRADS[i % GRADS.length] }}>
                  <span className="feature__icon">{f.icon}</span>
                </div>
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
