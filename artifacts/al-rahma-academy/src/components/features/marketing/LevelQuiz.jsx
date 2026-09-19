import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../../context/LangContext';
import { LEVEL_QUIZ_STEPS, LEVEL_QUIZ_RECOMMENDATIONS } from '../../../data/home/levelQuiz';
import { LEVEL_QUIZ_TEXT } from '../../../i18n/home/levelQuiz';

export default function LevelQuiz() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const t = LEVEL_QUIZ_TEXT[lang] || LEVEL_QUIZ_TEXT.en;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);

  const current = LEVEL_QUIZ_STEPS[step];
  const currentText = t.steps[current.id];
  const recId = done ? (answers.goal && t.recommendations[answers.goal] ? answers.goal : 'read') : null;
  const rec = done ? t.recommendations[recId] : null;
  const recMeta = done ? LEVEL_QUIZ_RECOMMENDATIONS.find((r) => r.id === recId) : null;

  const pick = (val) => {
    const next = { ...answers, [current.id]: val };
    setAnswers(next);
    if (step < LEVEL_QUIZ_STEPS.length - 1) {
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
              <p className="eyebrow lq__eyebrow">{t.eyebrow}</p>
              <h2 className="lq__heading">{t.heading}</h2>

              <div className="lq__progress" aria-label={`Step ${step + 1} of ${LEVEL_QUIZ_STEPS.length}`}>
                {LEVEL_QUIZ_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`lq__pip${i < step ? ' done' : i === step ? ' active' : ''}`}
                  />
                ))}
              </div>

              <div className="lq__card" key={step}>
                <span className="lq__step-icon" aria-hidden="true">{current.icon}</span>
                <h3 className="lq__question">{currentText.question}</h3>
                <div className="lq__options">
                  {current.optionIds.map((optId) => (
                    <button
                      key={optId}
                      type="button"
                      className={`lq__opt${answers[current.id] === optId ? ' selected' : ''}`}
                      onClick={() => pick(optId)}
                    >
                      {currentText.options[optId]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="lq__result">
              <div className="lq__result-check" aria-hidden="true">✓</div>
              <p className="lq__result-eyebrow">{t.resultEyebrow}</p>
              <h3 className="lq__result-title">{rec.title}</h3>
              <span className="lq__result-badge">{rec.badge}</span>
              <p className="lq__result-desc">{rec.desc}</p>
              <div className="lq__result-actions">
                <button
                  type="button"
                  className="btn btn--gold btn--lg"
                  onClick={() => navigate('/enroll')}
                >
                  {t.startTrialBtn}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => navigate(recMeta.path)}
                >
                  {t.learnMoreBtn}
                </button>
              </div>
              <button type="button" className="lq__restart" onClick={reset}>
                {t.retakeBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
