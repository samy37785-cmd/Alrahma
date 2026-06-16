import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { TEACHERS, TEACHER_CREDENTIALS as CREDENTIALS } from '../data';

const FLAG = { en:'🇬🇧', ar:'🇪🇬', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', es:'🇪🇸' };
const ALL_SUBJECTS = [
  { id:'all',     label:'All subjects' },
  { id:'quran',   label:'Quran'        },
  { id:'tajweed', label:'Tajweed'      },
  { id:'hifz',    label:'Hifz'         },
  { id:'ijazah',  label:'Ijazah'       },
  { id:'arabic',  label:'Arabic'       },
  { id:'islamic', label:'Islamic Studies' },
  { id:'tafsir',  label:'Tafsir'       },
  { id:'seerah',  label:'Seerah'       },
];

/* Interactive star rating */
function StarRow({ teacher }) {
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
      <span className="tpg__cnt">({total} reviews)</span>
      <div className="tpg__rate">
        <span>Rate:</span>
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

function TeacherCard({ t, onEnroll }) {
  const [expanded, setExpanded] = useState(false);
  const initials = t.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  return (
    <article className="tpg__card">
      {/* Left: avatar column */}
      <div className="tpg__avatar-col" style={{ background: `linear-gradient(160deg,${t.color}ee,${t.color}99)` }}>
        <div className="tpg__avatar">
          <span dir="rtl">{initials}</span>
        </div>
        <div className="tpg__gender-badge">
          {t.gender === 'f' ? '👩‍🏫 Female' : '👨‍🏫 Male'}
        </div>
        <div className="tpg__az-badge">🏅 Al-Azhar</div>
      </div>

      {/* Right: info */}
      <div className="tpg__info">
        <div className="tpg__names">
          <h2 className="tpg__name-ar" dir="rtl">{t.nameAr}</h2>
          <p className="tpg__name-en">{t.nameEn}</p>
          <p className="tpg__role">{t.title}</p>
        </div>

        <StarRow teacher={t} />

        {/* Languages */}
        <div className="tpg__langs">
          {t.langs.map((l) => (
            <span key={l} className="tpg__lang">{FLAG[l]} {l.toUpperCase()}</span>
          ))}
        </div>

        {/* Specialties */}
        <div className="tpg__tags">
          {t.specialties.map((s) => (
            <span key={s} className="tpg__tag">{s}</span>
          ))}
        </div>

        {/* Bio */}
        <div className={`tpg__bio${expanded ? ' open' : ''}`}>
          <p>{t.bio}</p>
        </div>
        <button className="tpg__bio-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less ↑' : 'Read bio ↓'}
        </button>

        {/* Credentials */}
        <ul className="tpg__creds">
          {CREDENTIALS.map((c) => (
            <li key={c.label}><span>{c.icon}</span> {c.label}</li>
          ))}
        </ul>

        <button type="button" className="btn btn--green tpg__enroll-btn" onClick={() => onEnroll(t.id)}>
          Enroll with {t.nameEn.split(' ')[0]} →
        </button>
      </div>
    </article>
  );
}

export default function Teachers() {
  useSEO({
    title: 'Our Teachers — AL-Rahma Academy',
    description: 'Meet our qualified Al-Azhar certified Quran and Arabic tutors. All teachers hold an Ijazah with a verified sanad.',
  });

  const navigate = useNavigate();
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterGender,  setFilterGender]  = useState('all');
  const [filterLang,    setFilterLang]    = useState('all');

  const filtered = TEACHERS.filter((t) => {
    if (filterSubject !== 'all' && !t.subjects.includes(filterSubject)) return false;
    if (filterGender  !== 'all' && t.gender !== filterGender)            return false;
    if (filterLang    !== 'all' && !t.langs.includes(filterLang))        return false;
    return true;
  });

  const onEnroll = (id) => navigate(`/enroll?teacher=${id}`);

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="tpg__hero">
          <div className="container tpg__hero-inner">
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>Meet the team</p>
            <h1>Our Qualified Instructors</h1>
            <p className="tpg__hero-sub">
              Every teacher at AL-Rahma Academy is a verified graduate of Al-Azhar University,
              holding an authentic Ijazah with an unbroken chain of narration (Sanad).
            </p>
            <div className="tpg__hero-badges">
              <span>🎓 Al-Azhar Certified</span>
              <span>📜 Ijazah Holders</span>
              <span>👩‍🏫 Female Tutors Available</span>
              <span>🌍 Teaching in 40+ Countries</span>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <div className="tpg__stats-bar">
          <div className="container tpg__stats-inner">
            {[
              { n: '7+',    l: 'Expert Tutors'     },
              { n: '1,200+',l: 'Students Taught'   },
              { n: '4.9★',  l: 'Average Rating'    },
              { n: '40+',   l: 'Countries Reached' },
            ].map((s) => (
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
              <span className="tpg__filter-label">Subject:</span>
              <div className="tpg__filter-btns">
                {ALL_SUBJECTS.map((s) => (
                  <button key={s.id} type="button"
                    className={`tpg__filter-btn${filterSubject === s.id ? ' active' : ''}`}
                    onClick={() => setFilterSubject(s.id)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="tpg__filter-group">
              <span className="tpg__filter-label">Gender:</span>
              <div className="tpg__filter-btns">
                {[{v:'all',l:'All'},{v:'m',l:'Male'},{v:'f',l:'Female'}].map((o) => (
                  <button key={o.v} type="button"
                    className={`tpg__filter-btn${filterGender === o.v ? ' active' : ''}`}
                    onClick={() => setFilterGender(o.v)}>{o.l}</button>
                ))}
              </div>
            </div>
            <div className="tpg__filter-group">
              <span className="tpg__filter-label">Language:</span>
              <div className="tpg__filter-btns">
                {[{v:'all',l:'All'},{v:'en',l:'🇬🇧 EN'},{v:'it',l:'🇮🇹 IT'},{v:'fr',l:'🇫🇷 FR'},{v:'de',l:'🇩🇪 DE'},{v:'es',l:'🇪🇸 ES'}].map((o) => (
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
              <p className="tpg__empty">No teachers match the selected filters. <button className="tpg__reset" onClick={() => { setFilterSubject('all'); setFilterGender('all'); setFilterLang('all'); }}>Reset filters</button></p>
            ) : (
              <div className="tpg__list">
                {filtered.map((t) => <TeacherCard key={t.id} t={t} onEnroll={onEnroll} />)}
              </div>
            )}
          </div>
        </section>

        {/* CTA */}
        <section className="tpg__cta">
          <div className="container tpg__cta-inner">
            <h2>Ready to start your Quran journey?</h2>
            <p>Book two free trial lessons — no payment required.</p>
            <button type="button" className="btn btn--gold btn--lg" onClick={() => navigate('/enroll')}>
              Start Enrollment →
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
