import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';
import { testimonials } from '../data';

const VIDEO_REVIEWS = [
  { id: 'dQw4w9WgXcQ', name: 'Fatima A.', location: 'Milan, Italy',  label: 'Watch her story' },
  { id: 'dQw4w9WgXcQ', name: 'Omar S.',   location: 'Paris, France', label: 'Watch his story' },
  { id: 'dQw4w9WgXcQ', name: 'Maryam K.', location: 'London, UK',   label: 'Watch her story' },
];

export default function Testimonials() {
  const { t } = useLang();

  return (
    <section className="testimonials" id="testimonials">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{t.testimonials.eyebrow}</p>
          <h2>{t.testimonials.heading}</h2>
        </Reveal>

        <div className="testimonials__grid">
          {testimonials.map((item) => (
            <Reveal as="figure" className="quote" key={item.name}>
              <blockquote>{'"' + item.quote + '"'}</blockquote>
              <figcaption>
                <strong>{item.name}</strong>
                <span>{item.location}</span>
              </figcaption>
            </Reveal>
          ))}
        </div>

        <Reveal className="video-reviews">
          <p className="video-reviews__label">Watch real student experiences</p>
          <div className="video-reviews__grid">
            {VIDEO_REVIEWS.map((v) => (
              <div className="video-card" key={v.name}>
                <div className="video-card__thumb">
                  <img
                    src={'https://img.youtube.com/vi/' + v.id + '/hqdefault.jpg'}
                    alt={'Video review by ' + v.name}
                    loading="lazy"
                    width="320"
                    height="180"
                  />
                  <a
                    href={'https://www.youtube.com/watch?v=' + v.id}
                    className="video-card__play"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'Watch ' + v.name + ' review'}
                  >
                    &#9654;
                  </a>
                </div>
                <div className="video-card__info">
                  <strong>{v.name}</strong>
                  <span>{v.location}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
