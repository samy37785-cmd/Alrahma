import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang, withLanguage } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';
import { ISLAMIC_STUDIES_TEXT } from '../i18n/courses/islamic-studies';
import { ISLAMIC_STUDIES_HADITHS, ISLAMIC_STUDIES_MODULES, ISLAMIC_STUDIES_BOOKS } from '../data/courses/islamic-studies';
import IslamicStudiesBookCard from '../components/features/courses/IslamicStudiesBookCard';
import { site } from '../data/site';

export default function CourseIslamicStudies() {
  const navigate = useNavigate();
  const { lang, t: siteT } = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const t         = ISLAMIC_STUDIES_TEXT[lang] || ISLAMIC_STUDIES_TEXT.en;
  const [openModule, setOpenModule] = useState(null);

  const hadithIndex = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    return dayOfYear % ISLAMIC_STUDIES_HADITHS.length;
  }, []);
  const hadith = ISLAMIC_STUDIES_HADITHS[hadithIndex];
  const hadithText = t.hadiths[hadith.id];

  useSEO({
    title: t.seo.title,
    description: t.seo.description,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Islamic Studies Course',
      description: 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
      provider: { '@type': 'EducationalOrganization', name: 'Al-Rahma Academy', sameAs: site.origin },
      educationalLevel: 'All levels',
      inLanguage: ['en', 'ar'],
      teaches: 'Aqeedah, Fiqh, Seerah, Hadith, Tafsir, Islamic Studies',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    },
  });

  return (
    <>
      <Header />
      <main id="main-content" dir={ui.dir}>
        <Breadcrumbs items={[{ label: siteT.nav.courses, to: '/courses' }, { label: t.breadcrumbLabel }]} />

        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#1e0a30,#7a3a8a)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🕌 {t.hero.badge}</span>
            <h1 className="cl__hero-title">{t.hero.title}</h1>
            <p className="cl__hero-sub">{t.hero.sub}</p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate(withLanguage('/enroll?course=islamic-studies', lang))}>
                {ui.bookTrial}
              </button>
              <Link to={withLanguage('/academy/teachers', lang)} className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#1e0a30' }}>
          <div className="container cl__stats-inner">
            {t.stats.map((s) => (
              <div className="cl__stat" key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="container cl__body">
          <div className="cl__left">

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whatYoullLearn}</h2>
              <ul className="cl__learn-list">
                {t.learn.map((pt) => (
                  <li key={pt} className="cl__learn-item">
                    <span className="cl__check">✓</span><span>{pt}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Hadith of the Day */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.hadithDay}</h2>
              <div className="cl__hadith-card">
                <p className="cl__hadith-arabic" dir="rtl">{hadith.arabic}</p>
                <blockquote className="cl__hadith-text">
                  {hadithText.text}
                </blockquote>
                <div className="cl__hadith-meta">
                  <span className="cl__hadith-narrator">— {hadithText.narrator}</span>
                  <span className="cl__hadith-source">{hadithText.source}</span>
                </div>
                {hadith.url && (
                  <a href={hadith.url} target="_blank" rel="noreferrer" className="cl__hadith-link">
                    {t.hadithReadLink}
                  </a>
                )}
              </div>
            </Reveal>

            {/* Modules */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.modules}</h2>
              <div className="cl__stages">
                {ISLAMIC_STUDIES_MODULES.map((m, i) => {
                  const mt = t.modules[m.id];
                  return (
                    <div
                      key={m.num}
                      className={`cl__stage${openModule === i ? ' open' : ''}`}
                      style={{ '--stage-color': m.color }}
                    >
                      <button className="cl__stage-header" onClick={() => setOpenModule(openModule === i ? null : i)}>
                        <span className="cl__stage-num" style={{ background: m.color }}>{m.icon}</span>
                        <div className="cl__stage-meta">
                          <strong>{m.num}. {mt.title}</strong>
                          <span>{mt.duration}</span>
                        </div>
                        <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{m.sourceAr}</span>
                        <span className="cl__stage-chevron">{openModule === i ? '▲' : '▼'}</span>
                      </button>
                      {openModule === i && (
                        <div className="cl__stage-body">
                          <p className="cl__stage-author">📚 {mt.source}</p>
                          <ul className="cl__stage-points">
                            {mt.topics.map((tp) => <li key={tp}>{tp}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Reveal>

            {/* Books */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.authSources}</h2>
              <div className="cl__books">
                {ISLAMIC_STUDIES_BOOKS.map((b) => (
                  <IslamicStudiesBookCard key={b.id} book={b} text={t.books[b.id]} />
                ))}
              </div>
            </Reveal>

            {/* Who for */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whoFor}</h2>
              <div className="cl__for-grid">
                {t.for.map((item) => (
                  <div key={item.label} className="cl__for-item">
                    <span>{item.icon}</span><span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Sticky enroll card */}
          <div className="cl__right">
            <div className="cl__enroll-card">
              <div className="cl__enroll-card-top" style={{ background: 'linear-gradient(145deg,#1e0a30,#7a3a8a)' }}>
                <span className="cl__enroll-icon">🕌</span>
                <p className="cl__enroll-title">{t.enrollCard.title}</p>
                <p className="cl__enroll-sub">{t.enrollCard.sub}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {t.perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate(withLanguage('/enroll?course=islamic-studies', lang))}>
                  {ui.bookTrial}
                </button>
                <Link to={withLanguage('/academy/teachers', lang)} className="cl__enroll-link">{ui.browseTeachers}</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
