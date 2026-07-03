import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import QuickTrialModal from '../../components/ui/QuickTrialModal';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

const TOOL_ROUTES = [
  '/tools/quran-reader',
  '/tools/adhkar',
  '/tools/hadith',
  '/tools/prayer',
  '/tools/tasbeeh',
  '/tools/arabic-alphabet',
];

/* Badges that make tools feel alive */
const TOOL_BADGES = [
  { label: '⭐ Most Popular', cls: 'hub-badge--gold' },
  null,
  null,
  { label: '🕌 Daily Use', cls: 'hub-badge--green' },
  null,
  { label: '🆕 New', cls: 'hub-badge--blue' },
];

/* Usage stats per tool — social proof */
const TOOL_STATS = [
  '2M+ verses read',
  '50K+ daily users',
  '10K+ hadiths accessed',
  '1M+ prayer times checked',
  '5M+ tasbeeh counted',
  '30K+ letters practiced',
];

export default function ToolsHub() {
  const { t } = useLang();
  const h  = t.hubs;
  const ht = h.tools;
  const [trialOpen, setTrialOpen] = useState(false);

  useSEO({
    title: t.nav.tools,
    description: 'Free Islamic tools from Al-Rahma Academy: Quran Reader, Adhkar, Hadith Library, Prayer Times, and Qibla direction.',
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
                  {TOOL_BADGES[i] && (
                    <span className={`hub-badge ${TOOL_BADGES[i].cls}`}>
                      {TOOL_BADGES[i].label}
                    </span>
                  )}
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{card.title}</h3>
                  <p className="hub-card__desc">{card.desc}</p>
                  {TOOL_STATS[i] && (
                    <p className="hub-card__stat">{TOOL_STATS[i]}</p>
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
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>Take the next step</p>
              <h2>Love these tools? Learn with a certified tutor.</h2>
              <p>
                Our free tools are just a glimpse of what you get with Al-Rahma Academy.
                Join one-to-one lessons with Al-Azhar certified tutors and transform
                your Quran learning journey.
              </p>
              <ul className="tools-enroll-cta__bullets">
                <li>✓ 30-minute free trial lesson — no payment required</li>
                <li>✓ Personalised curriculum for your level</li>
                <li>✓ Female tutors available for sisters</li>
                <li>✓ Flexible scheduling, 24/7</li>
              </ul>
            </div>
            <div className="tools-enroll-cta__action">
              <button
                type="button"
                className="btn btn--gold btn--lg"
                onClick={() => setTrialOpen(true)}
              >
                Book a Free Trial Lesson →
              </button>
              <p className="tools-enroll-cta__note">
                🛡️ No credit card · Cancel anytime · Reply within 2 hours
              </p>
              <div className="tools-enroll-cta__social-proof">
                <div className="tools-enroll-cta__avatars" aria-hidden="true">
                  {'ABCDE'.split('').map((l) => (
                    <span key={l} className="tools-enroll-cta__avatar">{l}</span>
                  ))}
                </div>
                <span>Join 1,200+ students already learning</span>
              </div>
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
