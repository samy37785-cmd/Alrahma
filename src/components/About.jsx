import Reveal from './Reveal';
import { site, stats } from '../data';

export default function About() {
  return (
    <section className="about" id="about">
      <div className="container about__inner">
        <div className="about__text">
          <p className="eyebrow">Who we are</p>
          <h2>About {site.name} Academy</h2>
          <p>
            {site.name} Academy is a dedicated online platform helping students around the
            world connect with the Holy Quran and the Arabic language. Our qualified native
            Egyptian tutors deliver personalized, one-to-one lessons for both children and
            adults.
          </p>
          <p>
            With flexible scheduling, female tutors, and a friendly learning environment, we
            make authentic Islamic education accessible — wherever you are in the world.
          </p>
          <a href="#trial" className="btn btn--green">
            Book Your Free Trial
          </a>
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
  );
}
