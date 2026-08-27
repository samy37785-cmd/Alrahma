import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';
import { HADITHS, MODULES, BOOKS, LEARN, FOR, PERKS } from '../data/islamicStudiesData';
import IslamicStudiesBookCard from '../components/features/courses/IslamicStudiesBookCard';

export default function CourseIslamicStudies() {
  const navigate = useNavigate();
  const { lang }  = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const isAr      = lang === 'ar';
  const [openModule, setOpenModule] = useState(null);

  const hadith = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    return HADITHS[dayOfYear % HADITHS.length];
  }, []);

  useSEO({
    title: isAr ? 'دورة الدراسات الإسلامية' : 'Islamic Studies Course',
    description: isAr
      ? 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — ٥ وحدات يدرّسها علماء معتمدون بلغتك.'
      : 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Islamic Studies Course',
      description: 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
      provider: { '@type': 'EducationalOrganization', name: 'Al-Rahma Academy', sameAs: 'https://al-rahmaacademy.com' },
      educationalLevel: 'All levels',
      inLanguage: ['en', 'ar'],
      teaches: 'Aqeedah, Fiqh, Seerah, Hadith, Tafsir, Islamic Studies',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    },
  });

  const learnList = isAr ? LEARN.ar : LEARN.en;
  const forList   = isAr ? FOR.ar   : FOR.en;
  const perks     = isAr ? PERKS.ar : PERKS.en;

  return (
    <>
      <Header />
      <main id="main-content" dir={ui.dir}>
        <Breadcrumbs items={[{ label: 'Courses', to: '/courses' }, { label: isAr ? 'الدراسات الإسلامية' : 'Islamic Studies Course' }]} />

        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#1e0a30,#7a3a8a)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🕌 {isAr ? '٥ وحدات دراسية متكاملة' : '5 Complete Modules'}</span>
            <h1 className="cl__hero-title">{isAr ? 'الدراسات الإسلامية' : 'Islamic Studies'}</h1>
            <p className="cl__hero-sub">
              {isAr
                ? 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — يدرّسه علماء معتمدون بلغتك الخاصة.'
                : 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — taught by certified scholars in your own language.'
              }
            </p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate('/enroll?course=islamic-studies')}>
                {ui.bookTrial}
              </button>
              <Link to="/teachers" className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#1e0a30' }}>
          <div className="container cl__stats-inner">
            <div className="cl__stat"><strong>{isAr ? '٥' : '5'}</strong><span>{isAr ? 'وحدات دراسية' : 'Subject Modules'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'جميع المستويات' : 'All Levels'}</strong><span>{isAr ? 'مبتدئ ← متقدم' : 'Beginner → Advanced'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'فردي' : '1-on-1'}</strong><span>{isAr ? 'حصص خاصة' : 'Private Lessons'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٤٠ أسبوعاً' : '40 Weeks'}</strong><span>{isAr ? 'البرنامج الكامل' : 'Full Program'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٦ لغات' : '6 Lang'}</strong><span>{isAr ? 'لغات التدريس' : 'Instruction Languages'}</span></div>
          </div>
        </div>

        {/* Body */}
        <div className="container cl__body">
          <div className="cl__left">

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whatYoullLearn}</h2>
              <ul className="cl__learn-list">
                {learnList.map((pt) => (
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
                  {isAr ? hadith.ar : hadith.en}
                </blockquote>
                <div className="cl__hadith-meta">
                  <span className="cl__hadith-narrator">— {isAr ? hadith.narrator.ar : hadith.narrator.en}</span>
                  <span className="cl__hadith-source">{isAr ? hadith.source.ar : hadith.source.en}</span>
                </div>
                {hadith.url && (
                  <a href={hadith.url} target="_blank" rel="noreferrer" className="cl__hadith-link">
                    {isAr ? 'اقرأ الحديث كاملاً — Sunnah.com ↗' : 'Read full hadith — Sunnah.com ↗'}
                  </a>
                )}
              </div>
            </Reveal>

            {/* Modules */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.modules}</h2>
              <div className="cl__stages">
                {MODULES.map((m, i) => (
                  <div
                    key={m.num}
                    className={`cl__stage${openModule === i ? ' open' : ''}`}
                    style={{ '--stage-color': m.color }}
                  >
                    <button className="cl__stage-header" onClick={() => setOpenModule(openModule === i ? null : i)}>
                      <span className="cl__stage-num" style={{ background: m.color }}>{m.icon}</span>
                      <div className="cl__stage-meta">
                        <strong>{m.num}. {isAr ? m.title.ar : m.title.en}</strong>
                        <span>{isAr ? m.duration.ar : m.duration.en}</span>
                      </div>
                      <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{m.sourceAr}</span>
                      <span className="cl__stage-chevron">{openModule === i ? '▲' : '▼'}</span>
                    </button>
                    {openModule === i && (
                      <div className="cl__stage-body">
                        <p className="cl__stage-author">📚 {isAr ? m.source.ar : m.source.en}</p>
                        <ul className="cl__stage-points">
                          {(isAr ? m.topics.ar : m.topics.en).map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Books */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.authSources}</h2>
              <div className="cl__books">
                {BOOKS.map((b) => <IslamicStudiesBookCard key={b.title} book={b} lang={lang} />)}
              </div>
            </Reveal>

            {/* Who for */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whoFor}</h2>
              <div className="cl__for-grid">
                {forList.map((item) => (
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
                <p className="cl__enroll-title">{isAr ? 'الدراسات الإسلامية' : 'Islamic Studies'}</p>
                <p className="cl__enroll-sub">{isAr ? '٥ وحدات · جميع المستويات' : '5 Modules · All Levels'}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate('/enroll?course=islamic-studies')}>
                  {ui.bookTrial}
                </button>
                <Link to="/teachers" className="cl__enroll-link">{ui.browseTeachers}</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
