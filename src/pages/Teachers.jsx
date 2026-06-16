import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { TEACHERS, TEACHER_CREDENTIALS as CREDENTIALS } from '../data';

const FLAG = { en:'🇬🇧', ar:'🇪🇬', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', es:'🇪🇸' };

/* Interactive star rating */
function StarRow({ teacher, ui }) {
  const key = `tc-rating-${teacher.id}`;
  const [myRating, setMyRating] = useState(() => Number(localStorage.getItem(key) || 0));
  const [hover, setHover] = useState(0);
  const [thanks, setThanks] = useState(false);

  const handle = (n) => {
    setMyRating(n); localStorage.setItem(key, String(n));
    setThanks(true); setTimeout(() => setThanks(false), 2000);
  };
  const total = teacher.reviews + (myRating ? 1 : 0);
  const avg   = myRating
    ? ((teacher.rating * teacher.reviews + myRating) / total).toFixed(1)
    : teacher.rating.toFixed(1);
  const filled = Math.round(Number(avg));

  return (
    <div className="tpg__rating">
      <div className="tpg__stars">
        {[1,2,3,4,5].map((s) => (
          <span key={s} className={`tpg__star${s <= filled ? ' on' : ''}`}>★</span>
        ))}
      </div>
      <span className="tpg__avg">{avg}</span>
      <span className="tpg__cnt">({total} {ui.reviews})</span>
      <div className="tpg__rate">
        <span>{ui.rate}</span>
        {[1,2,3,4,5].map((s) => (
          <button key={s} type="button"
            className={`tpg__rate-btn${(hover || myRating) >= s ? ' lit' : ''}`}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
            onClick={() => handle(s)} aria-label={`Rate ${s}`}>★</button>
        ))}
        {thanks && <span className="tpg__thanks">✓</span>}
      </div>
    </div>
  );
}

function TeacherCard({ teacher, onEnroll, ui, lang }) {
  const [expanded, setExpanded] = useState(false);
  const isAr = lang === 'ar';
  const initials = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const title      = teacher.title[lang]      || teacher.title.en;
  const specialties = teacher.specialties[lang] || teacher.specialties.en;
  return (
    <article className="tpg__card">
      {/* Left: avatar column */}
      <div className="tpg__avatar-col" style={{ background: `linear-gradient(160deg,${teacher.color}ee,${teacher.color}99)` }}>
        <div className="tpg__avatar">
          <span dir="rtl">{initials}</span>
        </div>
        <div className="tpg__gender-badge">
          {teacher.gender === 'f' ? ui.female : ui.male}
        </div>
        <div className="tpg__az-badge">{ui.alazhar}</div>
      </div>

      {/* Right: info */}
      <div className="tpg__info">
        <div className="tpg__names">
          <h2 className="tpg__name-ar" dir="rtl">{teacher.nameAr}</h2>
          <p className="tpg__name-en">{teacher.nameEn}</p>
          <p className="tpg__role">{title}</p>
        </div>

        <StarRow teacher={teacher} ui={ui} />

        {/* Languages */}
        <div className="tpg__langs">
          {teacher.langs.map((l) => (
            <span key={l} className="tpg__lang">{FLAG[l]} {l.toUpperCase()}</span>
          ))}
        </div>

        {/* Specialties */}
        <div className="tpg__tags">
          {specialties.map((s) => (
            <span key={s} className="tpg__tag">{s}</span>
          ))}
        </div>

        {/* Bio */}
        <div className={`tpg__bio${expanded ? ' open' : ''}`}>
          <p>{teacher.bio[lang] || teacher.bio.en}</p>
        </div>
        <button className="tpg__bio-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? ui.showLess : ui.readBio}
        </button>

        {/* Credentials */}
        <ul className="tpg__creds">
          {CREDENTIALS.map((c) => (
            <li key={c.label.en}><span>{c.icon}</span> {c.label[lang] || c.label.en}</li>
          ))}
        </ul>

        <button type="button" className="btn btn--green tpg__enroll-btn" onClick={() => onEnroll(teacher.id)}>
          {ui.enrollWith} {teacher.nameEn.split(' ')[0]} {isAr ? '←' : '→'}
        </button>
      </div>
    </article>
  );
}

export default function Teachers() {
  const { t, lang } = useLang();
  const ui = t.teachersPg;
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'معلمونا — أكاديمية الرحمة' : 'Our Teachers — AL-Rahma Academy',
    description: isAr
      ? 'تعرف على معلمينا المعتمدين من الأزهر، خبراء في القرآن والتجويد والدراسات الإسلامية.'
      : 'Meet our qualified Al-Azhar certified Quran and Arabic tutors. All teachers hold an Ijazah with a verified sanad.',
  });

  const navigate = useNavigate();
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterGender,  setFilterGender]  = useState('all');
  const [filterLang,    setFilterLang]    = useState('all');

  const filtered = TEACHERS.filter((teacher) => {
    if (filterSubject !== 'all' && !teacher.subjects.includes(filterSubject)) return false;
    if (filterGender  !== 'all' && teacher.gender !== filterGender)           return false;
    if (filterLang    !== 'all' && !teacher.langs.includes(filterLang))       return false;
    return true;
  });

  const onEnroll = (id) => navigate(`/enroll?teacher=${id}`);

  const langFilters = [
    { v:'all', l: isAr ? 'الكل' : 'All' },
    { v:'en',  l:'🇬🇧 EN' }, { v:'it', l:'🇮🇹 IT' },
    { v:'fr',  l:'🇫🇷 FR' }, { v:'de', l:'🇩🇪 DE' },
    { v:'es',  l:'🇪🇸 ES' },
  ];

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="tpg__hero">
          <div className="container tpg__hero-inner">
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>{ui.eyebrow}</p>
            <h1>{ui.title}</h1>
            <p className="tpg__hero-sub">{ui.sub}</p>
            <div className="tpg__hero-badges">
              {ui.badges.map((b) => <span key={b}>{b}</span>)}
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <div className="tpg__stats-bar">
          <div className="container tpg__stats-inner">
            {ui.stats.map((s) => (
              <div key={s.l} className="tpg__stat">
                <strong>{s.n}</strong>
                <span>{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="tpg__filters">
          <div className="container tpg__filters-inner">
            <div className="tpg__filter-group">
              <span className="tpg__filter-label">{ui.filterSubject}</span>
              <div className="tpg__filter-btns">
                {ui.subjects.map((s) => (
                  <button key={s.id} type="button"
                    className={`tpg__filter-btn${filterSubject === s.id ? ' active' : ''}`}
                    onClick={() => setFilterSubject(s.id)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="tpg__filter-group">
              <span className="tpg__filter-label">{ui.filterGender}</span>
              <div className="tpg__filter-btns">
                {ui.genders.map((o) => (
                  <button key={o.v} type="button"
                    className={`tpg__filter-btn${filterGender === o.v ? ' active' : ''}`}
                    onClick={() => setFilterGender(o.v)}>{o.l}</button>
                ))}
              </div>
            </div>
            <div className="tpg__filter-group">
              <span className="tpg__filter-label">{ui.filterLang}</span>
              <div className="tpg__filter-btns">
                {langFilters.map((o) => (
                  <button key={o.v} type="button"
                    className={`tpg__filter-btn${filterLang === o.v ? ' active' : ''}`}
                    onClick={() => setFilterLang(o.v)}>{o.l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Teacher cards */}
        <section className="tpg__section">
          <div className="container">
            {filtered.length === 0 ? (
              <p className="tpg__empty">
                {ui.noMatch}{' '}
                <button className="tpg__reset" onClick={() => { setFilterSubject('all'); setFilterGender('all'); setFilterLang('all'); }}>
                  {ui.resetFilters}
                </button>
              </p>
            ) : (
              <div className="tpg__list">
                {filtered.map((teacher) => (
                  <TeacherCard key={teacher.id} teacher={teacher} onEnroll={onEnroll} ui={ui} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA */}
        <section className="tpg__cta">
          <div className="container tpg__cta-inner">
            <h2>{ui.ctaTitle}</h2>
            <p>{ui.ctaSub}</p>
            <button type="button" className="btn btn--gold btn--lg" onClick={() => navigate('/enroll')}>
              {ui.ctaBtn}
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
