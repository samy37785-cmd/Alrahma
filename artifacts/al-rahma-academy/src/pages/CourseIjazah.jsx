import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang, withLanguage } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';
import { IJAZAH_TEXT } from '../i18n/courses/ijazah';
import { IJAZAH_STAGES, IJAZAH_BOOKS } from '../data/courses/ijazah';
import { site } from '../data/site';

/* ─── Book card with expand ─── */
function BookCard({ book, text }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          <strong>{book.title}</strong>
          <span className="cl__book-ar" dir="rtl">{book.ar}</span>
          <span className="cl__book-author">{text.author}</span>
          <span className="cl__book-note">{text.stage}</span>
        </div>
        <span className="cl__book-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="cl__book-body">
          <p className="cl__book-desc">{text.desc}</p>
          <ul className="cl__book-topics">
            {text.topics.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {book.link
            ? <a href={book.link} target="_blank" rel="noreferrer" className="cl__book-link">{text.linkLabel} ↗</a>
            : <span className="cl__book-link cl__book-link--muted">📚 {text.linkLabel}</span>
          }
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */
export default function CourseIjazah() {
  const navigate = useNavigate();
  const { lang, t: siteT } = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const t         = IJAZAH_TEXT[lang] || IJAZAH_TEXT.en;
  const [openStage, setOpenStage] = useState(null);

  useSEO({
    title: t.seo.title,
    description: t.seo.description,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Quran Ijazah Certification Course',
      description: "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars.",
      provider: { '@type': 'EducationalOrganization', name: 'Al-Rahma Academy', sameAs: site.origin },
      educationalLevel: 'Advanced',
      inLanguage: ['en', 'ar'],
      teaches: 'Quran Ijazah, Tajweed, Matn Al-Jazariyyah, Al-Shatibiyyah, Seven Qira\'at',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    },
  });

  return (
    <>
      <Header />
      <main id="main-content" dir={ui.dir}>
        <Breadcrumbs items={[{ label: siteT.nav.courses, to: '/courses' }, { label: t.breadcrumbLabel }]} />
        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#062d1f,#0b6e4f)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🏅 {t.hero.badge}</span>
            <h1 className="cl__hero-title">{t.hero.title}</h1>
            <p className="cl__hero-sub">{t.hero.sub}</p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate(withLanguage('/enroll?course=ijazah', lang))}>
                {ui.bookTrial}
              </button>
              <Link to={withLanguage('/academy/teachers', lang)} className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#062d1f' }}>
          <div className="container cl__stats-inner">
            {t.stats.map((s) => (
              <div key={s.label} className="cl__stat"><strong>{s.value}</strong><span>{s.label}</span></div>
            ))}
            <div className="cl__stat"><strong>🏅</strong><span>{ui.officialCert}</span></div>
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

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.curriculum}</h2>
              <div className="cl__stages">
                {IJAZAH_STAGES.map((s, i) => {
                  const st = t.stages[s.id];
                  return (
                    <div
                      key={s.id}
                      className={`cl__stage${openStage === i ? ' open' : ''}`}
                      style={{ '--stage-color': s.color }}
                    >
                      <button className="cl__stage-header" onClick={() => setOpenStage(openStage === i ? null : i)}>
                        <span className="cl__stage-num" style={{ background: s.color }}>{s.num}</span>
                        <div className="cl__stage-meta">
                          <strong>{st.title}</strong>
                          <span>{st.duration}</span>
                        </div>
                        <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{s.source}</span>
                        <span className="cl__stage-chevron">{openStage === i ? '▲' : '▼'}</span>
                      </button>
                      {openStage === i && (
                        <div className="cl__stage-body">
                          <p className="cl__stage-author">📚 {st.sourceLine}</p>
                          <ul className="cl__stage-points">
                            {st.points.map((pt) => <li key={pt}>{pt}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.sources}</h2>
              <div className="cl__books">
                {IJAZAH_BOOKS.map((b) => <BookCard key={b.id} book={b} text={t.books[b.id]} />)}
              </div>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.prerequisites}</h2>
              <div className="cl__prereqs">
                {t.prereqs.map((p) => (
                  <div key={p.text} className="cl__prereq">
                    <span className="cl__prereq-icon">{p.icon}</span>
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            </Reveal>

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
              <div className="cl__enroll-card-top" style={{ background: 'linear-gradient(145deg,#062d1f,#0b6e4f)' }}>
                <span className="cl__enroll-icon">📜</span>
                <p className="cl__enroll-title">{t.enrollCard.title}</p>
                <p className="cl__enroll-sub">🏅 {ui.officialCert}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {t.perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate(withLanguage('/enroll?course=ijazah', lang))}>
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
