import Reveal from './Reveal';
import { testimonials } from '../data';

export default function Testimonials() {
  return (
    <section className="testimonials" id="testimonials">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Student stories</p>
          <h2>What Our Students Say</h2>
        </Reveal>
        <div className="testimonials__grid">
          {testimonials.map((t) => (
            <Reveal as="figure" className="quote" key={t.name}>
              <blockquote>{`“${t.quote}”`}</blockquote>
              <figcaption>
                <strong>{t.name}</strong>
                <span>{t.location}</span>
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
