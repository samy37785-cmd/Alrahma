import { useState } from 'react';
import PageBar from '../components/layout/PageBar';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import faqItems from '../data/faqItems';
import { homeHref } from '../utils/localePath';
import { site } from '../data/site';

export default function FAQ() {
  const { t, lang } = useLang();
  const pg = t.faqPg;
  useSEO({ title: pg.heading, description: pg.sub });
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // Keep the page short by default — show the most important questions first
  // and reveal the rest on demand. Every item stays mounted in the DOM at
  // all times (2026-09-26): only the row's visibility is toggled via the
  // standard `hidden` attribute (same mechanism fix/faq-render-initial-
  // content, PR #114, already uses for each answer panel), so a crawler or
  // prerendered snapshot sees the full FAQ content, not just the
  // default-visible first 8.
  const VISIBLE = 8;
  const items = faqItems.map((item) => item[lang] || item.en);
  const hasMore = items.length > VISIBLE;

  return (
    <div className="faq-page">
      <PageBar to="/" label={pg.backToSite} />

      <Breadcrumbs items={[{ label: t.nav.resources, to: '/resources' }, { label: pg.heading }]} />

      <main id="main-content" className="container faq-page__main">
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
              hidden={i >= VISIBLE && !showAll}
            >
              <button
                className="faq-item__q"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{item.q}</span>
                <span className="faq-item__icon">{open === i ? '−' : '+'}</span>
              </button>
              <div className="faq-item__a" hidden={open !== i}>
                <p>{item.a}</p>
              </div>
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
          <a href={homeHref('trial')} className="btn btn--green">{pg.bookTrial}</a>
          <a
            href={`https://wa.me/${site.whatsapp}`}
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
