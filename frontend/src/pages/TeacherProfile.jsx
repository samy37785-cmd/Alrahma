import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data';
import { useLang } from '../context/LangContext';

const FLAG = { en:'🇬🇧', ar:'🇪🇬', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', es:'🇪🇸' };
const LANG_LABEL = { en:'English', ar:'Arabic', it:'Italian', fr:'French', de:'German', es:'Spanish' };

function InteractiveStars({ teacher }) {
  const { t } = useLang();
  const tp = t.tp;
  const key = `tc-rating-${teacher.id}`;
  const [myRating, setMyRating] = useState(() => Number(localStorage.getItem(key) || 0));
  const [hover, setHover]       = useState(0);
  const [thanks, setThanks]     = useState(false);

  const handle = (n) => {
    setMyRating(n); localStorage.setItem(key, String(n));
    setThanks(true); setTimeout(() => setThanks(false), 2200);
  };
  const total  = teacher.reviews + (myRating ? 1 : 0);
  const avg    = myRating
    ? ((teacher.rating * teacher.reviews + myRating) / total).toFixed(1)
    : teacher.rating.toFixed(1);
  const filled = Math.round(Number(avg));

  return (
    <div className="tp__rating">
      <div className="tp__stars">
        {[1,2,3,4,5].map((s) => (
          <span key={s} className={`tp__star${s <= filled ? ' on' : ''}`}>★</span>
        ))}
      </div>
      <span className="tp__avg">{avg}</span>
      <span className="tp__cnt">({total} {tp.reviews})</span>
      <div className="tp__rate-row">
        <span className="tp__rate-lbl">{tp.rateThis}</span>
        {[1,2,3,4,5].map((s) => (
          <button key={s} type="button"
            className={`tp__rate-btn${(hover || myRating) >= s ? ' lit' : ''}`}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
            onClick={() => handle(s)} aria-label={`Rate ${s} stars`}>★</button>
        ))}
        {thanks && <span className="tp__thanks">{tp.thanks}</span>}
      </div>
    </div>
  );
}

export default function TeacherProfile() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const tp = t.tp;
  const teacher  = TEACHERS.find((tc) => tc.id === Number(id));

  const title       = teacher ? (teacher.title[lang]       || teacher.title.en)       : '';
  const bio         = teacher ? (teacher.bio[lang]         || teacher.bio.en)         : '';
  const specialties = teacher ? (teacher.specialties[lang] || teacher.specialties.en) : [];

  useSEO({
    title: teacher ? `${teacher.nameEn} — AL-Rahma Academy` : 'Teacher — AL-Rahma Academy',
    description: bio,
  });

  if (!teacher) {
    return (
      <>
        <Header />
        <main style={{ padding: '80px 0', textAlign: 'center' }}>
          <h2>{tp.notFound}</h2>
          <Link to="/teachers" className="btn btn--green" style={{ marginTop: '24px' }}>
            {tp.backToAll}
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const firstName = teacher.nameEn.split(' ')[0];
  const initials  = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad      = `linear-gradient(145deg, ${teacher.color}ee, ${teacher.color}99)`;

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="tp__hero" style={{ background: grad }}>
          <div className="container tp__hero-inner">
            <div className="tp__hero-avatar">
              <span dir="rtl">{initials}</span>
            </div>
            <div className="tp__hero-info">
              <span className="tp__az-badge">{tp.alazharBadge}</span>
              <h1 className="tp__name-ar" dir="rtl">{teacher.nameAr}</h1>
              <p className="tp__name-en">{teacher.nameEn}</p>
              <p className="tp__role">{title}</p>
              <p className="tp__gender">{teacher.gender === 'f' ? tp.femaleBadge : tp.maleBadge}</p>
              <div className="tp__hero-actions">
                <button type="button" className="btn btn--gold btn--lg"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}>
                  {tp.enrollWith} {firstName} →
                </button>
                <Link to="/teachers" className="btn btn--ghost-white">{tp.allTeachers}</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <div className="tp__strip">
          <div className="container tp__strip-inner">
            <div className="tp__strip-stat">
              <strong>★ {teacher.rating.toFixed(1)}</strong>
              <span>{teacher.reviews} {tp.reviews}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.gender === 'f' ? tp.female : tp.male}</strong>
              <span>{tp.instructor}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.langs.length}</strong>
              <span>{tp.teachingLangs}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{specialties.length}</strong>
              <span>{tp.specialties}</span>
            </div>
          </div>
        </div>

        <div className="container tp__body">
          {/* Left column */}
          <div className="tp__left">
            <div className="tp__section">
              <h2>{tp.about} {firstName}</h2>
              <p className="tp__bio">{bio}</p>
            </div>

            <div className="tp__section">
              <h2>{tp.credentials}</h2>
              <ul className="tp__creds">
                {TEACHER_CREDENTIALS.map((c) => (
                  <li key={c.label.en} className="tp__cred">
                    <span className="tp__cred-icon">{c.icon}</span>
                    <span>{c.label[lang] || c.label.en}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tp__section">
              <h2>{tp.specialties}</h2>
              <div className="tp__tags">
                {specialties.map((s) => (
                  <span key={s} className="tp__tag">{s}</span>
                ))}
              </div>
            </div>

            <div className="tp__section">
              <h2>{tp.teachingLangs}</h2>
              <div className="tp__langs">
                {teacher.langs.map((l) => (
                  <div key={l} className="tp__lang">
                    <span className="tp__lang-flag">{FLAG[l]}</span>
                    <span>{LANG_LABEL[l]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="tp__section">
              <h2>{tp.studentRating}</h2>
              <InteractiveStars teacher={teacher} />
            </div>
          </div>

          {/* Right: sticky enroll card */}
          <div className="tp__right">
            <div className="tp__enroll-card">
              <div className="tp__enroll-card-top" style={{ background: grad }}>
                <div className="tp__enroll-avatar">
                  <span dir="rtl">{initials}</span>
                </div>
              </div>
              <div className="tp__enroll-body">
                <h3>{tp.enrollWith} {firstName}</h3>
                <p>{tp.trialDesc}</p>
                <ul className="tp__enroll-perks">
                  {tp.perks.map((perk, i) => <li key={i}>{perk}</li>)}
                </ul>
                <button
                  type="button"
                  className="btn btn--gold btn--block"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
                >
                  {tp.startEnroll}
                </button>
                <Link to="/teachers" className="tp__back-link">
                  {tp.browseOthers}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
