import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from '../../ui/Reveal';
import { TEACHERS } from '../../../data';
import { useLang } from '../../../context/LangContext';

/* Inline SVG icons — Lucide-style, consistent with the rest of the homepage. */
const STAR_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
  </svg>
);
const CHECK_BADGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 12 2 2 4-4" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);
const CLOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const REVIEWS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </svg>
);
const PLAY_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

/* Credentials bar icons (unchanged from Round 2's emoji sweep). */
const CRED_ICONS = [
  <svg key="grad" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>,
  <svg key="doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h8a2 2 0 0 0 2-2V9l-6-6H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/>
    <path d="M12 3v6h6"/>
  </svg>,
  <svg key="tutor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>,
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>,
];

const initialsOf = (nameAr) => nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');

function VideoModal({ teacher, onClose }) {
  return (
    <div
      className="tc3__video-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Introduction video for ${teacher.nameEn}`}
    >
      <div className="tc3__video-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="tc3__video-close" onClick={onClose} aria-label="Close video">×</button>
        <iframe
          src={teacher.videoUrl}
          title={`${teacher.nameEn} introduction`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
        />
      </div>
    </div>
  );
}

function TutorAvatar({ teacher, tp, initials, size = 'md', onPlay }) {
  return (
    <div className={`tc3__avatar-col tc3__avatar-col--${size}`}>
      <Link
        to={`/teachers/${teacher.id}`}
        className="tc3__avatar-ring"
        style={{ '--avatar-ring-color': teacher.color }}
      >
        <span className="tc3__initials" dir="rtl">{initials}</span>
      </Link>
      <span className="tc3__verified" title={tp.alazharBadge} aria-label={tp.alazharBadge}>
        {CHECK_BADGE_ICON}
      </span>
      {teacher.videoUrl && (
        <button
          type="button"
          className="tc3__play"
          onClick={onPlay}
          aria-label={`Watch ${teacher.nameEn}'s introduction`}
        >
          {PLAY_ICON}
        </button>
      )}
    </div>
  );
}

function RatingPill({ teacher, size = 'md' }) {
  return (
    <span
      className={`tc3__rating-pill tc3__rating-pill--${size}`}
      aria-label={`Rated ${teacher.rating.toFixed(1)} out of 5 from ${teacher.reviews} reviews`}
    >
      <span className="tc3__rating-star" aria-hidden="true">{STAR_ICON}</span>
      {teacher.rating.toFixed(1)}
    </span>
  );
}

function TutorCard({ t: teacher }) {
  const navigate = useNavigate();
  const { lang, t: i18n } = useLang();
  const tp = i18n.tp;
  const ut = i18n.tutors;
  const initials = initialsOf(teacher.nameAr);
  const title = teacher.title[lang] || teacher.title.en;
  const specialties = teacher.specialties[lang] || teacher.specialties.en;
  const [videoOpen, setVideoOpen] = useState(false);
  const genderLabel = teacher.gender === 'f' ? tp.femaleBadge : tp.maleBadge;

  return (
    <Reveal as="article" className="tc3__card" style={{ '--card-color': teacher.color }}>
      {videoOpen && teacher.videoUrl && (
        <VideoModal teacher={teacher} onClose={() => setVideoOpen(false)} />
      )}

      <TutorAvatar teacher={teacher} tp={tp} initials={initials} onPlay={() => setVideoOpen(true)} />

      <div className="tc3__main">
        <div className="tc3__head">
          <Link to={`/teachers/${teacher.id}`} className="tc3__name-link">
            <h3 className="tc3__name-ar" dir="rtl">{teacher.nameAr}</h3>
            <p className="tc3__name-en">{teacher.nameEn}</p>
          </Link>
          <RatingPill teacher={teacher} />
        </div>

        <p className="tc3__role">{title}</p>

        <div className="tc3__tags">
          {specialties.slice(0, 3).map((s) => (
            <span key={s} className="tc3__tag">{s}</span>
          ))}
        </div>

        <div className="tc3__meta">
          <span className="tc3__meta-item" aria-label={`${teacher.reviews} reviews`}>
            <span aria-hidden="true">{REVIEWS_ICON}</span>({teacher.reviews})
          </span>
          {teacher.hours && (
            <span className="tc3__meta-item">
              <span aria-hidden="true">{CLOCK_ICON}</span>{teacher.hours} {ut.teachingHrs}
            </span>
          )}
          <span className="tc3__meta-item tc3__meta-item--muted">{genderLabel}</span>
        </div>

        <div className="tc3__actions">
          <button
            type="button"
            className="tc3__cta"
            onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
          >
            {ut.enroll}
          </button>
          <Link to={`/teachers/${teacher.id}`} className="tc3__cta-link">
            {ut.viewProfile}
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

function useSpotlightTeacher(teachers) {
  return useMemo(
    () => [...teachers].sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews))[0],
    [teachers],
  );
}

function SpotlightCard({ teacher }) {
  const navigate = useNavigate();
  const { lang, t: i18n } = useLang();
  const tp = i18n.tp;
  const ut = i18n.tutors;
  const initials = initialsOf(teacher.nameAr);
  const title = teacher.title[lang] || teacher.title.en;
  const bio = teacher.bio[lang] || teacher.bio.en;
  const specialties = teacher.specialties[lang] || teacher.specialties.en;
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <Reveal className="tc3__spotlight" style={{ '--card-color': teacher.color }}>
      {videoOpen && teacher.videoUrl && (
        <VideoModal teacher={teacher} onClose={() => setVideoOpen(false)} />
      )}

      <span className="tc3__spotlight-tag">
        <span aria-hidden="true">{STAR_ICON}</span>
        Top Rated Tutor
      </span>

      <div className="tc3__spotlight-inner">
        <TutorAvatar teacher={teacher} tp={tp} initials={initials} size="lg" onPlay={() => setVideoOpen(true)} />

        <div className="tc3__spotlight-body">
          <div className="tc3__head">
            <Link to={`/teachers/${teacher.id}`} className="tc3__name-link">
              <h3 className="tc3__name-ar" dir="rtl">{teacher.nameAr}</h3>
              <p className="tc3__name-en">{teacher.nameEn}</p>
            </Link>
            <RatingPill teacher={teacher} size="lg" />
          </div>

          <p className="tc3__role">{title}</p>
          <p className="tc3__spotlight-bio">{bio}</p>

          <div className="tc3__tags">
            {specialties.slice(0, 4).map((s) => (
              <span key={s} className="tc3__tag">{s}</span>
            ))}
          </div>

          <div className="tc3__actions">
            <button
              type="button"
              className="tc3__cta"
              onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
            >
              {ut.enroll}
            </button>
            <Link to={`/teachers/${teacher.id}`} className="tc3__cta-link">
              {ut.viewProfile}
            </Link>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export default function Tutors() {
  const { t: i18n } = useLang();
  const ut = i18n.tutors;
  const spotlight = useSpotlightTeacher(TEACHERS);
  const rest = useMemo(() => TEACHERS.filter((t) => t.id !== spotlight.id), [spotlight]);

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

        <SpotlightCard teacher={spotlight} />

        <Reveal className="tc3__grid">
          {rest.map((t) => <TutorCard key={t.id} t={t} />)}
        </Reveal>

        <Reveal className="tc2__footer">
          <Link to="/teachers" className="btn btn--ghost">
            {ut.viewAll}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
