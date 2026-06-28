import { useState, useEffect, useRef, useCallback } from 'react';
import { getVerseAudios } from '../../api/quran';
import { getMyHifz, markHifz } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const clean = (html = '') => html.replace(/<[^>]+>/g, '');

// First N words of an Arabic string (for test mode preview)
function firstWords(text, n = 3) {
  return text.split(/\s+/).slice(0, n).join(' ');
}

export default function HifzMode({ verses, chapterId, reciterId, chapterName, onClose }) {
  const [mode, setMode]               = useState('repeat');   // 'repeat' | 'test'
  const [repeatCount, setRepeatCount] = useState(3);
  const [fromVerse, setFromVerse]     = useState(1);
  const [toVerse, setToVerse]         = useState(Math.min(10, verses.length));
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentIdx, setCurrentIdx]   = useState(0);         // index within selected range
  const [playCount, setPlayCount]     = useState(0);         // how many times current verse played
  const [verseAudios, setVerseAudios] = useState([]);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [revealed, setRevealed]       = useState({});        // test mode: which verses are revealed
  const [showTranslation, setShowTranslation] = useState(true);
  const audioRef = useRef(null);

  const { user }                      = useAuth();
  const [memorized, setMemorized]     = useState(new Set()); // ayah numbers saved as memorized
  const [savingHifz, setSavingHifz]   = useState(false);

  const selectedVerses = verses.slice(fromVerse - 1, toVerse);

  // Load this student's saved memorization progress for the current surah.
  useEffect(() => {
    if (!user) return;
    getMyHifz()
      .then((data) => {
        const row = data.progress?.find((p) => p.chapterId === chapterId);
        setMemorized(new Set(row?.memorizedVerses || []));
      })
      .catch(() => {});
  }, [user, chapterId]);

  // Save the selected range as memorized (or un-memorized).
  const saveHifz = async (memorizedFlag) => {
    if (!user) return;
    setSavingHifz(true);
    try {
      const row = await markHifz(chapterId, {
        chapterName,
        totalVerses: verses.length,
        from: fromVerse,
        to: toVerse,
        memorized: memorizedFlag,
      });
      setMemorized(new Set(row.memorizedVerses || []));
    } catch { /* ignore — non-blocking */ }
    finally { setSavingHifz(false); }
  };

  // Load per-verse audio when chapter or reciter changes
  useEffect(() => {
    setLoadingAudio(true);
    getVerseAudios(chapterId, reciterId)
      .then(setVerseAudios)
      .catch(() => setVerseAudios([]))
      .finally(() => setLoadingAudio(false));
  }, [chapterId, reciterId]);

  // Build a lookup map: verse_key → url
  const audioMap = Object.fromEntries(verseAudios.map((a) => [a.verse_key, a.url]));

  // Play a specific verse (by index within selected range)
  const playVerse = useCallback((idx) => {
    const verse = selectedVerses[idx];
    if (!verse || !audioRef.current) return;
    const url = audioMap[verse.verse_key];
    if (!url) return;
    audioRef.current.src = url;
    audioRef.current.play().catch(() => {});
    setCurrentIdx(idx);
    setPlayCount(1);
  }, [selectedVerses, audioMap]);

  // Called when audio ends — decide: repeat or advance
  const handleEnded = useCallback(() => {
    setPlayCount((prev) => {
      const next = prev + 1;
      if (next <= repeatCount) {
        // Replay same verse
        audioRef.current?.play().catch(() => {});
        return next;
      }
      // Move to next verse
      const nextIdx = currentIdx + 1;
      if (nextIdx < selectedVerses.length) {
        setTimeout(() => playVerse(nextIdx), 600);
      } else {
        setIsPlaying(false);
      }
      return 0;
    });
  }, [repeatCount, currentIdx, selectedVerses.length, playVerse]);

  const startPlay = () => {
    setIsPlaying(true);
    setCurrentIdx(0);
    setPlayCount(0);
    setTimeout(() => playVerse(0), 100);
  };

  const stopPlay = () => {
    setIsPlaying(false);
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setCurrentIdx(0);
    setPlayCount(0);
  };

  const playOne = (idx) => {
    playVerse(idx);
    setIsPlaying(true);
  };

  const toggleReveal = (verseKey) =>
    setRevealed((p) => ({ ...p, [verseKey]: !p[verseKey] }));

  const revealAll  = () => {
    const all = {};
    selectedVerses.forEach((v) => (all[v.verse_key] = true));
    setRevealed(all);
  };
  const hideAll = () => setRevealed({});

  return (
    <div className="hifz">
      {/* Header */}
      <div className="hifz__header">
        <div>
          <h2 className="hifz__title">🧠 Hifz Mode — {chapterName}</h2>
          <p className="hifz__sub">Repetition &amp; memorization tools</p>
        </div>
        <button className="hifz__close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* Mode tabs */}
      <div className="hifz__tabs">
        <button
          className={`hifz__tab${mode === 'repeat' ? ' hifz__tab--active' : ''}`}
          onClick={() => { setMode('repeat'); stopPlay(); }}
        >
          🔁 Repetition (التكرار)
        </button>
        <button
          className={`hifz__tab${mode === 'test' ? ' hifz__tab--active' : ''}`}
          onClick={() => { setMode('test'); stopPlay(); setRevealed({}); }}
        >
          🧪 Test (اختبار الحفظ)
        </button>
      </div>

      {/* Memorization progress (logged-in students only) */}
      {user && (
        <div className="hifz__progress-save" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0' }}>
          <span className="quran__badge">
            ✅ {memorized.size}/{verses.length} {chapterName} memorized
          </span>
          <button className="btn btn--green btn--sm" disabled={savingHifz} onClick={() => saveHifz(true)}>
            {savingHifz ? '…' : `Mark verses ${fromVerse}–${toVerse} memorized`}
          </button>
          <button className="btn btn--ghost btn--sm" disabled={savingHifz} onClick={() => saveHifz(false)}>
            Unmark
          </button>
        </div>
      )}

      {/* Controls bar */}
      <div className="hifz__controls">
        <div className="hifz__range">
          <label>From verse</label>
          <select value={fromVerse} onChange={(e) => { stopPlay(); setFromVerse(Number(e.target.value)); }}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
          <label>to</label>
          <select value={toVerse} onChange={(e) => { stopPlay(); setToVerse(Number(e.target.value)); }}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>

        {mode === 'repeat' && (
          <div className="hifz__range">
            <label>Repeat each verse</label>
            <select value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))}>
              {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
          </div>
        )}

        {mode === 'test' && (
          <div className="hifz__range">
            <label>
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => setShowTranslation(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Show translation
            </label>
            <button className="btn btn--ghost btn--sm" onClick={revealAll}>Reveal all</button>
            <button className="btn btn--ghost btn--sm" onClick={hideAll}>Hide all</button>
          </div>
        )}
      </div>

      {/* Repeat mode: play bar */}
      {mode === 'repeat' && (
        <div className="hifz__playbar">
          {loadingAudio ? (
            <span className="hifz__status">Loading audio…</span>
          ) : !isPlaying ? (
            <button className="btn btn--green" onClick={startPlay} disabled={loadingAudio}>
              ▶ Start ({selectedVerses.length} verses · {repeatCount}× each)
            </button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={stopPlay}>⏹ Stop</button>
              <span className="hifz__status">
                Verse {fromVerse + currentIdx} — play {playCount}/{repeatCount}
              </span>
            </>
          )}
          <audio ref={audioRef} onEnded={handleEnded} style={{ display: 'none' }} />
        </div>
      )}

      {/* Verses list */}
      <ol className="hifz__verses" start={fromVerse}>
        {selectedVerses.map((v, idx) => {
          const isActive = mode === 'repeat' && isPlaying && idx === currentIdx;
          const isHidden = mode === 'test' && !revealed[v.verse_key];

          return (
            <li key={v.id} className={`hifz__verse${isActive ? ' hifz__verse--active' : ''}`}>
              <div className="hifz__verse-top">
                <span className="quran__badge">{v.verse_key}</span>

                {/* Single-verse play button (repeat mode) */}
                {mode === 'repeat' && (
                  <button
                    className="hifz__play-btn"
                    title="Play this verse"
                    onClick={() => playOne(idx)}
                    disabled={loadingAudio}
                  >
                    ▶
                  </button>
                )}

                {/* Reveal button (test mode) */}
                {mode === 'test' && (
                  <button
                    className="hifz__reveal-btn"
                    onClick={() => toggleReveal(v.verse_key)}
                  >
                    {revealed[v.verse_key] ? '🙈 Hide' : '👁 Reveal'}
                  </button>
                )}
              </div>

              {/* Arabic text */}
              <p className="quran__arabic hifz__arabic" dir="rtl" lang="ar">
                {isHidden
                  ? <span className="hifz__hidden-text">{firstWords(v.text_uthmani, 3)} <span className="hifz__dots">…</span></span>
                  : v.text_uthmani
                }
              </p>

              {/* Translation */}
              {v.translations?.[0] && (showTranslation || mode === 'repeat') && !isHidden && (
                <p className="quran__translation">{clean(v.translations[0].text)}</p>
              )}

              {/* Active verse progress bar */}
              {isActive && (
                <div className="hifz__progress-bar">
                  <div
                    className="hifz__progress-fill"
                    style={{ width: `${(playCount / repeatCount) * 100}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
