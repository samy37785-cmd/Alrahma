import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import MobileCarousel from './ui/MobileCarousel';
import { TEACHERS } from '../data';
import { useLang } from '../context/LangContext';

// Static, honest star rating. This used to let any visitor "rate" the tutor
// via a button that only wrote to their own browser's localStorage and
// recomputed a fake blended average never seen by anyone else — the same
// anti-pattern already fixed on TeacherProfile.jsx and Teachers.jsx. TEACHERS
// is a fictional marketing directory with no real backend account behind it,
// so this shows only the static editorial rating/reviews figures.
function StarRating({ teacher }) {
  const filled = Math.round(teacher.rating);

  return (
    <div className="tc2__rating">
      <div className="tc2__stars-disp">
        {[1,2,3,4,5].map((s) => (
          <span key={s} className={`tc2__star${s <= filled ? ' on' : ''}`}>★</span>
        ))}
      </div>
      <span className="tc2__avg">{teacher.rating.toFixed(1)}</span>
      <span className="tc2__cnt">({teacher.reviews})</span>
    </div>
  );
}

function TutorCard({ t: teacher }) {
  const navigate              = useNavigate();
  const { lang, t: i18n }    = useLang();
  const tp                    = i18n.tp;
  const ut                    = i18n.tutors;
  const initials              = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad                  = `linear-gradient(145deg, ${teacher.color}dd, ${teacher.color}88)`;
  const title                 = teacher.title[lang]       || teacher.title.en;
  const specialties           = teacher.specialties[lang] || teacher.specialties.en;
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <Reveal as="article" className="tc2__card" style={{ '--card-color': teacher.color }}>
      {/* Video modal */}
      {videoOpen && teacher.videoUrl && (
        <div
          className="tc2__video-overlay"
          onClick={() => setVideoOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Introduction video for ${teacher.nameEn}`}
        >
          <div className="tc2__video-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              className="tc2__video-close"
              onClick={() => setVideoOpen(false)}
              aria-label="Close video"
            >×</button>
            <iframe
              src={teacher.videoUrl}
              title={`${teacher.nameEn} introduction`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
            />
          </div>
        </div>
      )}

      <Link to={`/teachers/${teacher.id}`} className="tc2__top" style={{ background: grad }}>
        <div className="tc2__ring tc2__ring--1" />
        <div className="tc2__ring tc2__ring--2" />
        <div className="tc2__az-badge">{tp.alazharBadge}</div>
        <div className="tc2__avatar">
          <span className="tc2__initials" dir="rtl">{initials}</span>
        </div>
        {/* Video play button */}
        {teacher.videoUrl && (
          <button
            className="tc2__video-play"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setVideoOpen(true); }}
            aria-label={`Watch ${teacher.nameEn}'s introduction`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            {ut.introVideo}
          </button>
        )}
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

        {teacher.hours && (
          <div className="tc2__hours">⏱ {teacher.hours} {ut.teachingHrs}</div>
        )}

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

/* Inline SVG icons — same Lucide-style used across the homepage, replacing
   raw emoji so the credentials bar matches the rest of the icon language. */
const CRED_ICONS = [
  /* Al-Azhar Certified */
  <svg key="grad" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>,
  /* Ijazah chain / certification document */
  <svg key="doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h8a2 2 0 0 0 2-2V9l-6-6H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/>
    <path d="M12 3v6h6"/>
  </svg>,
  /* Female tutors available */
  <svg key="tutor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>,
  /* Multilingual / global */
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>,
];

export default function Tutors() {
  const { t: i18n } = useLang();
  const ut = i18n.tutors;

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
              <span className="tc2__cred-icon">{CRED_ICONS[i]}</span>
              <span>{label}</span>
            </div>
          ))}
        </Reveal>

        <MobileCarousel trackClassName="tc2__grid" ariaLabel={ut.heading}>
          {TEACHERS.map((t) => <TutorCard key={t.id} t={t} />)}
        </MobileCarousel>

        <Reveal className="tc2__footer">
          <Link to="/teachers" className="btn btn--ghost">
            {ut.viewAll}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
