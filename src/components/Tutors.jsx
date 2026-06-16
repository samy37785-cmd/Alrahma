import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { TEACHERS } from '../data';
import { useLang } from '../context/LangContext';

function StarRating({ teacher }) {
  const { t } = useLang();
  const ut = t.tutors;
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
        <span className="tc2__rate-lbl">{myRating ? ut.yourRating : ut.rate}</span>
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

function TutorCard({ t: teacher }) {
  const navigate           = useNavigate();
  const { lang, t: i18n } = useLang();
  const tp                 = i18n.tp;
  const ut                 = i18n.tutors;
  const initials           = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad               = `linear-gradient(145deg, ${teacher.color}dd, ${teacher.color}88)`;
  const title              = teacher.title[lang]       || teacher.title.en;
  const specialties        = teacher.specialties[lang] || teacher.specialties.en;

  return (
    <Reveal as="article" className="tc2__card">
      <Link to={`/teachers/${teacher.id}`} className="tc2__top" style={{ background: grad }}>
        <div className="tc2__ring tc2__ring--1" />
        <div className="tc2__ring tc2__ring--2" />
        <div className="tc2__az-badge">{tp.alazharBadge}</div>
        <div className="tc2__avatar">
          <span className="tc2__initials" dir="rtl">{initials}</span>
        </div>
        <div className="tc2__gender">
          {teacher.gender === 'f' ? tp.femaleBadge : tp.maleBadge}
        </div>
      </Link>

      <div className="tc2__body">
        <Link to={`/teachers/${teacher.id}`} className="tc2__name-link">
          <h3 className="tc2__name-ar" dir="rtl">{teacher.nameAr}</h3>
          <p className="tc2__name-en">{teacher.nameEn}</p>
        </Link>
        <p className="tc2__role">{title}</p>

        <div className="tc2__tags">
          {specialties.slice(0, 3).map((s) => (
            <span key={s} className="tc2__tag">{s}</span>
          ))}
        </div>

        <StarRating teacher={teacher} />

        <div className="tc2__actions">
          <Link to={`/teachers/${teacher.id}`} className="btn btn--ghost btn--sm">
            {ut.viewProfile}
          </Link>
          <button
            type="button"
            className="btn btn--green btn--sm"
            onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
          >
            {ut.enroll}
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export default function Tutors() {
  const { t: i18n } = useLang();
  const ut = i18n.tutors;
  const credIcons = ['🎓', '📜', '👩‍🏫', '🌍'];

  return (
    <section className="tutors2" id="tutors">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{ut.eyebrow}</p>
          <h2>{ut.heading}</h2>
          <p className="section-sub">{ut.sub}</p>
        </Reveal>

        <Reveal className="tc2__creds-bar">
          {ut.creds.map((label, i) => (
            <div className="tc2__cred" key={label}>
              <span className="tc2__cred-icon">{credIcons[i]}</span>
              <span>{label}</span>
            </div>
          ))}
        </Reveal>

        <div className="tc2__grid">
          {TEACHERS.map((t) => <TutorCard key={t.id} t={t} />)}
        </div>

        <Reveal className="tc2__footer">
          <Link to="/teachers" className="btn btn--ghost">
            {ut.viewAll}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
