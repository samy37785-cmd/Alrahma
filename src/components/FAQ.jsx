import { useState } from 'react';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';

export default function FAQ() {
  const { t } = useLang();
  const faq = t.faq;
  const [open, setOpen] = useState(null);

  return (
    <section className="faq" id="faq">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{faq.eyebrow}</p>
          <h2>{faq.heading}</h2>
          <p className="section-sub">{faq.sub}</p>
        </Reveal>

        <div className="faq__list">
          {faq.items.map((item, i) => (
            <Reveal className={`faq__item${open === i ? ' faq__item--open' : ''}`} key={i}>
              <button
                className="faq__question"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{item.q}</span>
                <span className="faq__icon">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div className="faq__answer">
                  <p>{item.a}</p>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
