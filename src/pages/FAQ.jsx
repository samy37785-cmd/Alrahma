import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import faqItems from '../data/faqItems';

export default function FAQ() {
  const { t, lang } = useLang();
  const pg = t.faqPg;
  useSEO({ title: pg.heading, description: pg.sub });
  const [open, setOpen] = useState(null);

  const items = faqItems.map((item) => item[lang] || item.en);

  return (
    <div className="faq-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">{pg.backToSite}</Link>
        </div>
      </header>

      <main className="container faq-page__main">
        <div className="faq-page__header">
          <p className="eyebrow">{pg.eyebrow}</p>
          <h1>{pg.heading}</h1>
          <p className="faq-page__sub">{pg.sub}</p>
        </div>

        <div className="faq-list">
          {items.map((item, i) => (
            <div
              key={i}
              className={open === i ? 'faq-item faq-item--open' : 'faq-item'}
            >
              <button
                className="faq-item__q"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{item.q}</span>
                <span className="faq-item__icon">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div className="faq-item__a">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="faq-cta">
          <p>{pg.stillQuestion}</p>
          <a href="/#trial" className="btn btn--green">{pg.bookTrial}</a>
          <a
            href="https://wa.me/201016054663"
            className="btn btn--ghost"
            target="_blank"
            rel="noopener noreferrer"
          >
            {pg.whatsapp}
          </a>
        </div>
      </main>
    </div>
  );
}
