import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from './ui/Reveal';
import ResourceModal from './ui/ResourceModal';
import AlphabetLearner from './features/AlphabetLearner';
import { useTrial } from '../context/TrialContext';
import { useLang } from '../context/LangContext';
import { courses } from '../data';

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
        <div className="courses__grid">
          {courses.map((c, i) => {
            const item = t.courses.items[i] || {};
            const expanded = isAlphabet(c) && openAlphabet;
            return (
              <Reveal
                as="article"
                className={`course${expanded ? ' course--expanded' : ''}`}
                key={c.title}
              >
                <div className="course__media">{c.media}</div>
                <div className="course__body">
                  <h3>{item.title || c.title}</h3>
                  <p>{item.text || c.text}</p>
                  <button type="button" className="course__link" onClick={() => handleStart(c)}>
                    {expanded ? t.courses.closeBtn : t.courses.startBtn}
                  </button>

                  {expanded && <AlphabetLearner onClose={() => setOpenAlphabet(false)} />}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      <ResourceModal course={picker} onClose={() => setPicker(null)} />
    </section>
  );
}
