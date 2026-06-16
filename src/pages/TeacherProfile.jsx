import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data';

const FLAG = { en:'🇬🇧', ar:'🇪🇬', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', es:'🇪🇸' };
const LANG_LABEL = { en:'English', ar:'Arabic', it:'Italian', fr:'French', de:'German', es:'Spanish' };

function InteractiveStars({ teacher }) {
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
      <span className="tp__cnt">({total} reviews)</span>
      <div className="tp__rate-row">
        <span className="tp__rate-lbl">Rate this teacher:</span>
        {[1,2,3,4,5].map((s) => (
          <button key={s} type="button"
            className={`tp__rate-btn${(hover || myRating) >= s ? ' lit' : ''}`}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
            onClick={() => handle(s)} aria-label={`Rate ${s} stars`}>★</button>
        ))}
        {thanks && <span className="tp__thanks">✓ Thank you!</span>}
      </div>
    </div>
  );
}

export default function TeacherProfile() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const teacher  = TEACHERS.find((t) => t.id === Number(id));

  useSEO({
    title: teacher ? `${teacher.nameEn} — AL-Rahma Academy` : 'Teacher — AL-Rahma Academy',
    description: teacher?.bio || '',
  });

  if (!teacher) {
    return (
      <>
        <Header />
        <main style={{ padding: '80px 0', textAlign: 'center' }}>
          <h2>Teacher not found.</h2>
          <Link to="/teachers" className="btn btn--green" style={{ marginTop: '24px' }}>
            ← Back to all teachers
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const initials = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad     = `linear-gradient(145deg, ${teacher.color}ee, ${teacher.color}99)`;

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
              <span className="tp__az-badge">🏅 Al-Azhar Certified</span>
              <h1 className="tp__name-ar" dir="rtl">{teacher.nameAr}</h1>
              <p className="tp__name-en">{teacher.nameEn}</p>
              <p className="tp__role">{teacher.title}</p>
              <p className="tp__gender">{teacher.gender === 'f' ? '👩‍🏫 Female Instructor' : '👨‍🏫 Male Instructor'}</p>
              <div className="tp__hero-actions">
                <button type="button" className="btn btn--gold btn--lg"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}>
                  Enroll with {teacher.nameEn.split(' ')[0]} →
                </button>
                <Link to="/teachers" className="btn btn--ghost-white">← All Teachers</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <div className="tp__strip">
          <div className="container tp__strip-inner">
            <div className="tp__strip-stat">
              <strong>★ {teacher.rating.toFixed(1)}</strong>
              <span>{teacher.reviews} reviews</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.gender === 'f' ? 'Female' : 'Male'}</strong>
              <span>Instructor</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.langs.length}</strong>
              <span>Teaching languages</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.specialties.length}</strong>
              <span>Specialties</span>
            </div>
          </div>
        </div>

        <div className="container tp__body">
          {/* Left column */}
          <div className="tp__left">
            {/* Bio */}
            <div className="tp__section">
              <h2>About {teacher.nameEn.split(' ')[0]}</h2>
              <p className="tp__bio">{teacher.bio}</p>
            </div>

            {/* Credentials */}
            <div className="tp__section">
              <h2>Credentials</h2>
              <ul className="tp__creds">
                {TEACHER_CREDENTIALS.map((c) => (
                  <li key={c.label} className="tp__cred">
                    <span className="tp__cred-icon">{c.icon}</span>
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Specialties */}
            <div className="tp__section">
              <h2>Specialties</h2>
              <div className="tp__tags">
                {teacher.specialties.map((s) => (
                  <span key={s} className="tp__tag">{s}</span>
                ))}
              </div>
            </div>

            {/* Languages */}
            <div className="tp__section">
              <h2>Teaching Languages</h2>
              <div className="tp__langs">
                {teacher.langs.map((l) => (
                  <div key={l} className="tp__lang">
                    <span className="tp__lang-flag">{FLAG[l]}</span>
                    <span>{LANG_LABEL[l]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive rating */}
            <div className="tp__section">
              <h2>Student Rating</h2>
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
                <h3>Enroll with {teacher.nameEn.split(' ')[0]}</h3>
                <p>Start with 2 free trial lessons — no payment required.</p>
                <ul className="tp__enroll-perks">
                  <li>✓ One-to-one lesson</li>
                  <li>✓ Flexible schedule</li>
                  <li>✓ Any device — Zoom or Skype</li>
                  <li>✓ Cancel anytime</li>
                </ul>
                <button
                  type="button"
                  className="btn btn--gold btn--block"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
                >
                  Start Enrollment →
                </button>
                <Link
                  to="/teachers"
                  className="tp__back-link"
                >
                  ← Browse other teachers
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
