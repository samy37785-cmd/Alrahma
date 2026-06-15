import Reveal from './ui/Reveal';
import { features } from '../data';

export default function Features() {
  return (
    <section className="features">
      <div className="container features__grid">
        {features.map((f) => (
          <Reveal as="article" className="feature" key={f.title}>
            <div className="feature__icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
