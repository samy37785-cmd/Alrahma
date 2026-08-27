import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import WhatsappFab from '../components/ui/WhatsappFab';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { TOOLS_TEXT, pick } from '../i18n/content';
import '../styles/islamic-tools.css';

const PRAYER_TOOL_CARDS = [
  {
    icon: '🕌',
    to: '/tools/prayer-times',
    key: 'prayer',
  },
  {
    icon: '🧭',
    to: '/tools/qibla',
    key: 'qibla',
  },
  {
    icon: '📅',
    to: '/tools/islamic-calendar',
    key: 'calendar',
  },
  {
    icon: '🌟',
    to: '/tools/verse-of-the-day',
    key: 'verse',
  },
];

export default function IslamicTools() {
  const { lang, t } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const toolHubCard = t.hubs.tools.cards[3];

  useSEO({
    title: toolHubCard.title,
    description: toolHubCard.desc,
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[
          { label: t.nav.tools, to: '/tools' },
          { label: toolHubCard.title },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{tx.eyebrow}</p>
            <h1>{toolHubCard.title}</h1>
            <p className="it__hero-sub">{toolHubCard.desc}</p>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid hub-cards__grid--4">
              {PRAYER_TOOL_CARDS.map((card) => (
                <Link key={card.to} to={card.to} className="hub-card">
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{tx.tabs[card.key]}</h3>
                  <p className="hub-card__desc">{tx.toolCards[card.key]}</p>
                  <span className="hub-card__link">{t.hubs.open} {lang === 'ar' ? '←' : '→'}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
