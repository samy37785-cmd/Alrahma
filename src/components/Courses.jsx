import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from './Reveal';
import ResourceModal from './ResourceModal';
import AlphabetLearner from './AlphabetLearner';
import useCourses from '../hooks/useCourses';
import { useTrial } from '../context/TrialContext';
import { courses as fallbackCourses } from '../data';

// "Quran Reading" opens the live Quran reader; courses with resources show the
// picker modal; everything else goes to the trial form.
const READER_RE = /reading/i;

// True for the interactive Arabic & Italian alphabet card.
const isAlphabet = (course) =>
  course.interactive === 'alphabet' || /alphabet/i.test(course.title);

export default function Courses() {
  const { courses, loading, error } = useCourses();
  const { startLearning } = useTrial();
  const navigate = useNavigate();
  const [picker, setPicker] = useState(null); // course whose resources modal is open
  const [openAlphabet, setOpenAlphabet] = useState(false); // inline alphabet lesson

  const handleStart = (course) => {
    // 1) Interactive alphabet card -> expand the lesson inside the card (SPA).
    if (isAlphabet(course)) {
      setOpenAlphabet((v) => !v);
      return;
    }
    // 2) If the course has resources (e.g. Tajweed/Hifz), let the user choose.
    if (course.resources?.length) {
      setPicker(course);
      return;
    }
    // 3) Reading -> open the live Quran reader.
    if (READER_RE.test(course.title)) {
      navigate('/quran');
      return;
    }
    // 4) Otherwise prefill and scroll to the trial form.
    startLearning(course.title);
  };

  // Use API data when available; otherwise fall back to the static list
  // (so the page still works if the backend isn't running).
  // `resources` is carried through from either source.
  const list =
    courses.length > 0
      ? courses.map((c) => ({
          id: c._id,
          title: c.title,
          media: c.icon,
          text: c.description,
          resources: c.resources,
        }))
      : fallbackCourses;

  return (
    <section className="courses" id="courses">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">What we teach</p>
          <h2>Our Recommended Courses</h2>
          {loading && <p className="section-sub">Loading courses…</p>}
          {error && <p className="section-sub">Showing featured courses.</p>}
        </Reveal>
        <div className="courses__grid">
          {list.map((c) => {
            const expanded = isAlphabet(c) && openAlphabet;
            return (
              <Reveal
                as="article"
                className={`course${expanded ? ' course--expanded' : ''}`}
                key={c.id || c.title}
              >
                <div className="course__media">{c.media}</div>
                <div className="course__body">
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <button type="button" className="course__link" onClick={() => handleStart(c)}>
                    {expanded ? 'Close lesson ×' : 'Start learning →'}
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
