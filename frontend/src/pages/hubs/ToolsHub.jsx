import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

const TOOL_ROUTES = ['/tools/quran-reader', '/tools/adhkar', '/tools/hadith', '/tools/prayer', '/tools/tasbeeh', '/tools/arabic-alphabet'];

export default function ToolsHub() {
  const { t } = useLang();
  const h = t.hubs;
  const ht = h.tools;

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

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid">
              {ht.cards.map((card, i) => (
                <Link key={i} to={TOOL_ROUTES[i]} className="hub-card">
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{card.title}</h3>
                  <p className="hub-card__desc">{card.desc}</p>
                  <span className="hub-card__link">{h.open} →</span>
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
