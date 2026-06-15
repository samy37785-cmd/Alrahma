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

/* ── Helpers ─────────────────────────────────────────────────────── */
const clean = (html = '') =>
  html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const firstWords = (text, n = 3) => text.split(/\s+/).slice(0, n).join(' ');

// Al-Fatiha: basmalah IS verse 1; At-Tawba: no basmalah
const NO_BASMALAH = new Set([1, 9]);

/* ── Tafsir panel (lazy-loaded per verse) ───────────────────────── */
function TafsirPanel({ verseKey, tafsirId, ui }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setText(''); setErr('');
    getVerseTafsir(verseKey, tafsirId)
      .then((t) => { if (alive) setText(clean(t)); })
      .catch(() => { if (alive) setErr('Tafsir not available.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [verseKey, tafsirId]);

  const tafsirName = TAFASEER.find((t) => t.id === tafsirId)?.name || 'تفسير';

  return (
    <div className="qlc__tafsir-panel">
      <div className="qlc__tafsir-head">
        <span className="qlc__tafsir-name">📖 {tafsirName}</span>
        <span className="qlc__tafsir-key">{verseKey}</span>
      </div>
      {loading && <p className="qlc__tafsir-loading">{ui.tafsirLoading || 'Loading tafsir…'}</p>}
      {err     && <p className="qlc__tafsir-err">{err}</p>}
      {text    && <p className="qlc__tafsir-text" dir="rtl">{text}</p>}
    </div>
  );
}

/* ── Horizontal control item ─────────────────────────────────────── */
function CtrlItem({ icon, label, children }) {
  return (
    <div className="qlc__cbar-item">
      <span className="qlc__cbar-label">{icon}&nbsp;{label}</span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Quran() {
  useSEO({
    title: 'Quran Learning Center — Al-Rahma Academy',
    description: 'Read, listen and memorise the Holy Quran in 40+ languages with 20+ reciters. Tafsir Ibn Kathir, As-Saadi, Al-Jalalayn.',
  });

  /* ── State ────────────────────────────────────────────────────── */
  const [chapters, setChapters]           = useState([]);
  const [activeId, setActiveId]           = useState(1);
  const [reciterId, setReciterId]         = useState(7);
  const [verses, setVerses]               = useState([]);
  const [audioUrl, setAudioUrl]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [search, setSearch]               = useState('');

  // Navigation: surah | page | juz
  const [navMode, setNavMode]             = useState('surah');
  const [pageNum, setPageNum]             = useState(1);
  const [juzNum, setJuzNum]               = useState(1);

  // Language / translation
  const [lang, setLang]                   = useState('en');
  const ui                                = getUI(lang);
  const transObj                          = TRANSLATIONS.find((t) => t.lang === lang) || TRANSLATIONS[0];
  const translationId                     = transObj.id;

  // Tabs
  const [tab, setTab]                     = useState('reading');

  // Tafsir: 0 = off
  const [openTafsir, setOpenTafsir]       = useState({});
  const [tafsirId, setTafsirId]           = useState(0);

  // Hifz
  const [hifzMode, setHifzMode]           = useState('repeat');
  const [fromV, setFromV]                 = useState(1);
  const [toV, setToV]                     = useState(10);
  const [repeatCount, setRepeatCount]     = useState(3);
  const [hifzDelay, setHifzDelay]         = useState(0);
  const [rangeRepeat, setRangeRepeat]     = useState(1);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [curIdx, setCurIdx]               = useState(0);
  const [playCount, setPlayCount]         = useState(0);
  const [rangeIteration, setRangeIteration] = useState(0);
  const [verseAudios, setVerseAudios]     = useState([]);
  const [loadingVA, setLoadingVA]         = useState(false);
  const [revealed, setRevealed]           = useState({});
  const [showTrans, setShowTrans]         = useState(true);

  const audioRef      = useRef(null);
  const hifzAudio     = useRef(null);
  const rangeCountRef = useRef(0);

  /* ── Load chapters ───────────────────────────────────────────── */
  useEffect(() => { getChapters().then(setChapters).catch(() => {}); }, []);

  /* ── Load verses + audio ─────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setVerses([]); setIsPlaying(false); setOpenTafsir({});

    const fetchV =
      navMode === 'page' ? getVersesByPage(pageNum, translationId) :
      navMode === 'juz'  ? getVersesByJuz(juzNum, translationId)   :
                           getVerses(activeId, translationId);

    const fetchA = navMode === 'surah'
      ? getChapterAudio(activeId, reciterId).catch(() => '')
      : Promise.resolve('');

    Promise.all([fetchV, fetchA])
      .then(([v, url]) => {
        if (!alive) return;
        setVerses(v); setAudioUrl(url);
        if (navMode === 'surah') { setFromV(1); setToV(Math.min(10, v.length)); }
      })
      .catch(() => alive && setError(ui.error))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [activeId, reciterId, translationId, navMode, pageNum, juzNum]);

  /* ── Load per-verse audio for Hifz ──────────────────────────── */
  useEffect(() => {
    if (tab !== 'hifz' || navMode !== 'surah') return;
    setLoadingVA(true);
    getVerseAudios(activeId, reciterId).then(setVerseAudios).catch(() => setVerseAudios([]))
      .finally(() => setLoadingVA(false));
  }, [tab, activeId, reciterId, navMode]);

  /* ── Derived ─────────────────────────────────────────────────── */
  const audioMap       = Object.fromEntries(verseAudios.map((a) => [a.verse_key, a.url]));
  const selectedVerses = verses.slice(fromV - 1, toV);
  const activeChapter  = chapters.find((c) => c.id === activeId);
  const filtered       = chapters.filter(
    (c) => c.name_simple.toLowerCase().includes(search.toLowerCase()) ||
           c.name_arabic.includes(search) || String(c.id).includes(search)
  );

  /* ── Hifz playback ───────────────────────────────────────────── */
  const playVerse = useCallback((idx) => {
    const v = selectedVerses[idx];
    if (!v || !hifzAudio.current) return;
    const url = audioMap[v.verse_key];
    if (!url) return;
    hifzAudio.current.src = url;
    hifzAudio.current.play().catch(() => {});
    setCurIdx(idx); setPlayCount(1);
  }, [selectedVerses, audioMap]);

  const handleHifzEnded = useCallback(() => {
    setPlayCount((prev) => {
      const next = prev + 1;
      if (next <= repeatCount) {
        setTimeout(() => hifzAudio.current?.play().catch(() => {}), hifzDelay);
        return next;
      }
      const nextIdx = curIdx + 1;
      if (nextIdx < selectedVerses.length) {
        setTimeout(() => playVerse(nextIdx), 700 + hifzDelay);
      } else {
        rangeCountRef.current += 1;
        setRangeIteration(rangeCountRef.current);
        if (rangeCountRef.current < rangeRepeat) {
          setTimeout(() => playVerse(0), 1200 + hifzDelay);
        } else {
          rangeCountRef.current = 0; setRangeIteration(0); setIsPlaying(false);
        }
      }
      return 0;
    });
  }, [repeatCount, curIdx, selectedVerses.length, playVerse, hifzDelay, rangeRepeat]);

  const startHifz = () => {
    rangeCountRef.current = 0; setRangeIteration(0);
    setIsPlaying(true); setCurIdx(0); setPlayCount(0);
    setTimeout(() => playVerse(0), 100);
  };
  const stopHifz = () => {
    setIsPlaying(false);
    hifzAudio.current?.pause();
    if (hifzAudio.current) hifzAudio.current.currentTime = 0;
    setCurIdx(0); setPlayCount(0); rangeCountRef.current = 0; setRangeIteration(0);
  };

  const toggleReveal  = (key) => setRevealed((p) => ({ ...p, [key]: !p[key] }));
  const revealAll     = () => { const m = {}; selectedVerses.forEach((v) => (m[v.verse_key] = true)); setRevealed(m); };
  const hideAll       = () => setRevealed({});
  const toggleTafsir  = (key) => setOpenTafsir((p) => ({ ...p, [key]: !p[key] }));

  const selectSurah  = (id) => { setActiveId(id); setNavMode('surah'); stopHifz(); setRevealed({}); setOpenTafsir({}); };
  const changeLang   = (l)  => { setLang(l); stopHifz(); };
  const goPage       = (n)  => { setPageNum(Math.max(1, Math.min(604, n))); setNavMode('page'); setOpenTafsir({}); };
  const goJuz        = (n)  => { setJuzNum(n); setNavMode('juz'); setOpenTafsir({}); };

  const REPEAT_OPTIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 100];
  const RANGE_OPTIONS  = [1, 2, 3, 5, 7, 10];
  const DELAY_OPTIONS  = [
    { value: 0,    label: ui.noDelay || 'None' },
    { value: 500,  label: '0.5s' },
    { value: 1000, label: '1s' },
    { value: 2000, label: '2s' },
    { value: 3000, label: '3s' },
  ];

  const showBasmalah = navMode === 'surah' && !NO_BASMALAH.has(activeId);
  const uiDir = getUI(lang.replace(/\d+$/, '')).dir || 'ltr';

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="qlc" dir={uiDir}>

      {/* ══════════════════ TOP BAR ════════════════════════════════ */}
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
                <span className="qlc__tab-icon">{t.icon}</span>
                <span className="qlc__tab-label">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="qlc__bar-right">
            <div className="qlc__lang-wrap">
              <span className="qlc__lang-label">🌍</span>
              <select className="qlc__lang-select" value={lang} onChange={(e) => changeLang(e.target.value)}>
                {TRANSLATIONS.map((t) => (
                  <option key={t.lang} value={t.lang}>{t.flag} {t.label}</option>
                ))}
              </select>
            </div>
            <Link to="/" className="btn btn--ghost btn--sm qlc__back">{ui.back}</Link>
          </div>
        </div>
      </header>

      {/* ══════════════════ ALPHABET ═══════════════════════════════ */}
      {tab === 'alphabet' && (
        <div className="qlc__alphabet-wrap container">
          <AlphabetLearner onClose={() => setTab('reading')} />
        </div>
      )}

      {/* ══════════════════ MAIN LAYOUT ════════════════════════════ */}
      {tab !== 'alphabet' && (
        <div className="qlc__layout">

          {/* ━━━━━━━━━━━━━━━━━━ SIDEBAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <aside className="qlc__sidebar">

            {/* ❶ Navigation tabs — top of sidebar, full width */}
            <div className="qlc__nav-tabs">
              {[
                { key: 'surah', label: ui.navSurah || 'Surah' },
                { key: 'page',  label: ui.navPage  || 'Page' },
                { key: 'juz',   label: ui.navJuz   || 'Juz' },
              ].map((m) => (
                <button
                  key={m.key}
                  className={`qlc__nav-tab${navMode === m.key ? ' active' : ''}`}
                  onClick={() => {
                    if (m.key !== navMode) {
                      if (m.key === 'surah') setNavMode('surah');
                      if (m.key === 'page')  setNavMode('page');
                      if (m.key === 'juz')   setNavMode('juz');
                    }
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* ❷ Surah mode */}
            {navMode === 'surah' && (
              <>
                <div className="qlc__sidebar-search">
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
                        className={`qlc__surah-btn${c.id === activeId ? ' active' : ''}`}
                        onClick={() => selectSurah(c.id)}
                      >
                        <span className="qlc__snum">{c.id}</span>
                        <span className="qlc__snames">
                          <b>{c.name_simple}</b>
                          <small>{c.translated_name?.name} · {c.verses_count} {ui.verses}</small>
                        </span>
                        <span className="qlc__sar">{c.name_arabic}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* ❸ Page mode */}
            {navMode === 'page' && (
              <div className="qlc__page-nav">
                <p className="qlc__page-label">{ui.page || 'Page'} (1 – 604)</p>
                <div className="qlc__page-row">
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum - 1)} disabled={pageNum <= 1}>‹</button>
                  <input
                    type="number" className="qlc__page-input"
                    value={pageNum} min={1} max={604}
                    onChange={(e) => goPage(Number(e.target.value))}
                  />
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum + 1)} disabled={pageNum >= 604}>›</button>
                </div>
                <div className="qlc__page-grid">
                  {Array.from({ length: 30 }, (_, i) => i * 20 + 1).map((p) => (
                    <button
                      key={p}
                      className={`qlc__page-chip${pageNum >= p && pageNum < p + 20 ? ' active' : ''}`}
                      onClick={() => goPage(p)}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ❹ Juz mode */}
            {navMode === 'juz' && (
              <ul className="qlc__list">
                {JUZ_NAMES.map((name, i) => (
                  <li key={i + 1}>
                    <button
                      className={`qlc__surah-btn${juzNum === i + 1 ? ' active' : ''}`}
                      onClick={() => goJuz(i + 1)}
                    >
                      <span className="qlc__snum">{i + 1}</span>
                      <span className="qlc__snames">
                        <b>{ui.juz || 'Juz'} {i + 1}</b>
                        <small>{name}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* ━━━━━━━━━━━━━━━━━━ MAIN CONTENT ━━━━━━━━━━━━━━━━━━━━━━ */}
          <main className="qlc__main" dir="ltr">

            {/* ═══════════════ ❶ SURAH / PAGE HEADER ═════════════ */}
            <div className="qlc__chapter-header">
              {navMode === 'surah' && activeChapter ? (
                <>
                  <h1 className="qlc__chapter-ar" dir="rtl">{activeChapter.name_arabic}</h1>
                  <p className="qlc__chapter-en">
                    {activeChapter.name_simple}
                    <span className="qlc__chapter-dot"> · </span>
                    {activeChapter.translated_name?.name}
                    <span className="qlc__chapter-dot"> · </span>
                    {activeChapter.revelation_place}
                    <span className="qlc__chapter-dot"> · </span>
                    {activeChapter.verses_count} {ui.verses}
                  </p>
                </>
              ) : (
                <h2 className="qlc__chapter-mode-title">
                  {navMode === 'juz'
                    ? `${ui.juz || 'Juz'} ${juzNum} — ${JUZ_NAMES[juzNum - 1] || ''}`
                    : `${ui.page || 'Page'} ${pageNum} / 604`}
                </h2>
              )}
            </div>

            {/* ═══════════════ ❷ CONTROLS BAR ════════════════════ */}
            {tab === 'reading' && (
              <div className="qlc__cbar">

                {/* Row 1: Selectors in one horizontal line */}
                <div className="qlc__cbar-selects">

                  <CtrlItem icon="🎙" label={ui.reciter}>
                    <select
                      className="qlc__cbar-select"
                      value={reciterId}
                      onChange={(e) => setReciterId(Number(e.target.value))}
                    >
                      {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </CtrlItem>

                  <div className="qlc__cbar-sep" />

                  <CtrlItem icon="🌐" label={ui.translation}>
                    <select
                      className="qlc__cbar-select"
                      value={lang}
                      onChange={(e) => changeLang(e.target.value)}
                    >
                      {TRANSLATIONS.map((t) => (
                        <option key={t.lang} value={t.lang}>{t.flag} {t.label} — {t.name}</option>
                      ))}
                    </select>
                  </CtrlItem>

                  <div className="qlc__cbar-sep" />

                  <CtrlItem icon="📚" label={ui.tafsir}>
                    <select
                      className="qlc__cbar-select"
                      value={tafsirId}
                      onChange={(e) => { setTafsirId(Number(e.target.value)); setOpenTafsir({}); }}
                    >
                      <option value={0}>— off —</option>
                      {TAFASEER.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.nameEn})</option>
                      ))}
                    </select>
                  </CtrlItem>
                </div>

                {/* Row 2: Audio player — full width, prominent */}
                {navMode === 'surah' && audioUrl && (
                  <div className="qlc__cbar-player">
                    <span className="qlc__cbar-reciter-name">
                      ♪ {RECITERS.find((r) => r.id === reciterId)?.name}
                    </span>
                    <audio
                      ref={audioRef}
                      controls
                      src={audioUrl}
                      className="qlc__audio"
                      key={`${activeId}-${reciterId}`}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════ ❷ HIFZ CONTROLS ═══════════════════ */}
            {tab === 'hifz' && (
              <div className="qlc__cbar qlc__cbar--hifz">

                {/* Mode tabs */}
                <div className="qlc__hifz-modetabs">
                  <button
                    className={`qlc__hifz-modetab${hifzMode === 'repeat' ? ' active' : ''}`}
                    onClick={() => { setHifzMode('repeat'); stopHifz(); }}
                  >🔁 {ui.repeat}</button>
                  <button
                    className={`qlc__hifz-modetab${hifzMode === 'test' ? ' active' : ''}`}
                    onClick={() => { setHifzMode('test'); stopHifz(); setRevealed({}); }}
                  >🧪 {ui.test}</button>
                </div>

                {/* Hifz selectors — one horizontal row */}
                <div className="qlc__cbar-selects qlc__cbar-selects--hifz">

                  <CtrlItem icon="▶" label={ui.fromVerse}>
                    <select className="qlc__cbar-select" value={fromV}
                      onChange={(e) => { stopHifz(); setFromV(Number(e.target.value)); }}>
                      {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </CtrlItem>

                  <div className="qlc__cbar-sep" />

                  <CtrlItem icon="⏹" label={ui.toVerse}>
                    <select className="qlc__cbar-select" value={toV}
                      onChange={(e) => { stopHifz(); setToV(Number(e.target.value)); }}>
                      {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </CtrlItem>

                  {hifzMode === 'repeat' && (
                    <>
                      <div className="qlc__cbar-sep" />
                      <CtrlItem icon="🔁" label={ui.repeatEach}>
                        <select className="qlc__cbar-select" value={repeatCount}
                          onChange={(e) => setRepeatCount(Number(e.target.value))}>
                          {REPEAT_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
                        </select>
                      </CtrlItem>

                      <div className="qlc__cbar-sep" />
                      <CtrlItem icon="🔄" label={ui.rangeRepeat || 'Range'}>
                        <select className="qlc__cbar-select" value={rangeRepeat}
                          onChange={(e) => setRangeRepeat(Number(e.target.value))}>
                          {RANGE_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
                        </select>
                      </CtrlItem>

                      <div className="qlc__cbar-sep" />
                      <CtrlItem icon="⏱" label={ui.delay || 'Delay'}>
                        <select className="qlc__cbar-select" value={hifzDelay}
                          onChange={(e) => setHifzDelay(Number(e.target.value))}>
                          {DELAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </CtrlItem>

                      <div className="qlc__cbar-sep" />
                      <CtrlItem icon="🎙" label={ui.reciter}>
                        <select className="qlc__cbar-select" value={reciterId}
                          onChange={(e) => { stopHifz(); setReciterId(Number(e.target.value)); }}>
                          {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </CtrlItem>
                    </>
                  )}

                  {hifzMode === 'test' && (
                    <>
                      <div className="qlc__cbar-sep" />
                      <CtrlItem icon="👁" label={ui.showTranslation}>
                        <label className="qlc__cbar-toggle">
                          <input type="checkbox" checked={showTrans} onChange={(e) => setShowTrans(e.target.checked)} />
                          <span>{showTrans ? 'ON' : 'OFF'}</span>
                        </label>
                      </CtrlItem>
                    </>
                  )}
                </div>

                {/* Play bar */}
                <div className="qlc__hifz-playbar">
                  {hifzMode === 'repeat' && (
                    navMode !== 'surah' ? (
                      <p className="qlc__hifz-warn">⚠ {ui.navSurah || 'Select a Surah'} to use Hifz mode</p>
                    ) : loadingVA ? (
                      <span className="qlc__hifz-status">{ui.loading}</span>
                    ) : !isPlaying ? (
                      <button className="btn btn--green qlc__hifz-startbtn" onClick={startHifz} disabled={!verseAudios.length}>
                        {ui.start}
                        <span className="qlc__hifz-startinfo">
                          {selectedVerses.length} {ui.verses} · {repeatCount}{ui.times}
                          {rangeRepeat > 1 ? ` · ${rangeRepeat}×` : ''}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button className="btn btn--ghost qlc__hifz-stopbtn" onClick={stopHifz}>{ui.stop}</button>
                        <div className="qlc__hifz-progress-wrap">
                          <span className="qlc__hifz-verse-label">{ui.verseOf} {fromV + curIdx}</span>
                          <div className="qlc__hifz-dots">
                            {Array.from({ length: Math.min(repeatCount, 20) }, (_, i) => (
                              <span key={i} className={`qlc__hdot${i < playCount ? ' on' : ''}`} />
                            ))}
                            {repeatCount > 20 && <span className="qlc__hdot-more">{playCount}/{repeatCount}</span>}
                          </div>
                          {rangeRepeat > 1 && (
                            <span className="qlc__hifz-range">
                              {ui.range || 'Range'} {rangeIteration + 1}/{rangeRepeat}
                            </span>
                          )}
                        </div>
                      </>
                    )
                  )}
                  {hifzMode === 'test' && (
                    <>
                      <button className="btn btn--ghost btn--sm" onClick={revealAll}>{ui.revealAll}</button>
                      <button className="btn btn--ghost btn--sm" onClick={hideAll}>{ui.hideAll}</button>
                    </>
                  )}
                </div>

                <audio ref={hifzAudio} onEnded={handleHifzEnded} style={{ display: 'none' }} />
              </div>
            )}

            {/* ═══════════════ LOADING / ERROR ════════════════════ */}
            {loading && (
              <div className="qlc__loading">
                <div className="qlc__spinner" />
              </div>
            )}
            {error && <p className="qlc__error">{error}</p>}

            {/* ═══════════════ ❸ BASMALAH ═════════════════════════ */}
            {!loading && !error && showBasmalah && tab !== 'hifz' && (
              <div className="qlc__basmalah-wrap">
                <p className="qlc__basmalah" dir="rtl">
                  بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                </p>
              </div>
            )}

            {/* ═══════════════ ❹ VERSE LIST ═══════════════════════ */}
            {!loading && !error && (
              <div className="qlc__verses-wrap">
                <ol className="qlc__verses" start={tab === 'hifz' ? fromV : 1}>
                  {(tab === 'hifz' ? selectedVerses : verses).map((v, idx) => {
                    const isActive = tab === 'hifz' && hifzMode === 'repeat' && isPlaying && idx === curIdx;
                    const isHidden = tab === 'hifz' && hifzMode === 'test' && !revealed[v.verse_key];
                    const tafsirOn = tafsirId > 0 && openTafsir[v.verse_key];

                    // Surah divider in page/juz modes
                    const list = tab === 'hifz' ? selectedVerses : verses;
                    const prevV = idx > 0 ? list[idx - 1] : null;
                    const surahBroke = prevV
                      ? v.verse_key.split(':')[0] !== prevV.verse_key.split(':')[0]
                      : true;

                    const vNum = Number(v.verse_key.split(':')[1]);

                    return (
                      <li
                        key={v.id}
                        id={`v-${v.verse_key}`}
                        className={`qlc__verse${isActive ? ' qlc__verse--active' : ''}`}
                      >
                        {/* Surah divider */}
                        {navMode !== 'surah' && surahBroke && (() => {
                          const ch = chapters.find((c) => c.id === Number(v.verse_key.split(':')[0]));
                          return ch ? (
                            <div className="qlc__divider">
                              <span className="qlc__divider-ar">{ch.name_arabic}</span>
                              <span className="qlc__divider-en">{ch.name_simple}</span>
                            </div>
                          ) : null;
                        })()}

                        {/* Arabic text — verse number embedded as ﴿n﴾ */}
                        <div className={`qlc__arabic-wrap${isHidden ? ' hidden' : ''}`}>
                          <p className="qlc__arabic" dir="rtl" lang="ar">
                            {isHidden ? (
                              <>{firstWords(v.text_uthmani, 3)}<span className="qlc__dots"> ···</span></>
                            ) : (
                              v.text_uthmani
                            )}
                            {!isHidden && <span className="qlc__vnum" aria-label={`Verse ${vNum}`}>﴿{vNum}﴾</span>}
                          </p>
                        </div>

                        {/* Translation */}
                        {translationId && v.translations?.[0] && !isHidden && (showTrans || tab === 'reading') && (
                          <p className="qlc__trans" dir="auto">
                            {clean(v.translations[0].text)}
                          </p>
                        )}

                        {/* Actions row: tafsir btn / play btn / reveal btn / meta */}
                        <div className="qlc__verse-foot">
                          <span className="qlc__vbadge">{v.verse_key}</span>

                          {navMode !== 'surah' && (
                            <span className="qlc__vmeta">
                              {v.page_number ? `📄${v.page_number}` : ''}
                              {v.juz_number  ? ` · J${v.juz_number}` : ''}
                            </span>
                          )}

                          <div className="qlc__verse-actions">
                            {tab === 'hifz' && hifzMode === 'repeat' && (
                              <button
                                className="qlc__playbtn"
                                onClick={() => { setCurIdx(idx); setIsPlaying(true); setTimeout(() => playVerse(idx), 50); }}
                                disabled={loadingVA}
                                title="Play verse"
                              >▶</button>
                            )}
                            {tab === 'hifz' && hifzMode === 'test' && (
                              <button className="qlc__revealbtn" onClick={() => toggleReveal(v.verse_key)}>
                                {revealed[v.verse_key] ? ui.hide : ui.reveal}
                              </button>
                            )}
                            {tab === 'reading' && tafsirId > 0 && (
                              <button
                                className={`qlc__tafsirbtn${tafsirOn ? ' active' : ''}`}
                                onClick={() => toggleTafsir(v.verse_key)}
                              >
                                📚 {ui.tafsir}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Active verse progress bar */}
                        {isActive && (
                          <div className="qlc__progress-bar">
                            <div className="qlc__progress-fill" style={{ width: `${(playCount / repeatCount) * 100}%` }} />
                          </div>
                        )}

                        {/* Tafsir panel */}
                        {tafsirOn && <TafsirPanel verseKey={v.verse_key} tafsirId={tafsirId} ui={ui} />}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
