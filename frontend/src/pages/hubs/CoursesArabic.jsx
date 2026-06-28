import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import { useLang } from '../../context/LangContext';
import useSEO from '../../hooks/useSEO';

export default function CoursesArabic() {
  const { t } = useLang();
  const h = t.hubs;
  const ha = h.arabic;

  useSEO({
    title: 'Arabic Alphabet Course',
    description: 'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — ideal for beginners starting their Quran journey.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: t.nav.courses, to: '/courses' },
            { label: t.nav.arabicAlphabet },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{ha.eyebrow}</span>
            <h1>{ha.heading}</h1>
            <p className="hub-hero__sub">{ha.sub}</p>
            <div className="hub-hero__actions">
              <Link to="/enroll" className="btn btn--primary btn--lg">{h.enrollTrial}</Link>
              <Link to="/courses" className="btn btn--ghost">{h.allCourses}</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="hub-feature-row">
              <div className="hub-feature-text">
                <h2>{ha.learnHeading}</h2>
                <ul className="hub-card__points hub-card__points--large">
                  {ha.learnPoints.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="hub-feature-cta">
                <div className="hub-cta-box">
                  <span className="hub-cta-box__icon">🔤</span>
                  <h3>{ha.tryHeading}</h3>
                  <p>{ha.tryDesc}</p>
                  <Link to="/enroll" className="btn btn--primary">{ha.tryBtn}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hub-related section">
          <div className="container hub-related__inner">
            <h2>{ha.nextHeading}</h2>
            <p>{ha.nextDesc}</p>
            <Link to="/tools/prayer" className="btn btn--ghost">{ha.nextBtn}</Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
