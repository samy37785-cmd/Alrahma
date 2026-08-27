import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

export default function CoursesQuran() {
  const { t } = useLang();
  const h = t.hubs;
  const hq = h.quran;

  useSEO({
    title: 'Quran & Tajweed Courses',
    description: 'Online Quran Reading, Tajweed, and Hifz (memorization) courses with certified Al-Azhar teachers — in 17 languages.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: t.nav.courses, to: '/courses' },
            { label: t.nav.quranTajweed },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{hq.eyebrow}</span>
            <h1>{hq.heading}</h1>
            <p className="hub-hero__sub">{hq.sub}</p>
            <div className="hub-hero__actions">
              <Link to="/enroll" className="btn btn--primary btn--lg">{h.startTrial}</Link>
              <Link to="/courses" className="btn btn--ghost">{h.allCourses}</Link>
            </div>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid">
              {hq.cards.map((card) => (
                <div key={card.title} className="hub-card hub-card--detailed">
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{card.title}</h3>
                  <p className="hub-card__desc">{card.desc}</p>
                  <ul className="hub-card__points">
                    {card.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <Link to="/enroll" className="btn btn--primary">{h.enrollNow}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hub-related section">
          <div className="container hub-related__inner">
            <h2>{hq.relatedHeading}</h2>
            <p>{hq.relatedDesc}</p>
            <Link to="/tools/quran" className="btn btn--ghost">{hq.relatedBtn}</Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
