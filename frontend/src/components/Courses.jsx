import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import MobileCarousel from './ui/MobileCarousel';
import ResourceModal from './ui/ResourceModal';
import AlphabetLearner from './features/AlphabetLearner';
import { useTrial } from '../context/TrialContext';
import { useLang } from '../context/LangContext';
import { courses } from '../data';

const COURSE_META = [
  { grad: 'linear-gradient(135deg,#0b6e4f,#1a9e72)', level: 'Beginner', duration: 'All ages' },
  { grad: 'linear-gradient(135deg,#1a5fa0,#2176c7)', level: 'Intermediate', duration: '6+ months' },
  { grad: 'linear-gradient(135deg,#7a3a8a,#a04dba)', level: 'All levels', duration: 'Ongoing' },
  { grad: 'linear-gradient(135deg,#2c3e50,#3d5166)', level: 'Advanced', duration: '2+ years' },
  { grad: 'linear-gradient(135deg,#d4af37,#b8941f)', level: 'All levels', duration: 'Flexible' },
  { grad: 'linear-gradient(135deg,#c0392b,#e74c3c)', level: 'Beginner', duration: 'Kids & Adults' },
];

/* Inline SVG icons — same Lucide-style used by Features.jsx, replacing raw
   emoji banner icons so course cards match the rest of the page's icon
   language instead of introducing a third style. */
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
  /* 4 — Mosque dome (same mark as BrandIcon): Islamic Studies */
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

const READER_RE = /reading/i;

const isAlphabet = (course) =>
  course.interactive === 'alphabet' || /alphabet/i.test(course.title);

export default function Courses() {
  const { startLearning } = useTrial();
  const { t } = useLang();
  const navigate = useNavigate();
  const [picker, setPicker] = useState(null);
  const [openAlphabet, setOpenAlphabet] = useState(false);

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
        <Reveal className="section-head">
          <p className="eyebrow">{t.courses.eyebrow}</p>
          <h2>{t.courses.heading}</h2>
        </Reveal>
        <MobileCarousel trackClassName="courses__grid" ariaLabel={t.courses.heading}>
          {courses.map((c, i) => {
            const item = t.courses.items[i] || {};
            const meta = COURSE_META[i] || COURSE_META[0];
            const metaT = (t.courses.meta && t.courses.meta[i]) || {};
            const expanded = isAlphabet(c) && openAlphabet;
            return (
              <Reveal
                as="article"
                className={`course${expanded ? ' course--expanded' : ''}`}
                key={c.title}
              >
                <div className="course__banner" style={{ background: meta.grad }}>
                  <span className="course__banner-icon">{COURSE_ICONS[i] || COURSE_ICONS[0]}</span>
                  <div className="course__badges">
                    <span className="course__badge">{metaT.level || meta.level}</span>
                    <span className="course__badge course__badge--alt">{metaT.duration || meta.duration}</span>
                  </div>
                </div>
                <div className="course__body">
                  <h3>{item.title || c.title}</h3>
                  <p>{item.text || c.text}</p>
                  {(item.points || c.points) && (
                    <ul className="course__points">
                      {(item.points || c.points).map((pt) => (
                        <li key={pt}>{pt}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="course__link" onClick={() => handleStart(c)}>
                    {expanded ? t.courses.closeBtn : t.courses.startBtn}
                  </button>

                  {expanded && <AlphabetLearner onClose={() => setOpenAlphabet(false)} />}
                </div>
              </Reveal>
            );
          })}
        </MobileCarousel>
      </div>

      <ResourceModal course={picker} onClose={() => setPicker(null)} />
    </section>
  );
}
