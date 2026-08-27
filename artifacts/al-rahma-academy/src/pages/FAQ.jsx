import { useState } from 'react';
import PageBar from '../components/layout/PageBar';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import faqItems from '../data/faqItems';

export default function FAQ() {
  const { t, lang } = useLang();
  const pg = t.faqPg;
  useSEO({ title: pg.heading, description: pg.sub });
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // Keep the page short by default — show the most important questions first
  // and reveal the rest on demand.
  const VISIBLE = 8;
  const items = faqItems.map((item) => item[lang] || item.en);
  const visibleItems = showAll ? items : items.slice(0, VISIBLE);
  const hasMore = items.length > VISIBLE;

  return (
    <div className="faq-page">
      <PageBar to="/" label={pg.backToSite} />

      <Breadcrumbs items={[{ label: 'Resources', to: '/resources' }, { label: pg.heading }]} />

      <main id="main-content" className="container faq-page__main">
        <div className="faq-page__header">
          <p className="eyebrow">{pg.eyebrow}</p>
          <h1>{pg.heading}</h1>
          <p className="faq-page__sub">{pg.sub}</p>
        </div>

        <div className="faq-list">
          {visibleItems.map((item, i) => (
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

        {hasMore && (
          <div className="faq-more">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (showAll) setOpen(null);
                setShowAll((v) => !v);
              }}
              aria-expanded={showAll}
            >
              {showAll ? pg.showLess : pg.showAll}
            </button>
          </div>
        )}

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
