import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { TEACHERS } from '../data';

/* Interactive star rating stored in localStorage */
function StarRating({ teacher }) {
  const key = `tutor-rating-${teacher.id}`;
  const [myRating, setMyRating] = useState(() => Number(localStorage.getItem(key) || 0));
  const [hover, setHover] = useState(0);
  const [thanks, setThanks] = useState(false);

  const handle = (n) => {
    setMyRating(n);
    localStorage.setItem(key, String(n));
    setThanks(true);
    setTimeout(() => setThanks(false), 2000);
  };

  const total  = teacher.reviews + (myRating ? 1 : 0);
  const avg    = myRating
    ? ((teacher.rating * teacher.reviews + myRating) / total).toFixed(1)
    : teacher.rating.toFixed(1);
  const filled = Math.round(Number(avg));

  return (
    <div className="tc2__rating">
      <div className="tc2__stars-disp">
        {[1,2,3,4,5].map((s) => (
          <span key={s} className={`tc2__star${s <= filled ? ' on' : ''}`}>★</span>
        ))}
      </div>
      <span className="tc2__avg">{avg}</span>
      <span className="tc2__cnt">({total})</span>

      <div className="tc2__rate-wrap">
        <span className="tc2__rate-lbl">{myRating ? 'Your rating:' : 'Rate:'}</span>
        {[1,2,3,4,5].map((s) => (
          <button
            key={s}
            type="button"
            className={`tc2__rate-btn${(hover || myRating) >= s ? ' lit' : ''}`}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handle(s)}
            aria-label={`Rate ${s} stars`}
          >★</button>
        ))}
        {thanks && <span className="tc2__thanks">✓</span>}
      </div>
    </div>
  );
}

function TutorCard({ t }) {
  const navigate  = useNavigate();
  const initials  = t.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad      = `linear-gradient(145deg, ${t.color}dd, ${t.color}88)`;

  return (
    <Reveal as="article" className="tc2__card">
      {/* Clickable top → teacher profile */}
      <Link to={`/teachers/${t.id}`} className="tc2__top" style={{ background: grad }}>
        <div className="tc2__ring tc2__ring--1" />
        <div className="tc2__ring tc2__ring--2" />
        <div className="tc2__az-badge">🏅 Al-Azhar Certified</div>
        <div className="tc2__avatar">
          <span className="tc2__initials" dir="rtl">{initials}</span>
        </div>
        <div className="tc2__gender">
          {t.gender === 'f' ? '👩‍🏫 Female Instructor' : '👨‍🏫 Male Instructor'}
        </div>
      </Link>

      {/* Body */}
      <div className="tc2__body">
        <Link to={`/teachers/${t.id}`} className="tc2__name-link">
          <h3 className="tc2__name-ar" dir="rtl">{t.nameAr}</h3>
          <p className="tc2__name-en">{t.nameEn}</p>
        </Link>
        <p className="tc2__role">{t.title}</p>

        <div className="tc2__tags">
          {t.specialties.slice(0, 3).map((s) => (
            <span key={s} className="tc2__tag">{s}</span>
          ))}
        </div>

        <StarRating teacher={t} />

        <div className="tc2__actions">
          <Link to={`/teachers/${t.id}`} className="btn btn--ghost btn--sm">
            View Profile
          </Link>
          <button
            type="button"
            className="btn btn--green btn--sm"
            onClick={() => navigate(`/enroll?teacher=${t.id}`)}
          >
            Enroll →
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export default function Tutors() {
  return (
    <section className="tutors2" id="tutors">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Our Team</p>
          <h2>Meet Our Certified Tutors</h2>
          <p className="section-sub">
            Every tutor is a verified Al-Azhar graduate with an authentic Ijazah — personally selected for knowledge, patience and dedication.
          </p>
        </Reveal>

        <Reveal className="tc2__creds-bar">
          {[
            { icon: '🎓', label: 'Al-Azhar Graduate' },
            { icon: '📜', label: 'Ijazah with Sanad' },
            { icon: '👩‍🏫', label: 'Female Tutors Available' },
            { icon: '🌍', label: 'Teaching 40+ Countries' },
          ].map((c) => (
            <div className="tc2__cred" key={c.label}>
              <span className="tc2__cred-icon">{c.icon}</span>
              <span>{c.label}</span>
            </div>
          ))}
        </Reveal>

        <div className="tc2__grid">
          {TEACHERS.map((t) => <TutorCard key={t.id} t={t} />)}
        </div>

        <Reveal className="tc2__footer">
          <Link to="/teachers" className="btn btn--ghost">
            View All Tutors &amp; Full Profiles →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
