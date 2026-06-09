import Reveal from './Reveal';
import { site, steps } from '../data';

export default function Steps() {
  return (
    <section className="steps">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Getting started</p>
          <h2>How to learn at {site.name} Academy in 3 steps</h2>
        </Reveal>
        <div className="steps__grid">
          {steps.map((s) => (
            <Reveal className="step" key={s.num}>
              <span className="step__num">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
