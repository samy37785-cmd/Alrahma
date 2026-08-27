import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

const CARD_ROUTES = ['/courses/quran', '/courses/quran', '/courses/ijazah', '/courses/islamic-studies', '/courses/arabic', '/enroll'];

export default function CoursesHub() {
  const { t } = useLang();
  const h = t.hubs;
  const hc = h.courses;

  useSEO({
    title: t.nav.courses,
    description: 'Explore all online Quran and Islamic courses at Al-Rahma Academy — Tajweed, Hifz, Ijazah, Islamic Studies, Arabic Alphabet, and more.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[{ label: t.nav.courses }]} />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{hc.eyebrow}</span>
            <h1>{hc.heading}</h1>
            <p className="hub-hero__sub">{hc.sub}</p>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid">
              {hc.cards.map((card, i) => {
                const isCta = i === hc.cards.length - 1;
                return (
                  <Link
                    key={i}
                    to={CARD_ROUTES[i]}
                    className={`hub-card${isCta ? ' hub-card--cta' : ''}`}
                  >
                    {card.badge && <span className="hub-card__badge">{card.badge}</span>}
                    <span className="hub-card__icon">{card.icon}</span>
                    <h3 className="hub-card__title">{card.title}</h3>
                    <p className="hub-card__desc">{card.desc}</p>
                    <span className="hub-card__link">
                      {isCta ? h.startTrial : h.learnMore} →
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
