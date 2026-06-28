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
      navigate('/quran');
      return;
    }
    if (course.resources?.length) {
      setPicker(course);
      return;
    }
    if (READER_RE.test(course.title)) {
      navigate('/quran');
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
                  <span className="course__banner-icon">{c.media}</span>
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
