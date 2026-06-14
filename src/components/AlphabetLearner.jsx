import { useState, useRef } from 'react';
import useSpeech from '../hooks/useSpeech';
import { alphabetGroups } from '../data';

const stripDiacritics = (s = '') => s.replace(/[ً-ْ]/g, '').trim();

const GROUP_LABELS = [
  'Letters 1-4',
  'Letters 5-8',
  'Letters 9-12',
  'Letters 13-16',
  'Letters 17-20',
  'Letters 21-24',
  'Letters 25-28',
  'Short vowels (harakat)',
  'Tanwin and Shadda',
  'Special letters and forms',
];

export default function AlphabetLearner({ onClose }) {
  const { speak, listen, ttsSupported, sttSupported } = useSpeech();
  const [groupIndex, setGroupIndex] = useState(0);
  const [micLetter, setMicLetter] = useState(null);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  const group = alphabetGroups[groupIndex];
  const isFirst = groupIndex === 0;
  const isLast = groupIndex === alphabetGroups.length - 1;

  const goPrev = () => { setGroupIndex((i) => Math.max(0, i - 1)); setResult(null); };
  const goNext = () => { setGroupIndex((i) => Math.min(alphabetGroups.length - 1, i + 1)); setResult(null); };

  const playArabic = (letter) => {
    if (letter.audio) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const a = new Audio(letter.audio);
      audioRef.current = a;
      setPlaying(letter.ar);
      a.onended = () => setPlaying(null);
      a.onerror = () => { setPlaying(null); speak(letter.say, 'ar-SA'); };
      a.play().catch(() => { setPlaying(null); speak(letter.say, 'ar-SA'); });
    } else {
      speak(letter.say, 'ar-SA');
    }
  };

  const playAll = () => {
    speak(group.map((l) => l.say).join(', '), 'ar-SA');
  };

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
          <h4 className="alpha__title">Arabic and Italian Alphabet</h4>
          <p className="alpha__progress">
            {GROUP_LABELS[groupIndex]} - {groupIndex + 1} / {alphabetGroups.length}
          </p>
        </div>
        <button className="alpha__close" onClick={onClose} aria-label="Close lesson">x</button>
      </div>

      {!ttsSupported && (
        <p className="alpha__warn">Your browser does not support speech synthesis.</p>
      )}

      <div className="alpha__grid">
        {group.map((letter) => (
          <div className="alpha__tile" key={letter.ar}>
            <div className="alpha__char" dir="rtl" lang="ar">{letter.ar}</div>
            <div className="alpha__map">
              <span className="alpha__name">{letter.name}</span>
              <span className="alpha__it">IT: {letter.it}</span>
            </div>
            {letter.desc && <p className="alpha__desc">{letter.desc}</p>}

            <div className="alpha__btns">
              <button
                className={playing === letter.ar ? 'alpha__audio playing' : 'alpha__audio'}
                onClick={() => playArabic(letter)}
                title="Listen in Arabic"
              >
                {playing === letter.ar ? 'pause' : 'listen'}
              </button>
              <button
                className="alpha__audio alpha__audio--it"
                onClick={() => speak(letter.it, 'it-IT')}
                title="Ascolta in Italiano"
              >
                IT
              </button>
              {sttSupported && (
                <button
                  className={micLetter === letter.ar ? 'alpha__mic listening' : 'alpha__mic'}
                  onClick={() => testPronunciation(letter)}
                  disabled={micLetter !== null}
                  title="Test your pronunciation"
                >
                  {micLetter === letter.ar ? 'listening...' : 'mic'}
                </button>
              )}
            </div>

            {result && result.ar === letter.ar && (
              <p className={result.ok ? 'alpha__result ok' : 'alpha__result no'}>
                {result.ok ? 'Well done!' : 'Heard: ' + result.heard}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="alpha__nav">
        <button className="btn btn--ghost btn--sm" onClick={goPrev} disabled={isFirst}>Previous</button>
        <button className="btn btn--ghost btn--sm" onClick={playAll}>Play all</button>
        <button className="btn btn--gold btn--sm" onClick={goNext} disabled={isLast}>Next</button>
      </div>
    </div>
  );
}