import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import AlphabetLearner from '../components/AlphabetLearner';
import useSEO from '../hooks/useSEO';
import {
  getChapters, getVerses, getVersesByPage, getVersesByJuz,
  getChapterAudio, getVerseAudios, getVerseTafsir, RECITERS,
} from '../api/quran';
import { TRANSLATIONS, TAFASEER, JUZ_NAMES, getUI } from '../data/quranLangs';

const clean = (html = '') =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const firstWords = (text, n = 3) => text.split(/\s+/).slice(0, n).join(' ');

// ── Tafsir panel for a single verse ─────────────────────────────────
function TafsirPanel({ verseKey, tafsirId, ui }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setText(''); setErr('');
    getVerseTafsir(verseKey, tafsirId)
      .then((t) => { if (alive) setText(clean(t)); })
      .catch(() => { if (alive) setErr('Tafsir not available for this verse.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [verseKey, tafsirId]);

  return (
    <div className="qlc__tafsir-panel">
      {loading && <p className="qlc__tafsir-loading">{ui.tafsirLoading}</p>}
      {err && <p className="qlc__tafsir-err">{err}</p>}
      {text && <p className="qlc__tafsir-text" dir="rtl">{text}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────
export default function Quran() {
  useSEO({
    title: 'Quran Learning Center — Al-Rahma Academy',
    description:
      'Read, listen and memorise the Holy Quran in 40+ languages with 20+ certified reciters. Tafsir Ibn Kathir, As-Saadi, Al-Jalalayn. Free online Quran learning platform.',
  });

  // ── Core state ───────────────────────────────────────────────────
  const [chapters, setChapters]       = useState([]);
  const [activeId, setActiveId]       = useState(1);
  const [reciterId, setReciterId]     = useState(7);
  const [verses, setVerses]           = useState([]);
  const [audioUrl, setAudioUrl]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');

  // ── Navigation mode: surah | page | juz ─────────────────────────
  const [navMode, setNavMode]         = useState('surah');
  const [pageNum, setPageNum]         = useState(1);
  const [juzNum, setJuzNum]           = useState(1);

  // ── Language / translation ───────────────────────────────────────
  const [lang, setLang]               = useState('en');
  const ui                            = getUI(lang);
  const transObj                      = TRANSLATIONS.find((t) => t.lang === lang) || TRANSLATIONS[0];
  const translationId                 = transObj.id;

  // ── Tabs: reading | hifz | alphabet ─────────────────────────────
  const [tab, setTab]                 = useState('reading');

  // ── Tafsir ───────────────────────────────────────────────────────
  const [openTafsir, setOpenTafsir]   = useState({});   // { verseKey: bool }
  const [tafsirId, setTafsirId]       = useState(169);  // Ibn Kathir default
  const [showTafsirBar, setShowTafsirBar] = useState(false);

  // ── Hifz state ───────────────────────────────────────────────────
  const [hifzMode, setHifzMode]       = useState('repeat');
  const [fromV, setFromV]             = useState(1);
  const [toV, setToV]                 = useState(10);
  const [repeatCount, setRepeatCount] = useState(3);
  const [hifzDelay, setHifzDelay]     = useState(0);    // ms between verse reps
  const [rangeRepeat, setRangeRepeat] = useState(1);    // repeat whole range N times
  const [isPlaying, setIsPlaying]     = useState(false);
  const [curIdx, setCurIdx]           = useState(0);
  const [playCount, setPlayCount]     = useState(0);
  const [rangeIteration, setRangeIteration] = useState(0);
  const [verseAudios, setVerseAudios] = useState([]);
  const [loadingVA, setLoadingVA]     = useState(false);
  const [revealed, setRevealed]       = useState({});
  const [showTrans, setShowTrans]     = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────
  const audioRef        = useRef(null);
  const hifzAudio       = useRef(null);
  const sidebarRef      = useRef(null);
  const rangeCountRef   = useRef(0);

  // ── Load chapters once ───────────────────────────────────────────
  useEffect(() => {
    getChapters().then(setChapters).catch(() => {});
  }, []);

  // ── Load verses + audio when navigation / reciter / language changes ──
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setVerses([]); setIsPlaying(false);
    setOpenTafsir({});

    const fetchVerses =
      navMode === 'page' ? getVersesByPage(pageNum, translationId) :
      navMode === 'juz'  ? getVersesByJuz(juzNum,  translationId) :
                           getVerses(activeId,      translationId);

    const fetchAudio = navMode === 'surah'
      ? getChapterAudio(activeId, reciterId).catch(() => '')
      : Promise.resolve('');

    Promise.all([fetchVerses, fetchAudio])
      .then(([v, url]) => {
        if (!alive) return;
        setVerses(v);
        setAudioUrl(url);
        if (navMode === 'surah') {
          setFromV(1);
          setToV(Math.min(10, v.length));
        }
      })
      .catch(() => alive && setError(ui.error))
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [activeId, reciterId, translationId, navMode, pageNum, juzNum]);

  // ── Load per-verse audio for Hifz ───────────────────────────────
  useEffect(() => {
    if (tab !== 'hifz') return;
    if (navMode !== 'surah') return; // per-verse audio requires a known chapter
    setLoadingVA(true);
    getVerseAudios(activeId, reciterId)
      .then(setVerseAudios)
      .catch(() => setVerseAudios([]))
      .finally(() => setLoadingVA(false));
  }, [tab, activeId, reciterId, navMode]);

  // ── Derived ──────────────────────────────────────────────────────
  const audioMap       = Object.fromEntries(verseAudios.map((a) => [a.verse_key, a.url]));
  const selectedVerses = verses.slice(fromV - 1, toV);
  const activeChapter  = chapters.find((c) => c.id === activeId);
  const filtered       = chapters.filter(
    (c) =>
      c.name_simple.toLowerCase().includes(search.toLowerCase()) ||
      c.name_arabic.includes(search) ||
      String(c.id).includes(search)
  );

  // ── Hifz playback ────────────────────────────────────────────────
  const playVerse = useCallback((idx) => {
    const verse = selectedVerses[idx];
    if (!verse || !hifzAudio.current) return;
    const url = audioMap[verse.verse_key];
    if (!url) return;
    hifzAudio.current.src = url;
    hifzAudio.current.play().catch(() => {});
    setCurIdx(idx);
    setPlayCount(1);
  }, [selectedVerses, audioMap]);

  const handleHifzEnded = useCallback(() => {
    setPlayCount((prev) => {
      const next = prev + 1;
      if (next <= repeatCount) {
        setTimeout(() => hifzAudio.current?.play().catch(() => {}), hifzDelay);
        return next;
      }
      // Move to next verse
      const nextIdx = curIdx + 1;
      if (nextIdx < selectedVerses.length) {
        setTimeout(() => playVerse(nextIdx), 700 + hifzDelay);
      } else {
        // End of range — check range repeat
        rangeCountRef.current += 1;
        setRangeIteration(rangeCountRef.current);
        if (rangeCountRef.current < rangeRepeat) {
          setTimeout(() => playVerse(0), 1200 + hifzDelay);
        } else {
          rangeCountRef.current = 0;
          setRangeIteration(0);
          setIsPlaying(false);
        }
      }
      return 0;
    });
  }, [repeatCount, curIdx, selectedVerses.length, playVerse, hifzDelay, rangeRepeat]);

  const startHifz = () => {
    rangeCountRef.current = 0;
    setRangeIteration(0);
    setIsPlaying(true);
    setCurIdx(0);
    setPlayCount(0);
    setTimeout(() => playVerse(0), 100);
  };

  const stopHifz = () => {
    setIsPlaying(false);
    hifzAudio.current?.pause();
    if (hifzAudio.current) hifzAudio.current.currentTime = 0;
    setCurIdx(0);
    setPlayCount(0);
    rangeCountRef.current = 0;
    setRangeIteration(0);
  };

  const toggleReveal  = (key) => setRevealed((p) => ({ ...p, [key]: !p[key] }));
  const revealAll     = () => { const m = {}; selectedVerses.forEach((v) => (m[v.verse_key] = true)); setRevealed(m); };
  const hideAll       = () => setRevealed({});

  const toggleTafsir  = (key) => setOpenTafsir((p) => ({ ...p, [key]: !p[key] }));

  // ── Navigation helpers ───────────────────────────────────────────
  const selectSurah = (id) => {
    setActiveId(id);
    setNavMode('surah');
    stopHifz();
    setRevealed({});
    setOpenTafsir({});
  };

  const changeLang = (l) => {
    setLang(l);
    stopHifz();
  };

  const goPage = (n) => {
    const p = Math.max(1, Math.min(604, n));
    setPageNum(p);
    setNavMode('page');
    setOpenTafsir({});
  };

  const goJuz = (n) => {
    setJuzNum(n);
    setNavMode('juz');
    setOpenTafsir({});
  };

  // ── Header label for current content ────────────────────────────
  const contentLabel = () => {
    if (navMode === 'page') return `${ui.page} ${pageNum} / 604`;
    if (navMode === 'juz')  return `${ui.juz} ${juzNum} — ${JUZ_NAMES[juzNum - 1] || ''}`;
    return activeChapter
      ? `${activeChapter.name_simple} — ${activeChapter.translated_name?.name}`
      : '';
  };

  const isRTL = ['ar', 'ur', 'fa', 'ur2'].includes(lang);

  // ── Repeat options (up to 100) ───────────────────────────────────
  const REPEAT_OPTIONS = [1,2,3,5,7,10,15,20,30,50,100];
  const RANGE_OPTIONS  = [1,2,3,5,7,10];
  const DELAY_OPTIONS  = [
    { value: 0,    label: ui.noDelay || 'None' },
    { value: 500,  label: '0.5s' },
    { value: 1000, label: '1s' },
    { value: 2000, label: '2s' },
    { value: 3000, label: '3s' },
  ];

  return (
    <div className="qlc" dir={ui.dir}>

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="qlc__bar">
        <div className="qlc__bar-inner">
          <Brand />

          <nav className="qlc__tabs">
            {[
              { key: 'reading',  icon: '📖', label: ui.reading },
              { key: 'hifz',     icon: '🧠', label: ui.hifz },
              { key: 'alphabet', icon: '🔤', label: ui.alphabet },
            ].map((t) => (
              <button
                key={t.key}
                className={`qlc__tab${tab === t.key ? ' qlc__tab--active' : ''}`}
                onClick={() => { setTab(t.key); stopHifz(); }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>

          <div className="qlc__lang-wrap">
            <span className="qlc__lang-label">🌍</span>
            <select
              className="qlc__lang-select"
              value={lang}
              onChange={(e) => changeLang(e.target.value)}
              title={ui.lang}
            >
              {TRANSLATIONS.map((t) => (
                <option key={t.lang} value={t.lang}>
                  {t.flag} {t.label}
                </option>
              ))}
            </select>
          </div>

          <Link to="/" className="btn btn--ghost btn--sm qlc__back">{ui.back}</Link>
        </div>
      </header>

      {/* ── Alphabet tab ─────────────────────────────────────────── */}
      {tab === 'alphabet' && (
        <div className="qlc__alphabet-wrap container">
          <AlphabetLearner onClose={() => setTab('reading')} />
        </div>
      )}

      {/* ── Reading + Hifz layout ─────────────────────────────────── */}
      {tab !== 'alphabet' && (
        <div className="qlc__layout">

          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="qlc__sidebar" ref={sidebarRef}>

            {/* Nav mode switcher */}
            <div className="qlc__nav-mode">
              {[
                { key: 'surah', label: ui.navSurah || 'Surah' },
                { key: 'page',  label: ui.navPage  || 'Page' },
                { key: 'juz',   label: ui.navJuz   || 'Juz' },
              ].map((m) => (
                <button
                  key={m.key}
                  className={`qlc__nav-btn${navMode === m.key ? ' active' : ''}`}
                  onClick={() => {
                    if (m.key === 'surah') { setNavMode('surah'); }
                    if (m.key === 'page')  { setNavMode('page'); }
                    if (m.key === 'juz')   { setNavMode('juz'); }
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Surah search + list */}
            {navMode === 'surah' && (
              <>
                <div className="qlc__sidebar-top">
                  <input
                    className="qlc__search"
                    placeholder={ui.search}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    dir="auto"
                  />
                </div>
                <ul className="qlc__list">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        className={`qlc__surah${c.id === activeId && navMode === 'surah' ? ' active' : ''}`}
                        onClick={() => selectSurah(c.id)}
                      >
                        <span className="qlc__num">{c.id}</span>
                        <span className="qlc__names">
                          <strong>{c.name_simple}</strong>
                          <small>{c.translated_name?.name} · {c.verses_count} {ui.verses}</small>
                        </span>
                        <span className="qlc__arabic-name">{c.name_arabic}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Page navigation */}
            {navMode === 'page' && (
              <div className="qlc__page-nav">
                <p className="qlc__page-label">{ui.page || 'Page'} (1 – 604)</p>
                <div className="qlc__page-row">
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum - 1)} disabled={pageNum <= 1}>‹</button>
                  <input
                    type="number"
                    className="qlc__page-input"
                    value={pageNum}
                    min={1}
                    max={604}
                    onChange={(e) => goPage(Number(e.target.value))}
                  />
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum + 1)} disabled={pageNum >= 604}>›</button>
                </div>
                <div className="qlc__page-grid">
                  {Array.from({ length: 30 }, (_, i) => i * 20 + 1).map((p) => (
                    <button
                      key={p}
                      className={`qlc__page-chip${pageNum === p ? ' active' : ''}`}
                      onClick={() => goPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Juz list */}
            {navMode === 'juz' && (
              <ul className="qlc__list">
                {JUZ_NAMES.map((name, i) => (
                  <li key={i + 1}>
                    <button
                      className={`qlc__surah${juzNum === i + 1 ? ' active' : ''}`}
                      onClick={() => goJuz(i + 1)}
                    >
                      <span className="qlc__num">{i + 1}</span>
                      <span className="qlc__names">
                        <strong>{ui.juz || 'Juz'} {i + 1}</strong>
                        <small>{name}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* ── Main reader ─────────────────────────────────────── */}
          <main className="qlc__main" dir="ltr">

            {/* Content header */}
            <div className="qlc__head">
              {navMode === 'surah' && activeChapter && (
                <>
                  <h1 className="qlc__surah-arabic" dir="rtl">{activeChapter.name_arabic}</h1>
                  <p className="qlc__surah-info">
                    {activeChapter.name_simple} — {activeChapter.translated_name?.name} ·{' '}
                    {activeChapter.revelation_place} · {activeChapter.verses_count} {ui.verses}
                  </p>
                </>
              )}
              {navMode !== 'surah' && (
                <h2 className="qlc__page-heading">{contentLabel()}</h2>
              )}

              {/* ── Reading tab controls ─────────────────────────── */}
              {tab === 'reading' && (
                <div className="qlc__audio-row">
                  <div className="qlc__select-wrap">
                    <label className="qlc__select-label">{ui.reciter}</label>
                    <select
                      className="qlc__select"
                      value={reciterId}
                      onChange={(e) => setReciterId(Number(e.target.value))}
                    >
                      {RECITERS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="qlc__select-wrap">
                    <label className="qlc__select-label">{ui.translation}</label>
                    <select
                      className="qlc__select"
                      value={lang}
                      onChange={(e) => changeLang(e.target.value)}
                    >
                      {TRANSLATIONS.map((t) => (
                        <option key={t.lang} value={t.lang}>{t.flag} {t.label} — {t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tafsir selector */}
                  <div className="qlc__select-wrap">
                    <label className="qlc__select-label">📚 {ui.tafsir}</label>
                    <select
                      className="qlc__select"
                      value={showTafsirBar ? tafsirId : ''}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setShowTafsirBar(false);
                          setOpenTafsir({});
                        } else {
                          setTafsirId(Number(e.target.value));
                          setShowTafsirBar(true);
                          setOpenTafsir({});
                        }
                      }}
                    >
                      <option value="">— {ui.tafsir} off —</option>
                      {TAFASEER.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.nameEn})</option>
                      ))}
                    </select>
                  </div>

                  {navMode === 'surah' && audioUrl && (
                    <audio ref={audioRef} controls src={audioUrl} className="qlc__audio" key={`${activeId}-${reciterId}`}>
                      Your browser does not support audio.
                    </audio>
                  )}
                </div>
              )}

              {/* ── Hifz controls ───────────────────────────────── */}
              {tab === 'hifz' && (
                <div className="qlc__hifz-controls">
                  <div className="qlc__hifz-tabs">
                    <button
                      className={`qlc__hifz-tab${hifzMode === 'repeat' ? ' active' : ''}`}
                      onClick={() => { setHifzMode('repeat'); stopHifz(); }}
                    >🔁 {ui.repeat}</button>
                    <button
                      className={`qlc__hifz-tab${hifzMode === 'test' ? ' active' : ''}`}
                      onClick={() => { setHifzMode('test'); stopHifz(); setRevealed({}); }}
                    >🧪 {ui.test}</button>
                  </div>

                  {/* Controls row */}
                  <div className="qlc__hifz-row">
                    <div className="qlc__hifz-field">
                      <label>{ui.fromVerse}</label>
                      <select value={fromV} onChange={(e) => { stopHifz(); setFromV(Number(e.target.value)); }}>
                        {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                      </select>
                    </div>
                    <div className="qlc__hifz-field">
                      <label>{ui.toVerse}</label>
                      <select value={toV} onChange={(e) => { stopHifz(); setToV(Number(e.target.value)); }}>
                        {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                      </select>
                    </div>

                    {hifzMode === 'repeat' && (
                      <>
                        <div className="qlc__hifz-field">
                          <label>{ui.repeatEach}</label>
                          <select value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))}>
                            {REPEAT_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
                          </select>
                        </div>
                        <div className="qlc__hifz-field">
                          <label>{ui.rangeRepeat || 'Range'}</label>
                          <select value={rangeRepeat} onChange={(e) => setRangeRepeat(Number(e.target.value))}>
                            {RANGE_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
                          </select>
                        </div>
                        <div className="qlc__hifz-field">
                          <label>{ui.delay || 'Delay'}</label>
                          <select value={hifzDelay} onChange={(e) => setHifzDelay(Number(e.target.value))}>
                            {DELAY_OPTIONS.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="qlc__hifz-reciter">
                          <label>{ui.reciter}</label>
                          <select
                            value={reciterId}
                            onChange={(e) => { stopHifz(); setReciterId(Number(e.target.value)); }}
                          >
                            {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                      </>
                    )}

                    {hifzMode === 'test' && (
                      <label className="qlc__hifz-check">
                        <input type="checkbox" checked={showTrans} onChange={(e) => setShowTrans(e.target.checked)} />
                        {ui.showTranslation}
                      </label>
                    )}
                  </div>

                  {/* Play bar */}
                  {hifzMode === 'repeat' && (
                    <div className="qlc__hifz-playbar">
                      {navMode !== 'surah' && (
                        <span className="qlc__hifz-status" style={{ color: '#c0392b' }}>
                          ⚠ Hifz mode works with Surah navigation only
                        </span>
                      )}
                      {navMode === 'surah' && (loadingVA ? (
                        <span className="qlc__hifz-status">{ui.loading}</span>
                      ) : !isPlaying ? (
                        <button className="btn btn--green" onClick={startHifz} disabled={loadingVA || !verseAudios.length}>
                          {ui.start} ({selectedVerses.length} {ui.verses} · {repeatCount}{ui.times}
                          {rangeRepeat > 1 ? ` · ${rangeRepeat} ${ui.range || 'rng'}` : ''})
                        </button>
                      ) : (
                        <>
                          <button className="btn btn--ghost" onClick={stopHifz}>{ui.stop}</button>
                          <span className="qlc__hifz-status">
                            {ui.verseOf} {fromV + curIdx}
                            {' '}— {ui.playOf} {playCount}/{repeatCount}
                            {rangeRepeat > 1 && ` — ${ui.range || 'range'} ${rangeIteration + 1}/${rangeRepeat}`}
                          </span>
                        </>
                      ))}
                    </div>
                  )}

                  {hifzMode === 'test' && (
                    <div className="qlc__hifz-playbar">
                      <button className="btn btn--ghost btn--sm" onClick={revealAll}>{ui.revealAll}</button>
                      <button className="btn btn--ghost btn--sm" onClick={hideAll}>{ui.hideAll}</button>
                    </div>
                  )}

                  <audio ref={hifzAudio} onEnded={handleHifzEnded} style={{ display: 'none' }} />
                </div>
              )}
            </div>

            {loading && <p className="qlc__msg">{ui.loading}</p>}
            {error   && <p className="qlc__msg qlc__msg--err">{error}</p>}

            {/* ── Verse list ──────────────────────────────────── */}
            {!loading && !error && (
              <ol className="qlc__verses" start={tab === 'hifz' ? fromV : 1}>
                {(tab === 'hifz' ? selectedVerses : verses).map((v, idx) => {
                  const isActive  = tab === 'hifz' && hifzMode === 'repeat' && isPlaying && idx === curIdx;
                  const isHidden  = tab === 'hifz' && hifzMode === 'test' && !revealed[v.verse_key];
                  const tafsirOn  = showTafsirBar && openTafsir[v.verse_key];

                  // Show surah name when navigating by page/juz and surah changes
                  const prevVerse = idx > 0 ? (tab === 'hifz' ? selectedVerses : verses)[idx - 1] : null;
                  const surahChanged = prevVerse
                    ? v.verse_key.split(':')[0] !== prevVerse.verse_key.split(':')[0]
                    : true;

                  return (
                    <li
                      key={v.id}
                      id={`verse-${v.verse_key}`}
                      className={`qlc__verse${isActive ? ' qlc__verse--active' : ''}`}
                    >
                      {/* Surah divider for page/juz mode */}
                      {navMode !== 'surah' && surahChanged && (
                        <div className="qlc__surah-divider">
                          {(() => {
                            const ch = chapters.find((c) => c.id === Number(v.verse_key.split(':')[0]));
                            return ch
                              ? <><span>{ch.name_arabic}</span> <span className="qlc__divider-en">{ch.name_simple}</span></>
                              : null;
                          })()}
                        </div>
                      )}

                      <div className="qlc__verse-top">
                        <span className="qlc__badge">{v.verse_key}</span>

                        {/* Hifz per-verse play */}
                        {tab === 'hifz' && hifzMode === 'repeat' && (
                          <button
                            className="qlc__play-btn"
                            onClick={() => { setCurIdx(idx); setIsPlaying(true); setTimeout(() => playVerse(idx), 50); }}
                            disabled={loadingVA}
                            title="Play this verse"
                          >▶</button>
                        )}

                        {/* Hifz test reveal */}
                        {tab === 'hifz' && hifzMode === 'test' && (
                          <button className="qlc__reveal-btn" onClick={() => toggleReveal(v.verse_key)}>
                            {revealed[v.verse_key] ? ui.hide : ui.reveal}
                          </button>
                        )}

                        {/* Tafsir toggle (reading mode) */}
                        {tab === 'reading' && showTafsirBar && (
                          <button
                            className={`qlc__tafsir-btn${tafsirOn ? ' active' : ''}`}
                            onClick={() => toggleTafsir(v.verse_key)}
                            title={ui.tafsir}
                          >
                            📚
                          </button>
                        )}
                      </div>

                      {/* Arabic text */}
                      <p className="qlc__arabic" dir="rtl" lang="ar">
                        {isHidden
                          ? <><span>{firstWords(v.text_uthmani, 3)}</span><span className="qlc__dots"> ···</span></>
                          : v.text_uthmani
                        }
                      </p>

                      {/* Translation */}
                      {translationId && v.translations?.[0] && !isHidden && (showTrans || tab === 'reading') && (
                        <p className="qlc__translation" dir="auto">{clean(v.translations[0].text)}</p>
                      )}

                      {/* Page / Juz metadata */}
                      {navMode !== 'surah' && (
                        <span className="qlc__meta">
                          {v.page_number && `📄 ${ui.page || 'P'} ${v.page_number}`}
                          {v.juz_number  && ` · ${ui.juz || 'Juz'} ${v.juz_number}`}
                        </span>
                      )}

                      {/* Active hifz progress bar */}
                      {isActive && (
                        <div className="qlc__progress-bar">
                          <div className="qlc__progress-fill" style={{ width: `${(playCount / repeatCount) * 100}%` }} />
                        </div>
                      )}

                      {/* Tafsir panel (lazy loaded) */}
                      {tafsirOn && (
                        <TafsirPanel verseKey={v.verse_key} tafsirId={tafsirId} ui={ui} />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
