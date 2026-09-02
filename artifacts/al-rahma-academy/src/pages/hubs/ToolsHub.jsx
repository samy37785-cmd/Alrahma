import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import QuickTrialModal from '../../components/ui/QuickTrialModal';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';
import { TOOLS_HUB_TEXT, pick } from '../../i18n/content';

const TOOL_ROUTES = [
  '/tools/quran-reader',
  '/tools/adhkar',
  '/tools/hadith',
  '/tools/prayer',
  '/tools/tasbeeh',
  '/tools/arabic-alphabet',
];

export default function ToolsHub() {
  const { lang, t } = useLang();
  const h  = t.hubs;
  const ht = h.tools;
  const hubText = pick(TOOLS_HUB_TEXT, lang);
  const [trialOpen, setTrialOpen] = useState(false);

  useSEO({
    title: t.nav.tools,
    description: ht.sub,
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[{ label: t.nav.tools }]} />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{ht.eyebrow}</span>
            <h1>{ht.heading}</h1>
            <p className="hub-hero__sub">{ht.sub}</p>
          </div>
        </section>

        {/* ── Tools grid ── */}
        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid">
              {ht.cards.map((card, i) => (
                <Link key={i} to={TOOL_ROUTES[i]} className="hub-card hub-card--stats">
                  {hubText.badges[i] && (
                    <span className={`hub-badge ${hubText.badges[i].cls}`}>
                      {hubText.badges[i].label}
                    </span>
                  )}
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{card.title}</h3>
                  <p className="hub-card__desc">{card.desc}</p>
                  {hubText.stats[i] && (
                    <p className="hub-card__stat">{hubText.stats[i]}</p>
                  )}
                  <span className="hub-card__link">{h.open} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Free trial CTA — convert tool users into students ── */}
        <section className="tools-enroll-cta">
          <div className="container tools-enroll-cta__inner">
            <div className="tools-enroll-cta__text">
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>{hubText.cta.eyebrow}</p>
              <h2>{hubText.cta.heading}</h2>
              <p>{hubText.cta.sub}</p>
              <ul className="tools-enroll-cta__bullets">
                {hubText.cta.bullets.map((bullet) => <li key={bullet}>✓ {bullet}</li>)}
              </ul>
            </div>
            <div className="tools-enroll-cta__action">
              <button
                type="button"
                className="btn btn--gold btn--lg"
                onClick={() => setTrialOpen(true)}
              >
                {hubText.cta.button} →
              </button>
              <p className="tools-enroll-cta__note">
                🛡️ {hubText.cta.note}
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
      <QuickTrialModal open={trialOpen} onClose={() => setTrialOpen(false)} />
    </>
  );
}
