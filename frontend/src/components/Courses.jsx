import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import ResourceModal from './ui/ResourceModal';
import AlphabetLearner from './features/AlphabetLearner';
import { useTrial } from '../context/TrialContext';
import { useLang } from '../context/LangContext';
import { courses } from '../data';

// `popular: true` drives the one "Most Popular" row — a deliberate hierarchy
// signal (like a highlighted pricing plan) rather than treating all six
// courses as interchangeable, which a uniform grid previously did.
const COURSE_META = [
  { grad: 'linear-gradient(135deg,#0b6e4f,#1a9e72)', level: 'Beginner', duration: 'All ages' },
  { grad: 'linear-gradient(135deg,#1a5fa0,#2176c7)', level: 'Intermediate', duration: '6+ months' },
  { grad: 'linear-gradient(135deg,#7a3a8a,#a04dba)', level: 'All levels', duration: 'Ongoing', popular: true },
  { grad: 'linear-gradient(135deg,#2c3e50,#3d5166)', level: 'Advanced', duration: '2+ years' },
  { grad: 'linear-gradient(135deg,#d4af37,#b8941f)', level: 'All levels', duration: 'Flexible' },
  { grad: 'linear-gradient(135deg,#c0392b,#e74c3c)', level: 'Beginner', duration: 'Kids & Adults' },
];

/* Inline SVG icons — same Lucide-style used by Features.jsx. */
const COURSE_ICONS = [
  /* 0 — Open book: Quran Reading */
  <svg key="book" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z"/>
    <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8Z"/>
  </svg>,
  /* 1 — Microphone: Recitation with Tajweed */
  <svg key="mic" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>,
  /* 2 — Repeat: Hifz (memorization through spaced repetition) */
  <svg key="repeat" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 2 21 6 17 10"/>
    <path d="M3 12v-2a4 4 0 0 1 4-4h14"/>
    <path d="M7 22 3 18 7 14"/>
    <path d="M21 12v2a4 4 0 0 1-4 4H3"/>
  </svg>,
  /* 3 — Award: Ijazah certification */
  <svg key="award" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="6"/>
    <path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5"/>
  </svg>,
  /* 4 — Mosque dome: Islamic Studies */
  <svg key="dome" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="30.5" y="7" width="3" height="7" rx="1.5" fill="#d4af37"/>
    <circle cx="32" cy="6" r="1.8" fill="#d4af37"/>
    <path d="M22 37 C22 24 26 14 32 14 C38 14 42 24 42 37 Z" fill="#fff"/>
    <rect x="22" y="35" width="20" height="4" rx="1" fill="#fff"/>
    <rect x="14" y="39" width="36" height="4" rx="1" fill="#fff"/>
  </svg>,
  /* 5 — Type: Arabic & Italian Alphabet */
  <svg key="type" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="4 7 4 4 20 4 20 7"/>
    <line x1="9" y1="20" x2="15" y2="20"/>
    <line x1="12" y1="4" x2="12" y2="20"/>
  </svg>,
];

const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const READER_RE = /reading/i;

const isAlphabet = (course) =>
  course.interactive === 'alphabet' || /alphabet/i.test(course.title);

export default function Courses() {
  const { startLearning } = useTrial();
  const { t } = useLang();
  const navigate = useNavigate();
  const [picker, setPicker] = useState(null);
  const [openAlphabet, setOpenAlphabet] = useState(false);
  // Which course's detail is expanded — one at a time, matching the visual
  // hierarchy the "Most Popular" badge already implies. Starts on that same
  // course so the redesigned rich-detail state is visible immediately, not
  // only after a click.
  const [activeIdx, setActiveIdx] = useState(() => {
    const i = COURSE_META.findIndex((m) => m.popular);
    return i >= 0 ? i : 0;
  });

  const handleStart = (course) => {
    if (isAlphabet(course)) {
      setOpenAlphabet((v) => !v);
      return;
    }
    if (course.detailPath) {
      navigate(course.detailPath);
      return;
    }
    if (course.interactive === 'quran') {
      navigate('/tools/quran-reader');
      return;
    }
    if (course.resources?.length) {
      setPicker(course);
      return;
    }
    if (READER_RE.test(course.title)) {
      navigate('/tools/quran-reader');
      return;
    }
    startLearning(course.title);
    setTimeout(() => {
      const el = document.getElementById('trial');
      if (!el) return;
      el.style.outline = '3px solid #d4af37';
      el.style.outlineOffset = '-3px';
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 1800);
    }, 600);
  };

  return (
    <section className="courses" id="courses">
      <div className="container">
        <Reveal className="section-head courses__head">
          <div>
            <p className="eyebrow">{t.courses.eyebrow}</p>
            <h2>{t.courses.heading}</h2>
          </div>
          <Link to="/courses" className="courses__browse-all">
            {t.courses.viewAll || 'Browse full curriculum'} <span aria-hidden="true">→</span>
          </Link>
        </Reveal>

        <Reveal className="courses__list">
          {courses.map((c, i) => {
            const item = t.courses.items[i] || {};
            const meta = COURSE_META[i] || COURSE_META[0];
            const metaT = (t.courses.meta && t.courses.meta[i]) || {};
            const isActive = activeIdx === i;
            const alphabetExpanded = isAlphabet(c) && openAlphabet;
            return (
              <div
                key={c.title}
                className={`course-row${isActive ? ' course-row--active' : ''}`}
              >
                <button
                  type="button"
                  className="course-row__head"
                  onClick={() => setActiveIdx(isActive ? -1 : i)}
                  aria-expanded={isActive}
                >
                  <span className="course-row__icon" style={{ background: meta.grad }}>
                    {COURSE_ICONS[i] || COURSE_ICONS[0]}
                  </span>
                  <span className="course-row__title-wrap">
                    <span className="course-row__title">
                      {item.title || c.title}
                      {meta.popular && <span className="course-row__popular">Most Popular</span>}
                    </span>
                    <span className="course-row__badges">
                      <span className="course-row__badge">{metaT.level || meta.level}</span>
                      <span className="course-row__badge course-row__badge--alt">{metaT.duration || meta.duration}</span>
                    </span>
                  </span>
                  <span className="course-row__chevron">{CHEVRON}</span>
                </button>

                <div className="course-row__panel">
                  <div className="course-row__body">
                    <div className="course-row__body-inner">
                      <p>{item.text || c.text}</p>
                      {(item.points || c.points) && (
                        <ul className="course-row__points">
                          {(item.points || c.points).map((pt) => (
                            <li key={pt}>{pt}</li>
                          ))}
                        </ul>
                      )}
                      <button type="button" className="course__link" onClick={() => handleStart(c)}>
                        {alphabetExpanded ? t.courses.closeBtn : t.courses.startBtn}
                      </button>

                      {alphabetExpanded && <AlphabetLearner onClose={() => setOpenAlphabet(false)} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>

      <ResourceModal course={picker} onClose={() => setPicker(null)} />
    </section>
  );
}
