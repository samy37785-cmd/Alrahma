import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import AlphabetLearner from '../components/features/AlphabetLearner';
import Tasbeeh from '../components/features/Tasbeeh';
import useSEO from '../hooks/useSEO';
import {
  getChapters, getVerses, getVersesByPage, getVersesByJuz,
  getChapterAudio, getVerseAudios, RECITERS,
} from '../api/quran';
import { TRANSLATIONS, TAFASEER, JUZ_NAMES, getUI } from '../data/quranLangs';
import TafsirPanel from '../components/features/quran/TafsirPanel';
import TafsirPicker from '../components/features/quran/TafsirPicker';
import { CtrlItem, KbdSidePanel, ShortcutsModal, SettingsPanel } from '../components/features/quran/QuranControls';

const HIFZ_RECITERS = RECITERS.filter((r) => r.verseId != null);

/* ── Helpers ──────────────────────────────────────────────────────── */
const clean = (html = '') =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const firstWords = (text, n = 3) => text.split(/\s+/).slice(0, n).join(' ');
const NO_BASMALAH = new Set([1, 9]);

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function Quran() {
  useSEO({
    title: 'Quran Learning Center — Al-Rahma Academy',
    description: 'Read, listen and memorise the Holy Quran in 40+ languages with 20+ reciters. Tafsir, Hifz mode, keyboard shortcuts.',
  });

  /* ── Persisted preferences ───────────────────────────────────── */
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('qlc-dark') === '1');
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('qlc-font') || 34));
  useEffect(() => { localStorage.setItem('qlc-dark', darkMode ? '1' : '0'); }, [darkMode]);
  useEffect(() => { localStorage.setItem('qlc-font', String(fontSize)); }, [fontSize]);

  /* ── Panel / UI state ────────────────────────────────────────── */
  const [showShortcuts,  setShowShortcuts] = useState(false);
  const [showSettings,   setShowSettings]  = useState(false);
  const [kbdPanelOpen,   setKbdPanelOpen]  = useState(false);
  const [copiedKey,      setCopiedKey]     = useState('');
  const [jumpVerse,      setJumpVerse]     = useState('');
  const [tafsirPicker,   setTafsirPicker]  = useState(null); // verse_key | null

  /* ── Core state ──────────────────────────────────────────────── */
  const [chapters, setChapters]             = useState([]);
  const [activeId, setActiveId]             = useState(1);
  const [reciterId, setReciterId]           = useState(7);
  const [verses, setVerses]                 = useState([]);
  const [audioUrl, setAudioUrl]             = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [search, setSearch]                 = useState('');
  const [navMode, setNavMode]               = useState('surah');
  const [pageNum, setPageNum]               = useState(1);
  const [juzNum, setJuzNum]                 = useState(1);
  const [lang, setLang]                     = useState('en');
  const ui                                  = getUI(lang);
  const transObj                            = TRANSLATIONS.find((t) => t.lang === lang) || TRANSLATIONS[0];
  const translationId                       = transObj.id;
  const [tab, setTab]                       = useState('reading');
  const [openTafsir, setOpenTafsir]         = useState({});
  const [tafsirId, setTafsirId]             = useState(0);
  const [hifzMode, setHifzMode]             = useState('repeat');
  const [fromV, setFromV]                   = useState(1);
  const [toV, setToV]                       = useState(10);
  const [repeatCount, setRepeatCount]       = useState(3);
  const [hifzDelay, setHifzDelay]           = useState(0);
  const [rangeRepeat, setRangeRepeat]       = useState(1);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [curIdx, setCurIdx]                 = useState(0);
  const [playCount, setPlayCount]           = useState(0);
  const [rangeIteration, setRangeIteration] = useState(0);
  const [verseAudios, setVerseAudios]       = useState([]);
  const [loadingVA, setLoadingVA]           = useState(false);
  const [revealed, setRevealed]             = useState({});
  const [showTrans, setShowTrans]           = useState(true);
  const [khatmDone, setKhatmDone]          = useState(
    () => { try { return JSON.parse(localStorage.getItem('khatm-done') || '[]'); } catch { return []; } }
  );
  useEffect(() => { localStorage.setItem('khatm-done', JSON.stringify(khatmDone)); }, [khatmDone]);

  const audioRef      = useRef(null);
  const hifzAudio     = useRef(null);
  const rangeCountRef = useRef(0);

  /* ── Deep-link: parse URL hash on first load ─────────────────── */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const p = new URLSearchParams(hash);
    const s = parseInt(p.get('s'));
    const v = parseInt(p.get('v'));
    if (s >= 1 && s <= 114) {
      setActiveId(s); setNavMode('surah');
      if (v >= 1) {
        const tryScroll = (n = 0) => {
          const el = document.getElementById(`v-${s}:${v}`);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
          if (n < 12) setTimeout(() => tryScroll(n + 1), 300);
        };
        setTimeout(() => tryScroll(), 900);
      }
    }
  }, []);

  /* ── Update URL hash on surah change ────────────────────────── */
  useEffect(() => {
    if (navMode === 'surah') window.history.replaceState(null, '', `#s=${activeId}`);
  }, [activeId, navMode]);

  /* ── Load chapters ───────────────────────────────────────────── */
  useEffect(() => { getChapters().then(setChapters).catch(() => {}); }, []);

  /* ── Load verses + chapter audio ────────────────────────────── */
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
  }, [activeId, reciterId, translationId, navMode, pageNum, juzNum, ui]);

  /* ── Load per-verse audio for Hifz ──────────────────────────── */
  useEffect(() => {
    if (tab !== 'hifz' || navMode !== 'surah') return;
    setLoadingVA(true);
    getVerseAudios(activeId, reciterId).then(setVerseAudios).catch(() => setVerseAudios([]))
      .finally(() => setLoadingVA(false));
  }, [tab, activeId, reciterId, navMode]);

  /* ── Derived ─────────────────────────────────────────────────── */
  const selectedVerses = verses.slice(fromV - 1, toV);
  const displayVerses  = tab === 'hifz' ? selectedVerses : verses;
  const audioMap       = Object.fromEntries(verseAudios.map((a) => [a.verse_key, a.url]));
  const activeChapter  = chapters.find((c) => c.id === activeId);
  const filtered       = chapters.filter(
    (c) => c.name_simple.toLowerCase().includes(search.toLowerCase()) ||
           c.name_arabic.includes(search) || String(c.id).includes(search)
  );

  /* ── Auto-scroll to playing verse ───────────────────────────── */
  useEffect(() => {
    if (!isPlaying || curIdx < 0) return;
    const key = selectedVerses[curIdx]?.verse_key;
    if (!key) return;
    const el = document.getElementById(`v-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [curIdx, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const startHifz = useCallback(() => {
    rangeCountRef.current = 0; setRangeIteration(0);
    setIsPlaying(true); setCurIdx(0); setPlayCount(0);
    setTimeout(() => playVerse(0), 100);
  }, [playVerse]);

  const stopHifz = useCallback(() => {
    setIsPlaying(false);
    hifzAudio.current?.pause();
    if (hifzAudio.current) hifzAudio.current.currentTime = 0;
    setCurIdx(0); setPlayCount(0); rangeCountRef.current = 0; setRangeIteration(0);
  }, []);

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  // Declared after startHifz/stopHifz so they are initialized before this
  // effect's dependency array references them (avoids a TDZ ReferenceError).
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      switch (e.key) {
        case '?': setShowShortcuts((v) => !v); break;
        case 'g': case 'G': setShowSettings((v) => !v); break;
        case 'k': case 'K': setKbdPanelOpen((v) => !v); break;
        case 'p': case 'P': window.print(); break;
        case 'Escape':
          setShowShortcuts(false); setShowSettings(false); setKbdPanelOpen(false); stopHifz();
          break;
        case ' ':
          e.preventDefault();
          if (tab === 'tasbeeh') { break; }
          if (tab === 'hifz') { isPlaying ? stopHifz() : startHifz(); }
          else if (audioRef.current) {
            audioRef.current.paused ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
          }
          break;
        case 'ArrowRight':
          if (navMode === 'surah') setActiveId((v) => Math.max(1, v - 1));
          else if (navMode === 'page') goPage(pageNum - 1);
          else if (navMode === 'juz') setJuzNum((v) => Math.max(1, v - 1));
          break;
        case 'ArrowLeft':
          if (navMode === 'surah') setActiveId((v) => Math.min(114, v + 1));
          else if (navMode === 'page') goPage(pageNum + 1);
          else if (navMode === 'juz') setJuzNum((v) => Math.min(30, v + 1));
          break;
        case 'd': case 'D': setDarkMode((v) => !v); break;
        case 't': case 'T': setShowTrans((v) => !v); break;
        case '+': case '=': setFontSize((v) => Math.min(v + 2, 52)); break;
        case '-': setFontSize((v) => Math.max(v - 2, 22)); break;
        default: {
          const n = Number(e.key);
          if (n >= 1 && n <= 9 && navMode === 'surah') setActiveId(n);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, isPlaying, navMode, activeId, pageNum, juzNum, startHifz, stopHifz]);

  /* ── Verse actions ───────────────────────────────────────────── */
  const toggleReveal = (key) => setRevealed((p) => ({ ...p, [key]: !p[key] }));
  const revealAll    = () => { const m = {}; selectedVerses.forEach((v) => (m[v.verse_key] = true)); setRevealed(m); };
  const hideAll      = () => setRevealed({});
  const toggleTafsir = (key) => setOpenTafsir((p) => ({ ...p, [key]: !p[key] }));

  const copyVerse = async (verse) => {
    const parts = [verse.text_uthmani];
    if (verse.translations?.[0]) parts.push(clean(verse.translations[0].text));
    parts.push(`[${verse.verse_key}]`);
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopiedKey(`copy-${verse.verse_key}`);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch { /* ignore */ }
  };

  const shareVerse = async (verse) => {
    const [s, v] = verse.verse_key.split(':');
    const url = `${window.location.origin}/quran#s=${s}&v=${v}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(`share-${verse.verse_key}`);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch { /* ignore */ }
  };

  /* ── Jump to verse ───────────────────────────────────────────── */
  const doJumpVerse = (numStr) => {
    const n = parseInt(numStr);
    if (!n || n < 1) return;
    const target = displayVerses[n - 1];
    if (!target) return;
    const el = document.getElementById(`v-${target.verse_key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setJumpVerse('');
  };

  /* ── Navigation helpers ──────────────────────────────────────── */
  const selectSurah     = (id) => { setActiveId(id); setNavMode('surah'); stopHifz(); setRevealed({}); setOpenTafsir({}); };
  const selectFromKhatm = (id) => { setActiveId(id); stopHifz(); setRevealed({}); setOpenTafsir({}); };
  const toggleKhatm     = (id) => setKhatmDone((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const changeLang  = (l)  => { setLang(l); stopHifz(); };
  const goPage      = (n)  => { setPageNum(Math.max(1, Math.min(604, n))); setNavMode('page'); setOpenTafsir({}); };
  const goJuz       = (n)  => { setJuzNum(n); setNavMode('juz'); setOpenTafsir({}); };

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

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className={`qlc${darkMode ? ' qlc--dark' : ''}`}>

      {/* ════ KSU-STYLE: Keyboard shortcuts SIDE PANEL ════════════ */}
      <KbdSidePanel open={kbdPanelOpen} onToggle={() => setKbdPanelOpen((v) => !v)} />

      {/* ════ SHORTCUTS MODAL (full, opened by ?) ════════════════ */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* ════ SETTINGS PANEL ═══════════════════════════════════════ */}
      {showSettings && (
        <SettingsPanel
          fontSize={fontSize} setFontSize={setFontSize}
          darkMode={darkMode} setDarkMode={setDarkMode}
          showTrans={showTrans} setShowTrans={setShowTrans}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ════ TOP BAR ══════════════════════════════════════════════ */}
      <header className="qlc__bar">
        <div className="qlc__bar-inner">
          <Brand />

          <nav className="qlc__tabs">
            {[
              { key: 'reading',  icon: '📖', label: ui.reading },
              { key: 'hifz',     icon: '🧠', label: ui.hifz },
              { key: 'tasbeeh',  icon: '📿', label: 'تسبيح' },
              { key: 'alphabet', icon: '🔤', label: ui.alphabet },
            ].map((t) => (
              <button
                key={t.key}
                className={`qlc__tab${tab === t.key ? ' qlc__tab--active' : ''}`}
                onClick={() => { setTab(t.key); stopHifz(); }}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>

          <div className="qlc__bar-right">
            <div className="qlc__lang-wrap">
              <span>🌍</span>
              <select className="qlc__lang-select" value={lang} onChange={(e) => changeLang(e.target.value)}>
                {TRANSLATIONS.map((t) => (
                  <option key={t.lang} value={t.lang}>{t.flag} {t.label}</option>
                ))}
              </select>
            </div>

            <button className="qlc__bar-icon" onClick={() => setShowSettings((v) => !v)} title="Settings (G)">⚙</button>
            <button
              className={`qlc__bar-icon${kbdPanelOpen ? ' active' : ''}`}
              onClick={() => setKbdPanelOpen((v) => !v)}
              title="Keyboard panel (K)"
            >⌨</button>
            <button
              className={`qlc__bar-icon${darkMode ? ' active' : ''}`}
              onClick={() => setDarkMode((v) => !v)}
              title="Dark mode (D)"
            >🌙</button>
            <button className="qlc__bar-icon" onClick={() => window.print()} title="Print (P)">🖨</button>

            <Link to="/" className="btn btn--ghost btn--sm qlc__back">{ui.back}</Link>
          </div>
        </div>
      </header>

      {/* ════ ALPHABET ══════════════════════════════════════════════ */}
      {tab === 'alphabet' && (
        <div className="qlc__alphabet-wrap container">
          <AlphabetLearner onClose={() => setTab('reading')} />
        </div>
      )}

      {tab === 'tasbeeh' && (
        <div className="qlc__tasbeeh-wrap">
          <Tasbeeh />
        </div>
      )}

      {/* ════ MAIN LAYOUT ══════════════════════════════════════════ */}
      {tab !== 'alphabet' && tab !== 'tasbeeh' && (
        <div className="qlc__layout">

          {/* ━━━━━━━━━━━━━━  SIDEBAR  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <aside className="qlc__sidebar">
            <div className="qlc__nav-tabs">
              {[
                { key: 'surah', label: ui.navSurah || 'Surah' },
                { key: 'page',  label: ui.navPage  || 'Page' },
                { key: 'juz',   label: ui.navJuz   || 'Juz' },
                { key: 'khatm', label: 'ختمة' },
              ].map((m) => (
                <button
                  key={m.key}
                  className={`qlc__nav-tab${navMode === m.key ? ' active' : ''}`}
                  onClick={() => {
                    if (m.key === 'surah') setNavMode('surah');
                    if (m.key === 'page')  setNavMode('page');
                    if (m.key === 'juz')   setNavMode('juz');
                    if (m.key === 'khatm') setNavMode('khatm');
                  }}
                >{m.label}</button>
              ))}
            </div>

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

            {navMode === 'page' && (
              <div className="qlc__page-nav">
                <p className="qlc__page-label">{ui.page || 'Page'} (1–604)</p>
                <div className="qlc__page-row">
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum - 1)} disabled={pageNum <= 1}>‹</button>
                  <input type="number" className="qlc__page-input" value={pageNum} min={1} max={604}
                    onChange={(e) => goPage(Number(e.target.value))} />
                  <button className="qlc__page-arrow" onClick={() => goPage(pageNum + 1)} disabled={pageNum >= 604}>›</button>
                </div>
                <div className="qlc__page-grid">
                  {Array.from({ length: 30 }, (_, i) => i * 20 + 1).map((p) => (
                    <button key={p}
                      className={`qlc__page-chip${pageNum >= p && pageNum < p + 20 ? ' active' : ''}`}
                      onClick={() => goPage(p)}>{p}</button>
                  ))}
                </div>
              </div>
            )}

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

            {navMode === 'khatm' && (
              <div className="qlc__khatm">
                <div className="qlc__khatm-header">
                  <div className="qlc__khatm-bar">
                    <div className="qlc__khatm-fill" style={{ width: `${(khatmDone.length / 114) * 100}%` }} />
                  </div>
                  <div className="qlc__khatm-meta">
                    <span className="qlc__khatm-pct">{khatmDone.length}/114 سورة</span>
                    <button className="qlc__khatm-new" onClick={() => setKhatmDone([])}>ختمة جديدة ↺</button>
                  </div>
                </div>
                <ul className="qlc__khatm-list">
                  {chapters.map((c) => (
                    <li key={c.id} className={`qlc__khatm-item${khatmDone.includes(c.id) ? ' done' : ''}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={khatmDone.includes(c.id)}
                          onChange={() => toggleKhatm(c.id)}
                        />
                        <button className="qlc__khatm-surah" onClick={() => selectFromKhatm(c.id)}>
                          <span className="qlc__khatm-snum">{c.id}</span>
                          <span className="qlc__khatm-sname">{c.name_simple}</span>
                          <span className="qlc__khatm-sar">{c.name_arabic}</span>
                        </button>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* ━━━━━━━━━━━━━━  MAIN  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <main className="qlc__main" dir="ltr">

            {/* ═══ ❶ CHAPTER HEADER ══════════════════════════════ */}
            <div className="qlc__chapter-header">
              {(navMode === 'surah' || navMode === 'khatm') && activeChapter ? (
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

            {/* ═══ ❷ READING CONTROLS BAR ════════════════════════ */}
            {tab === 'reading' && (
              <div className="qlc__cbar">
                <div className="qlc__cbar-selects">
                  <CtrlItem icon="🎙" label={ui.reciter}>
                    <select className="qlc__cbar-select" value={reciterId}
                      onChange={(e) => setReciterId(Number(e.target.value))}>
                      {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </CtrlItem>
                  <div className="qlc__cbar-sep" />
                  <CtrlItem icon="🌐" label={ui.translation}>
                    <select className="qlc__cbar-select" value={lang} onChange={(e) => changeLang(e.target.value)}>
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
                      onChange={(e) => { setTafsirId(Number(e.target.value)); setOpenTafsir({}); setTafsirPicker(null); }}
                    >
                      <option value={0}>— اختر تفسيراً —</option>
                      <optgroup label="تفاسير عربية">
                        {TAFASEER.filter((t) => t.lang === 'ar').map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Other languages">
                        {TAFASEER.filter((t) => t.lang !== 'ar').map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.lang.toUpperCase()})</option>
                        ))}
                      </optgroup>
                    </select>
                  </CtrlItem>
                  <div className="qlc__cbar-sep" />
                  {/* Quick font-size control in reading bar */}
                  <div className="qlc__cbar-item">
                    <span className="qlc__cbar-label">🔤 Font</span>
                    <div className="qlc__cbar-font-row">
                      <button className="qlc__cbar-font-btn" onClick={() => setFontSize((v) => Math.max(v - 2, 22))}>A−</button>
                      <span className="qlc__cbar-font-val">{fontSize}px</span>
                      <button className="qlc__cbar-font-btn" onClick={() => setFontSize((v) => Math.min(v + 2, 52))}>A+</button>
                    </div>
                  </div>
                </div>

                {navMode === 'surah' && audioUrl && (
                  <div className="qlc__cbar-player">
                    <span className="qlc__cbar-reciter-name">
                      ♪ {RECITERS.find((r) => r.id === reciterId)?.name}
                    </span>
                    <audio ref={audioRef} controls src={audioUrl} className="qlc__audio"
                      key={`${activeId}-${reciterId}`} />
                  </div>
                )}
              </div>
            )}

            {/* ═══ ❷ HIFZ CONTROLS ═══════════════════════════════ */}
            {tab === 'hifz' && (
              <div className="qlc__cbar qlc__cbar--hifz">
                <div className="qlc__hifz-modetabs">
                  <button className={`qlc__hifz-modetab${hifzMode === 'repeat' ? ' active' : ''}`}
                    onClick={() => { setHifzMode('repeat'); stopHifz(); }}>🔁 {ui.repeat}</button>
                  <button className={`qlc__hifz-modetab${hifzMode === 'test' ? ' active' : ''}`}
                    onClick={() => { setHifzMode('test'); stopHifz(); setRevealed({}); }}>🧪 {ui.test}</button>
                </div>

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
                      {/* Hifz reciter: only show those with per-verse audio */}
                      <CtrlItem icon="🎙" label={ui.reciter}>
                        <select className="qlc__cbar-select" value={reciterId}
                          onChange={(e) => {
                            stopHifz();
                            const v = Number(e.target.value);
                            setReciterId(HIFZ_RECITERS.find((r) => r.id === v) ? v : HIFZ_RECITERS[0].id);
                          }}>
                          {HIFZ_RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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

                <div className="qlc__hifz-playbar">
                  {hifzMode === 'repeat' && (
                    navMode !== 'surah' ? (
                      <p className="qlc__hifz-warn">⚠ Select a Surah first</p>
                    ) : !HIFZ_RECITERS.find((r) => r.id === reciterId) ? (
                      <p className="qlc__hifz-warn">
                        ⚠ This reciter has no per-verse audio. Choose another reciter above.
                      </p>
                    ) : loadingVA ? (
                      <span className="qlc__hifz-status">{ui.loading}</span>
                    ) : !isPlaying ? (
                      <button className="btn btn--green qlc__hifz-startbtn" onClick={startHifz} disabled={!verseAudios.length}>
                        ▶ {ui.start}
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
                            {repeatCount > 20 && (
                              <span className="qlc__hdot-more">{playCount}/{repeatCount}</span>
                            )}
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

            {/* ═══ LOADING / ERROR ══════════════════════════════ */}
            {loading && <div className="qlc__loading"><div className="qlc__spinner" /></div>}
            {error   && <p className="qlc__error">{error}</p>}

            {/* ═══ JUMP-TO-VERSE bar ═══════════════════════════════ */}
            {!loading && !error && displayVerses.length > 0 && (
              <div className="qlc__jump-bar">
                <span className="qlc__jump-label">{ui.jump || 'Jump to verse'}</span>
                <input
                  className="qlc__jump-input"
                  type="number" min={1} max={displayVerses.length}
                  placeholder="1"
                  value={jumpVerse}
                  onChange={(e) => setJumpVerse(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') doJumpVerse(jumpVerse); }}
                />
                <span className="qlc__jump-of">/ {displayVerses.length}</span>
                <button className="qlc__jump-btn" onClick={() => doJumpVerse(jumpVerse)}>↵ Go</button>
              </div>
            )}

            {/* ═══ ❸ BASMALAH ══════════════════════════════════════ */}
            {!loading && !error && showBasmalah && tab !== 'hifz' && (
              <div className="qlc__basmalah-wrap">
                <p className="qlc__basmalah" dir="rtl">
                  بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                </p>
              </div>
            )}

            {/* ═══ ❹ VERSE LIST ════════════════════════════════════ */}
            {!loading && !error && (
              <div className="qlc__verses-wrap">
                <ol className="qlc__verses" start={tab === 'hifz' ? fromV : 1}>
                  {displayVerses.map((v, idx) => {
                    const isActive   = tab === 'hifz' && hifzMode === 'repeat' && isPlaying && idx === curIdx;
                    const isHidden   = tab === 'hifz' && hifzMode === 'test' && !revealed[v.verse_key];
                    const tafsirOn   = tafsirId !== 0 && openTafsir[v.verse_key];
                    const prevV      = idx > 0 ? displayVerses[idx - 1] : null;
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
                        {/* Surah divider in page/juz mode */}
                        {navMode !== 'surah' && surahBroke && (() => {
                          const ch = chapters.find((c) => c.id === Number(v.verse_key.split(':')[0]));
                          return ch ? (
                            <div className="qlc__divider">
                              <span className="qlc__divider-ar">{ch.name_arabic}</span>
                              <span className="qlc__divider-en">{ch.name_simple}</span>
                            </div>
                          ) : null;
                        })()}

                        {/* Now-playing badge */}
                        {isActive && (
                          <div className="qlc__now-playing">
                            <span className="qlc__np-dot" />
                            <span>Now Playing · {playCount}/{repeatCount}</span>
                          </div>
                        )}

                        {/* Arabic text */}
                        <p className="qlc__arabic" dir="rtl" lang="ar" style={{ fontSize: `${fontSize}px` }}>
                          {isHidden
                            ? <><span>{firstWords(v.text_uthmani, 3)}</span><span className="qlc__dots"> ···</span></>
                            : v.text_uthmani
                          }
                          {!isHidden && <span className="qlc__vnum">﴿{vNum}﴾</span>}
                        </p>

                        {/* Translation */}
                        {translationId && v.translations?.[0] && !isHidden && (showTrans || tab === 'reading') && (
                          <p className="qlc__trans" dir="auto">{clean(v.translations[0].text)}</p>
                        )}

                        {/* Verse footer */}
                        <div className="qlc__verse-foot">
                          <span className="qlc__vbadge">{v.verse_key}</span>
                          {navMode !== 'surah' && v.page_number && (
                            <span className="qlc__vmeta">📄{v.page_number} · J{v.juz_number}</span>
                          )}

                          <div className="qlc__verse-actions">
                            {/* Copy verse */}
                            <button
                              className={`qlc__actbtn${copiedKey === `copy-${v.verse_key}` ? ' copied' : ''}`}
                              onClick={() => copyVerse(v)}
                              title="Copy verse (text + translation)"
                            >
                              {copiedKey === `copy-${v.verse_key}` ? '✓' : '📋'}
                            </button>

                            {/* Share link */}
                            <button
                              className={`qlc__actbtn${copiedKey === `share-${v.verse_key}` ? ' copied' : ''}`}
                              onClick={() => shareVerse(v)}
                              title="Copy link to this verse"
                            >
                              {copiedKey === `share-${v.verse_key}` ? '✓' : '🔗'}
                            </button>

                            {/* Hifz per-verse play button */}
                            {tab === 'hifz' && hifzMode === 'repeat' && (
                              <button
                                className="qlc__actbtn qlc__actbtn--play"
                                onClick={() => {
                                  setCurIdx(idx); setIsPlaying(true);
                                  setTimeout(() => playVerse(idx), 50);
                                }}
                                disabled={loadingVA}
                              >▶</button>
                            )}

                            {/* Test mode reveal */}
                            {tab === 'hifz' && hifzMode === 'test' && (
                              <button className="qlc__revealbtn" onClick={() => toggleReveal(v.verse_key)}>
                                {revealed[v.verse_key] ? ui.hide : ui.reveal}
                              </button>
                            )}

                            {/* Tafsir button — always visible in reading mode */}
                            {tab === 'reading' && (
                              <button
                                className={`qlc__tafsirbtn${tafsirOn ? ' active' : ''}`}
                                onClick={() => {
                                  if (tafsirOn) {
                                    toggleTafsir(v.verse_key);
                                  } else if (tafsirId !== 0) {
                                    toggleTafsir(v.verse_key);
                                  } else {
                                    setTafsirPicker(
                                      tafsirPicker === v.verse_key ? null : v.verse_key
                                    );
                                  }
                                }}
                                title="تفسير الآية"
                              >
                                📚 {ui.tafsir}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Active-verse progress bar */}
                        {isActive && (
                          <div className="qlc__progress-bar">
                            <div className="qlc__progress-fill"
                              style={{ width: `${(playCount / repeatCount) * 100}%` }} />
                          </div>
                        )}

                        {/* Tafsir picker (inline dropdown) */}
                        {tafsirPicker === v.verse_key && !tafsirOn && (
                          <TafsirPicker
                            onSelect={(tid) => {
                              setTafsirId(tid);
                              setOpenTafsir((p) => ({ ...p, [v.verse_key]: true }));
                              setTafsirPicker(null);
                            }}
                            onClose={() => setTafsirPicker(null)}
                          />
                        )}

                        {/* Tafsir panel */}
                        {tafsirOn && (
                          <TafsirPanel
                            verseKey={v.verse_key}
                            tafsirId={tafsirId}
                            ui={ui}
                            onClose={() => toggleTafsir(v.verse_key)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ════ FLOATING HIFZ BAR (sticks to bottom while playing) ══ */}
      {tab === 'hifz' && hifzMode === 'repeat' && isPlaying && selectedVerses[curIdx] && (
        <div className="qlc__float-bar">
          <div className="qlc__float-info">
            <span className="qlc__float-key">{selectedVerses[curIdx].verse_key}</span>
            <span className="qlc__float-ar" dir="rtl">
              {selectedVerses[curIdx].text_uthmani.slice(0, 80)}
              {selectedVerses[curIdx].text_uthmani.length > 80 ? '…' : ''}
            </span>
          </div>
          <div className="qlc__float-right">
            <span className="qlc__float-count">{playCount}/{repeatCount}×</span>
            {rangeRepeat > 1 && (
              <span className="qlc__float-range">{rangeIteration + 1}/{rangeRepeat}</span>
            )}
            <button className="qlc__float-stop" onClick={stopHifz}>{ui.stop}</button>
          </div>
          <div className="qlc__float-progress">
            <div className="qlc__float-fill"
              style={{ width: `${(curIdx / selectedVerses.length) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
