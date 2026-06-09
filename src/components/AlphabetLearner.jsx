import { useState } from 'react';
import useSpeech from '../hooks/useSpeech';
import { alphabetGroups } from '../data';

// Remove Arabic diacritics so we can loosely compare spoken input to the target.
const stripDiacritics = (s = '') => s.replace(/[ً-ْ]/g, '').trim();

export default function AlphabetLearner({ onClose }) {
  const { speak, listen, ttsSupported, sttSupported } = useSpeech();

  // State for which group (set of letters) is currently shown.
  const [groupIndex, setGroupIndex] = useState(0);
  // State for the live microphone test: which letter + the result.
  const [micLetter, setMicLetter] = useState(null);
  const [result, setResult] = useState(null); // { ar, ok, heard }

  const group = alphabetGroups[groupIndex];
  const isFirst = groupIndex === 0;
  const isLast = groupIndex === alphabetGroups.length - 1;

  const goPrev = () => { setGroupIndex((i) => Math.max(0, i - 1)); setResult(null); };
  const goNext = () => { setGroupIndex((i) => Math.min(alphabetGroups.length - 1, i + 1)); setResult(null); };

  // Test the user's pronunciation of a letter via voice recognition.
  const testPronunciation = async (letter) => {
    setMicLetter(letter.ar);
    setResult(null);
    try {
      const heard = await listen('ar-SA');
      const target = stripDiacritics(letter.say);
      const ok =
        stripDiacritics(heard).includes(target) ||
        heard.includes(letter.ar) ||
        target.includes(stripDiacritics(heard));
      setResult({ ar: letter.ar, ok, heard });
    } catch (err) {
      setResult({ ar: letter.ar, ok: false, heard: err.message === 'no-speech' ? 'No speech detected' : 'Mic error' });
    } finally {
      setMicLetter(null);
    }
  };

  return (
    <div className="alpha">
      <div className="alpha__top">
        <div>
          <h4 className="alpha__title">Arabic & Italian Alphabet</h4>
          <p className="alpha__progress">
            Group {groupIndex + 1} of {alphabetGroups.length}
          </p>
        </div>
        <button className="alpha__close" onClick={onClose} aria-label="Close lesson">×</button>
      </div>

      {!ttsSupported && (
        <p className="alpha__warn">⚠ Your browser doesn’t support speech synthesis. Audio may not play.</p>
      )}

      <div className="alpha__grid">
        {group.map((letter) => (
          <div className="alpha__tile" key={letter.ar}>
            <div className="alpha__char" dir="rtl" lang="ar">{letter.ar}</div>
            <div className="alpha__map">
              <span className="alpha__name">{letter.name}</span>
              <span className="alpha__it">IT: {letter.it}</span>
            </div>

            <div className="alpha__btns">
              {/* Arabic accent */}
              <button
                className="alpha__audio"
                onClick={() => speak(letter.say, 'ar-SA')}
                title="Listen (Arabic)"
              >
                🔊 ع
              </button>
              {/* Italian accent */}
              <button
                className="alpha__audio alpha__audio--it"
                onClick={() => speak(letter.it, 'it-IT')}
                title="Ascolta (Italiano)"
              >
                🔊 IT
              </button>
              {/* Voice test */}
              {sttSupported && (
                <button
                  className={`alpha__mic${micLetter === letter.ar ? ' listening' : ''}`}
                  onClick={() => testPronunciation(letter)}
                  disabled={micLetter !== null}
                  title="Test your pronunciation"
                >
                  {micLetter === letter.ar ? '🎙️…' : '🎤'}
                </button>
              )}
            </div>

            {result && result.ar === letter.ar && (
              <p className={`alpha__result ${result.ok ? 'ok' : 'no'}`}>
                {result.ok ? '✓ Well done!' : `✗ Heard: ${result.heard}`}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="alpha__nav">
        <button className="btn btn--ghost btn--sm" onClick={goPrev} disabled={isFirst}>← Previous</button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => speak(group.map((l) => l.say).join('، '), 'ar-SA')}
        >
          🔊 Play all
        </button>
        <button className="btn btn--gold btn--sm" onClick={goNext} disabled={isLast}>Next →</button>
      </div>
    </div>
  );
}
