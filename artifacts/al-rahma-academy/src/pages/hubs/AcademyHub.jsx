import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';
import { pickAcademySeo } from '../../i18n/academy/seo';

const ACADEMY_ROUTES = ['/academy/about', '/academy/teachers', '/academy/privacy', '/enroll'];

export default function AcademyHub() {
  const { t, lang } = useLang();
  const h = t.hubs;
  const hac = h.academy;
  const seo = pickAcademySeo(lang);

  useSEO({
    title: t.nav.academy,
    description: seo.description,
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[{ label: t.nav.academy }]} />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{hac.eyebrow}</span>
            <h1>{hac.heading}</h1>
            <p className="hub-hero__sub">{hac.sub}</p>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid hub-cards__grid--4">
              {hac.cards.map((card, i) => {
                const isCta = i === hac.cards.length - 1;
                return (
                  <Link
                    key={i}
                    to={ACADEMY_ROUTES[i]}
                    className={`hub-card${isCta ? ' hub-card--cta' : ''}`}
                  >
                    <span className="hub-card__icon">{card.icon}</span>
                    <h3 className="hub-card__title">{card.title}</h3>
                    <p className="hub-card__desc">{card.desc}</p>
                    <span className="hub-card__link">
                      {isCta ? h.bookFree : h.learnMore} →
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
