import { useState } from 'react';
import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';

const PLUS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CHAT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </svg>
);

export default function FAQ() {
  const { t } = useLang();
  const faq = t.faq;
  const [open, setOpen] = useState(0);

  return (
    <section className="faq" id="faq">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{faq.eyebrow}</p>
          <h2>{faq.heading}</h2>
          <p className="section-sub">{faq.sub}</p>
        </Reveal>

        <div className="faq__layout">
          <Reveal className="faq__list">
            {faq.items.map((item, i) => {
              const isOpen = open === i;
              return (
                <div className={`faq__item${isOpen ? ' faq__item--open' : ''}`} key={item.q}>
                  <button
                    type="button"
                    className="faq__question"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                  >
                    <span className="faq__num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="faq__question-text">{item.q}</span>
                    <span className="faq__icon">{PLUS_ICON}</span>
                  </button>
                  <div className="faq__panel">
                    <div className="faq__answer">
                      <div className="faq__answer-inner">
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>

          <Reveal className="faq__aside">
            <div className="faq__aside-icon">{CHAT_ICON}</div>
            <h3>Still have questions?</h3>
            <p>Our team typically replies within a couple of hours — ask us anything before you commit.</p>
            <a
              href="https://wa.me/message/ALRAHMA"
              target="_blank"
              rel="noopener noreferrer"
              className="faq__aside-btn"
            >
              Chat with us on WhatsApp
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
