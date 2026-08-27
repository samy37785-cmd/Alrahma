import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

const RESOURCE_ROUTES = ['/resources/blog', '/resources/faq', '/academy/about', '/academy/teachers'];

export default function ResourcesHub() {
  const { t } = useLang();
  const h = t.hubs;
  const hr = h.resources;

  useSEO({
    title: t.nav.resources,
    description: 'Explore resources from Al-Rahma Academy: blog articles, FAQ, academy information, and teacher profiles.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[{ label: t.nav.resources }]} />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{hr.eyebrow}</span>
            <h1>{hr.heading}</h1>
            <p className="hub-hero__sub">{hr.sub}</p>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid hub-cards__grid--4">
              {hr.cards.map((card, i) => (
                <Link key={i} to={RESOURCE_ROUTES[i]} className="hub-card">
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{card.title}</h3>
                  <p className="hub-card__desc">{card.desc}</p>
                  <span className="hub-card__link">{h.browse} →</span>
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
