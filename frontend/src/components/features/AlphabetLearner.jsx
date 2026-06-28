import { useState, useRef } from 'react';
import useSpeech from '../../hooks/useSpeech';
import { useLang } from '../../context/LangContext';
import { alphabetGroups } from '../../data';

const stripDiacritics = (s = '') => s.replace(/[ً-ْ]/g, '').trim();

const AR_LETTER_GROUPS = ['ا ب ت ث','ج ح خ د','ذ ر ز س','ش ص ض ط','ظ ع غ ف','ق ك ل م','ن ه و ي'];

const RECORDINGS = [
  { label: 'قارئ ١', src: '/audio/arabic-alphabet-full.ogg' },
  { label: 'قارئ ٢', src: '/audio/arabic-alphabet-pronunciation.ogg' },
];

export default function AlphabetLearner({ onClose }) {
  const { t } = useLang();
  const al = t.alphabet;
  const { speak, listen, sttSupported } = useSpeech();
  const [groupIndex, setGroupIndex] = useState(0);
  const [micLetter, setMicLetter]   = useState(null);
  const [result, setResult]         = useState(null);
  const [playing, setPlaying]       = useState(null);
  const [recIdx, setRecIdx]         = useState(0);
  const audioRef = useRef(null);

  const group   = alphabetGroups[groupIndex];
  const isFirst = groupIndex === 0;
  const isLast  = groupIndex === alphabetGroups.length - 1;

  const goTo = (i) => { setGroupIndex(i); setResult(null); };
  const goPrev = () => goTo(Math.max(0, groupIndex - 1));
  const goNext = () => goTo(Math.min(alphabetGroups.length - 1, groupIndex + 1));

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

  const testPronunciation = async (letter) => {
    setMicLetter(letter.ar);
    setResult(null);
    try {
      const heard  = await listen('ar-SA');
      const target = stripDiacritics(letter.say);
      const ok =
        stripDiacritics(heard).includes(target) ||
        heard.includes(letter.ar) ||
        target.includes(stripDiacritics(heard));
      setResult({ ar: letter.ar, ok, heard });
    } catch (err) {
      setResult({ ar: letter.ar, ok: false,
        heard: err.message === 'no-speech' ? al.noSpeech : al.micError });
    } finally {
      setMicLetter(null);
    }
  };

  return (
    <div className="alpha">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="alpha__header">
        <div>
          <h4 className="alpha__title">الأبجدية العربية والإيطالية</h4>
          <p className="alpha__subtitle">{al.title}</p>
        </div>
        <button className="alpha__close-btn" onClick={onClose} aria-label={al.closeLabel}>&#10005;</button>
      </div>

      {/* ── Progress dots ───────────────────────────────────── */}
      <div className="alpha__dots">
        {alphabetGroups.map((_, i) => (
          <button
            key={i}
            className={i === groupIndex ? 'alpha__dot alpha__dot--active' : 'alpha__dot'}
            onClick={() => goTo(i)}
            aria-label={al.groupPrefix + ' ' + (i + 1)}
          />
        ))}
      </div>
      <p className="alpha__group-label">
        {groupIndex < 7
          ? `${al.groupPrefix} ${groupIndex + 1} — ${AR_LETTER_GROUPS[groupIndex]}`
          : groupIndex === 7 ? al.shortVowels
          : groupIndex === 8 ? al.tanwinShadda
          : al.specialLetters}
      </p>

      {/* ── Full-alphabet recordings ─────────────────────────── */}
      <div className="alpha__recordings">
        <div className="alpha__rec-header">
          <span className="alpha__rec-title">{al.listenFull}</span>
          <div className="alpha__rec-tabs">
            {RECORDINGS.map((r, i) => (
              <button
                key={i}
                className={i === recIdx ? 'alpha__rec-tab alpha__rec-tab--active' : 'alpha__rec-tab'}
                onClick={() => setRecIdx(i)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <audio
          controls
          src={RECORDINGS[recIdx].src}
          className="alpha__rec-audio"
          key={recIdx}
        />
      </div>

      {/* ── Letter cards ─────────────────────────────────────── */}
      <div className="alpha__cards">
        {group.map((letter) => (
          <div className="alpha__card" key={letter.ar}>
            <div className="alpha__glyph" dir="rtl" lang="ar">{letter.ar}</div>
            <div className="alpha__card-name">{letter.name}</div>
            <div className="alpha__card-it">{al.itLabel} {letter.it}</div>
            {letter.desc && <p className="alpha__card-desc">{letter.desc}</p>}

            <div className="alpha__actions">
              <button
                className={playing === letter.ar ? 'alpha__btn alpha__btn--ar alpha__btn--playing' : 'alpha__btn alpha__btn--ar'}
                onClick={() => playArabic(letter)}
                title={al.listenTitle}
              >
                {playing === letter.ar ? '⏸' : '🔊'}
              </button>

              {sttSupported && (
                <button
                  className={micLetter === letter.ar ? 'alpha__btn alpha__btn--mic alpha__btn--listening' : 'alpha__btn alpha__btn--mic'}
                  onClick={() => testPronunciation(letter)}
                  disabled={micLetter !== null}
                  title={al.testPronTitle}
                >
                  {micLetter === letter.ar ? '⏳' : '🎙'}
                </button>
              )}
            </div>

            {result && result.ar === letter.ar && (
              <p className={result.ok ? 'alpha__feedback alpha__feedback--ok' : 'alpha__feedback alpha__feedback--no'}>
                {result.ok ? al.wellDone : '✗ ' + result.heard}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <div className="alpha__nav">
        <button className="alpha__nav-btn" onClick={goPrev} disabled={isFirst}>
          {al.prevBtn}
        </button>
        <span className="alpha__nav-count">{groupIndex + 1} / {alphabetGroups.length}</span>
        <button className="alpha__nav-btn alpha__nav-btn--next" onClick={goNext} disabled={isLast}>
          {al.nextBtn}
        </button>
      </div>

    </div>
  );
}