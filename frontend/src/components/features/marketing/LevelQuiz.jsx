import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    key: 'arabic',
    icon: '🌙',
    question: 'Can your child / you read Arabic?',
    options: [
      { value: 'none',    label: 'Not yet — starting from zero' },
      { value: 'basic',   label: 'A few letters — needs practice' },
      { value: 'fluent',  label: 'Yes, can read Arabic' },
    ],
  },
  {
    key: 'goal',
    icon: '🎯',
    question: 'What is your main goal?',
    options: [
      { value: 'read',      label: 'Learn to read the Quran correctly' },
      { value: 'memorize',  label: 'Memorize the Quran (Hifz)' },
      { value: 'ijazah',    label: 'Earn an Ijazah certification' },
      { value: 'islamic',   label: 'Islamic Studies / Arabic' },
    ],
  },
  {
    key: 'who',
    icon: '👤',
    question: 'Who is this for?',
    options: [
      { value: 'child',   label: 'My child (under 12)' },
      { value: 'teen',    label: 'My teenager (12–17)' },
      { value: 'adult',   label: 'Myself (adult)' },
      { value: 'family',  label: 'Multiple family members' },
    ],
  },
];

const RECOMMENDATIONS = {
  /* key = goal */
  read: {
    title: 'Quran Reading — Noorani Qaida',
    desc: 'Start from the very first letter. Our tutors take complete beginners to confident Quran reading in 4–6 months.',
    path: '/courses/quran-tajweed',
    badge: '🌱 Perfect for beginners',
  },
  memorize: {
    title: 'Quran Memorization (Hifz)',
    desc: 'A structured Hifz plan with daily revision, spaced repetition, and personal accountability — for all ages.',
    path: '/courses/hifz',
    badge: '🏆 Most popular course',
  },
  ijazah: {
    title: 'Quran Ijazah Course',
    desc: 'Receive an Ijazah with a connected chain (sanad) back to the Prophet ﷺ — taught by Ijazah-holders themselves.',
    path: '/courses/ijazah',
    badge: '📜 Advanced certification',
  },
  islamic: {
    title: 'Islamic Studies & Arabic',
    desc: 'Aqeedah, Fiqh, Seerah, Hadith, Tafsir — plus foundational Arabic — in your language.',
    path: '/courses',
    badge: '🌍 All levels welcome',
  },
};

export default function LevelQuiz() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);

  const current = STEPS[step];
  const rec = done ? RECOMMENDATIONS[answers.goal] || RECOMMENDATIONS.read : null;

  const pick = (val) => {
    const next = { ...answers, [current.key]: val };
    setAnswers(next);
    if (step < STEPS.length - 1) {
      setTimeout(() => setStep((s) => s + 1), 200);
    } else {
      setTimeout(() => setDone(true), 200);
    }
  };

  const reset = () => { setStep(0); setAnswers({}); setDone(false); };

  return (
    <section className="lq" aria-label="Find your perfect course">
      <div className="container">
        <div className="lq__inner">
          {!done ? (
            <>
              <p className="eyebrow lq__eyebrow">Find your course</p>
              <h2 className="lq__heading">3 questions → your perfect lesson plan</h2>

              <div className="lq__progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`lq__pip${i < step ? ' done' : i === step ? ' active' : ''}`}
                  />
                ))}
              </div>

              <div className="lq__card" key={step}>
                <span className="lq__step-icon" aria-hidden="true">{current.icon}</span>
                <h3 className="lq__question">{current.question}</h3>
                <div className="lq__options">
                  {current.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`lq__opt${answers[current.key] === opt.value ? ' selected' : ''}`}
                      onClick={() => pick(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="lq__result">
              <div className="lq__result-check" aria-hidden="true">✓</div>
              <p className="lq__result-eyebrow">Your personalised recommendation</p>
              <h3 className="lq__result-title">{rec.title}</h3>
              <span className="lq__result-badge">{rec.badge}</span>
              <p className="lq__result-desc">{rec.desc}</p>
              <div className="lq__result-actions">
                <button
                  type="button"
                  className="btn btn--gold btn--lg"
                  onClick={() => navigate('/enroll')}
                >
                  Start free trial — no card needed
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => navigate(rec.path)}
                >
                  Learn more about this course
                </button>
              </div>
              <button type="button" className="lq__restart" onClick={reset}>
                ← Retake quiz
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
