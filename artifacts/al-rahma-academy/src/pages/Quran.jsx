import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import '../styles/quran.css';
import '../styles/khatm.css';
import '../styles/quran-mushaf.css';
import '../styles/hifz.css';
import { loadArabicFontsNow } from '../utils/loadArabicFonts';
import { useTheme } from '../context/ThemeContext';

// Verse text is Arabic almost end-to-end here — trigger the Amiri font swap
// immediately instead of waiting for the generic idle-callback in main.jsx.
loadArabicFontsNow();
import useSEO from '../hooks/useSEO';
import {
  getChapters, getVerses, getVersesByPage, getVersesByJuz, getVersesByHizb,
  getChapterAudio, getVerseAudios, RECITERS,
} from '../api/quran';
import { TRANSLATIONS, getUI } from '../data/quranLangs';
import { KbdSidePanel, ShortcutsModal, SettingsPanel } from '../components/features/quran/QuranControls';
import QuranTopBar         from '../components/features/quran/QuranTopBar';
import QuranSidebar        from '../components/features/quran/QuranSidebar';
import QuranChapterHeader  from '../components/features/quran/QuranChapterHeader';
import QuranReadingControls from '../components/features/quran/QuranReadingControls';
import QuranHifzControls   from '../components/features/quran/QuranHifzControls';
import QuranVerseList      from '../components/features/quran/QuranVerseList';
import QuranMushafPage     from '../components/features/quran/QuranMushafPage';
import ReadingModeSwitch   from '../components/features/quran/ReadingModeSwitch';
import QuranSyncPlayer     from '../components/features/quran/QuranSyncPlayer';
import QuranQuickNav       from '../components/features/quran/QuranQuickNav';
import QuranFloatingBar    from '../components/features/quran/QuranFloatingBar';
import { useQuranHifz }         from '../hooks/useQuranHifz';
import { useQuranKeyboard }     from '../hooks/useQuranKeyboard';
import { useQuranVerseActions } from '../hooks/useQuranVerseActions';
import { useQuranBookmarks, useAddBookmark, useRemoveBookmark } from '../hooks/useQuranBookmarks';
import VerseCardModal           from '../components/ui/VerseCardModal';

const HIFZ_RECITERS = RECITERS.filter((r) => r.verseId != null);
const NO_BASMALAH   = new Set([1, 9]);

export default function Quran() {
  useSEO({
    title: 'Quran Learning Center',
    description: 'Read, listen and memorise the Holy Quran in 40+ languages with 20+ reciters. Tafsir, Hifz mode, keyboard shortcuts.',
  });

  /* ── Persisted preferences ───────────────────────────────────── */
  const { dark: darkMode, toggle: toggleDark } = useTheme();
  const setDarkMode = (next) => {
    const target = typeof next === 'function' ? next(darkMode) : next;
    if (target !== darkMode) toggleDark();
  };
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('qlc-font') || 34));
  useEffect(() => { localStorage.setItem('qlc-font', String(fontSize)); }, [fontSize]);
  const [readingMode, setReadingMode] = useState(() => localStorage.getItem('qlc-reading-mode') || 'continuous');
  useEffect(() => { localStorage.setItem('qlc-reading-mode', readingMode); }, [readingMode]);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [sepia, setSepia] = useState(() => localStorage.getItem('qlc-sepia') === '1');
  useEffect(() => { localStorage.setItem('qlc-sepia', sepia ? '1' : '0'); }, [sepia]);
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('qlc-line-height') || 2.3));
  useEffect(() => { localStorage.setItem('qlc-line-height', String(lineHeight)); }, [lineHeight]);
  const [contentWidth, setContentWidth] = useState(() => localStorage.getItem('qlc-content-width') || 'wide');
  useEffect(() => { localStorage.setItem('qlc-content-width', contentWidth); }, [contentWidth]);
  const CONTENT_WIDTHS = { narrow: '640px', medium: '820px', wide: '100%' };
  const readingTheme = darkMode ? 'dark' : sepia ? 'sepia' : 'light';
  const setReadingTheme = (theme) => {
    setDarkMode(theme === 'dark');
    setSepia(theme === 'sepia');
  };

  /* ── Panel / UI state ────────────────────────────────────────── */
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [kbdPanelOpen,  setKbdPanelOpen]  = useState(false);
  const [copiedKey,     setCopiedKey]     = useState('');
  const [jumpVerse,     setJumpVerse]     = useState('');
  const [tafsirPicker,  setTafsirPicker]  = useState(null);

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
  const [hizbNum, setHizbNum]               = useState(1);
  const [quickNavOpen, setQuickNavOpen]     = useState(false);
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
  const [hifzTime, setHifzTime]             = useState(0);
  const [hifzDuration, setHifzDuration]     = useState(0);
  const [khatmDone, setKhatmDone]           = useState(
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
      navMode === 'hizb' ? getVersesByHizb(hizbNum, translationId) :
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
  }, [activeId, reciterId, translationId, navMode, pageNum, juzNum, hizbNum, ui]);

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
  const showBasmalah = navMode === 'surah' && !NO_BASMALAH.has(activeId);

  /* ── Auto-scroll to playing verse ───────────────────────────── */
  useEffect(() => {
    if (!isPlaying || curIdx < 0) return;
    const key = selectedVerses[curIdx]?.verse_key;
    if (!key) return;
    const el = document.getElementById(`v-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [curIdx, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Hifz playback (logic extracted to hook) ─────────────────── */
  const { playVerse, startHifz, stopHifz, handleHifzEnded } = useQuranHifz({
    hifzAudio, rangeCountRef, selectedVerses, audioMap,
    repeatCount, hifzDelay, rangeRepeat,
    curIdx, setCurIdx, setIsPlaying, setPlayCount, setRangeIteration,
  });

  /* ── Navigation helpers ──────────────────────────────────────── */
  const goPage      = useCallback((n)  => { setPageNum(Math.max(1, Math.min(604, n))); setNavMode('page'); setOpenTafsir({}); }, []);
  const goJuz       = useCallback((n)  => { setJuzNum(n); setNavMode('juz'); setOpenTafsir({}); }, []);
  const goHizb      = useCallback((n)  => { setHizbNum(Math.max(1, Math.min(60, n))); setNavMode('hizb'); setOpenTafsir({}); }, []);
  const selectSurah     = (id) => { setActiveId(id); setNavMode('surah'); stopHifz(); setRevealed({}); setOpenTafsir({}); setSidebarOpen(false); };
  const selectFromKhatm = (id) => { setActiveId(id); stopHifz(); setRevealed({}); setOpenTafsir({}); setSidebarOpen(false); };
  const toggleKhatm     = (id) => setKhatmDone((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const changeLang  = (l)  => { setLang(l); stopHifz(); };

  /* ── Page-turn navigation: one prev/next handler shared by keyboard
     arrows, tap zones and swipe gestures — reuses each nav mode's existing
     "unit" semantics (prev/next surah, page, juz or hizb). ──────────── */
  const goRelative = useCallback((dir) => {
    if (navMode === 'surah') setActiveId((v) => Math.max(1, Math.min(114, v + dir)));
    else if (navMode === 'page') goPage(pageNum + dir);
    else if (navMode === 'juz') setJuzNum((v) => Math.max(1, Math.min(30, v + dir)));
    else if (navMode === 'hizb') setHizbNum((v) => Math.max(1, Math.min(60, v + dir)));
  }, [navMode, pageNum, goPage]);
  const canGoPrev =
    navMode === 'surah' ? activeId > 1 :
    navMode === 'page'  ? pageNum > 1  :
    navMode === 'juz'   ? juzNum > 1   :
    navMode === 'hizb'  ? hizbNum > 1  : false;
  const canGoNext =
    navMode === 'surah' ? activeId < 114 :
    navMode === 'page'  ? pageNum < 604  :
    navMode === 'juz'   ? juzNum < 30    :
    navMode === 'hizb'  ? hizbNum < 60   : false;

  /* ── Reading Mode / immersive chrome ────────────────────────────── */
  useEffect(() => { setChromeHidden(false); }, [tab, readingMode]);

  /* ── Quick-nav "jump to surah:verse" — reuses the same scroll retry
     loop as the initial deep-link effect above. ────────────────────── */
  const jumpToVerse = useCallback((s, v) => {
    setActiveId(s); setNavMode('surah');
    const tryScroll = (n = 0) => {
      const el = document.getElementById(`v-${s}:${v}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (n < 12) setTimeout(() => tryScroll(n + 1), 300);
    };
    setTimeout(() => tryScroll(), 400);
  }, []);

  /* ── Bookmarks ─────────────────────────────────────────────────────── */
  const { data: bookmarks } = useQuranBookmarks();
  const addBookmarkMutation    = useAddBookmark();
  const removeBookmarkMutation = useRemoveBookmark();
  const bookmarkedKeys = useMemo(() => new Set((bookmarks ?? []).map((b) => b.verseKey)), [bookmarks]);
  const bookmarksByKey = useMemo(() => new Map((bookmarks ?? []).map((b) => [b.verseKey, b])), [bookmarks]);
  const isBookmarked   = useCallback((verseKey) => bookmarkedKeys.has(verseKey), [bookmarkedKeys]);
  const getBookmark    = useCallback((verseKey) => bookmarksByKey.get(verseKey), [bookmarksByKey]);
  const toggleBookmark = useCallback((verse) => {
    if (bookmarkedKeys.has(verse.verse_key)) {
      removeBookmarkMutation.mutate(verse.verse_key);
    } else {
      const [chId, vNum] = verse.verse_key.split(':').map(Number);
      addBookmarkMutation.mutate({ verseKey: verse.verse_key, chapterId: chId, verseNum: vNum });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkedKeys]);
  // Notes and highlights live on the same bookmark row — saving either one
  // auto-bookmarks the verse (there's no note/highlight-only row in the
  // schema) and must carry the other field forward so it isn't wiped out.
  const saveNote = useCallback((verse, note) => {
    const existing = bookmarksByKey.get(verse.verse_key);
    const [chId, vNum] = verse.verse_key.split(':').map(Number);
    addBookmarkMutation.mutate({ verseKey: verse.verse_key, chapterId: chId, verseNum: vNum, note, color: existing?.color || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarksByKey]);
  const setHighlight = useCallback((verse, color) => {
    const existing = bookmarksByKey.get(verse.verse_key);
    const [chId, vNum] = verse.verse_key.split(':').map(Number);
    addBookmarkMutation.mutate({ verseKey: verse.verse_key, chapterId: chId, verseNum: vNum, note: existing?.note || '', color });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarksByKey]);

  /* ── Keyboard shortcuts (logic extracted to hook) ─────────────── */
  useQuranKeyboard({
    tab, isPlaying, navMode,
    startHifz, stopHifz, audioRef, toggleDark,
    setShowShortcuts, setShowSettings, setKbdPanelOpen,
    setActiveId, setFontSize, setShowTrans, goRelative,
    onQuickNavToggle: setQuickNavOpen,
  });

  /* ── Continuous-mode progress indicator ("Page 145 / 604" etc.) ─── */
  const progressLabel =
    !verses.length ? '' :
    navMode === 'page'  ? `${ui.page  || 'Page'} ${pageNum} / 604` :
    navMode === 'juz'   ? `${ui.juz   || 'Juz'} ${juzNum} / 30`    :
    navMode === 'hizb'  ? `${ui.hizb  || 'Hizb'} ${hizbNum} / 60`  :
    navMode === 'surah' ? `${ui.navSurah || 'Surah'} ${activeId} / 114` : '';

  /* ── Verse actions (logic extracted to hook) ─────────────────── */
  const { toggleReveal, revealAll, hideAll, toggleTafsir, copyVerse, shareVerse, doJumpVerse, cardVerse, showCard, closeCard } =
    useQuranVerseActions({ selectedVerses, displayVerses, setRevealed, setOpenTafsir, setCopiedKey, setJumpVerse });

  const REPEAT_OPTIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 100];
  const RANGE_OPTIONS  = [1, 2, 3, 5, 7, 10];
  const DELAY_OPTIONS  = [
    { value: 0,    label: ui.noDelay || 'None' },
    { value: 500,  label: '0.5s' },
    { value: 1000, label: '1s' },
    { value: 2000, label: '2s' },
    { value: 3000, label: '3s' },
  ];

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  const showFloatBar = tab === 'hifz' && hifzMode === 'repeat' && isPlaying && !!selectedVerses[curIdx];

  return (
    <div
      className={`qlc${darkMode ? ' qlc--dark' : ''}${sepia && !darkMode ? ' qlc--sepia' : ''}${showFloatBar ? ' qlc--float' : ''}${chromeHidden ? ' qlc--chrome-hidden' : ''}`}
      style={{ '--reading-line-height': lineHeight, '--reading-max-width': CONTENT_WIDTHS[contentWidth] }}
    >

      <KbdSidePanel open={kbdPanelOpen} onToggle={() => setKbdPanelOpen((v) => !v)} />

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {showSettings && (
        <SettingsPanel
          fontSize={fontSize} setFontSize={setFontSize}
          darkMode={darkMode} setDarkMode={setDarkMode}
          showTrans={showTrans} setShowTrans={setShowTrans}
          readingTheme={readingTheme} setReadingTheme={setReadingTheme}
          lineHeight={lineHeight} setLineHeight={setLineHeight}
          contentWidth={contentWidth} setContentWidth={setContentWidth}
          onClose={() => setShowSettings(false)}
        />
      )}

      <QuranTopBar
        tab={tab} darkMode={darkMode} kbdPanelOpen={kbdPanelOpen} lang={lang} ui={ui}
        onTabChange={(key) => { setTab(key); stopHifz(); }}
        onLangChange={changeLang}
        onSettingsToggle={() => setShowSettings((v) => !v)}
        onKbdToggle={() => setKbdPanelOpen((v) => !v)}
        onDarkToggle={() => setDarkMode((v) => !v)}
        onQuickNavToggle={() => setQuickNavOpen((v) => !v)}
        onSidebarToggle={() => setSidebarOpen((v) => !v)}
      />

      {quickNavOpen && (
        <QuranQuickNav
          chapters={chapters}
          ui={ui}
          onClose={() => setQuickNavOpen(false)}
          onJumpVerse={jumpToVerse}
          onGoPage={goPage}
          onGoJuz={goJuz}
          onGoHizb={goHizb}
          onGoSurah={selectSurah}
        />
      )}

      <div className="qlc__layout">
        <QuranSidebar
          navMode={navMode} chapters={chapters} activeId={activeId} search={search}
          pageNum={pageNum} juzNum={juzNum} hizbNum={hizbNum} khatmDone={khatmDone} filtered={filtered} ui={ui}
          open={sidebarOpen} onClose={() => setSidebarOpen(false)}
          onNavModeChange={(key) => {
            if (key === 'page') goPage(pageNum);
            else if (key === 'juz') goJuz(juzNum);
            else if (key === 'hizb') goHizb(hizbNum);
            else setNavMode(key);
          }}
          onSurahSelect={selectSurah}
          onPageNav={goPage}
          onJuzNav={(n) => { goJuz(n); setSidebarOpen(false); }}
          onHizbNav={(n) => { goHizb(n); setSidebarOpen(false); }}
          onSearchChange={setSearch}
          onKhatmToggle={toggleKhatm}
          onKhatmFromSelect={selectFromKhatm}
          onNewKhatm={() => setKhatmDone([])}
        />

        <main className="qlc__main" dir="ltr">
          <QuranChapterHeader
            navMode={navMode} activeChapter={activeChapter}
            juzNum={juzNum} pageNum={pageNum} hizbNum={hizbNum} ui={ui}
          />

          {tab === 'reading' && (
            <ReadingModeSwitch mode={readingMode} onChange={setReadingMode} ui={ui} />
          )}

          {tab === 'reading' && (
            <QuranReadingControls
              reciterId={reciterId} lang={lang} tafsirId={tafsirId}
              fontSize={fontSize} navMode={navMode} audioUrl={audioUrl}
              audioRef={audioRef} audioKey={`${activeId}-${reciterId}`} ui={ui}
              onReciterChange={setReciterId}
              onLangChange={changeLang}
              onTafsirChange={(v) => { setTafsirId(v); setOpenTafsir({}); setTafsirPicker(null); }}
              onFontSizeChange={setFontSize}
            />
          )}

          {tab === 'reading' && !loading && !error && verses.length > 0 && (
            <QuranSyncPlayer
              verses={verses} reciterId={reciterId}
              reciterName={RECITERS.find((r) => r.id === reciterId)?.name}
              navMode={navMode} activeId={activeId} pageNum={pageNum} juzNum={juzNum} hizbNum={hizbNum}
              ui={ui}
            />
          )}

          {tab === 'hifz' && (
            <QuranHifzControls
              hifzMode={hifzMode} fromV={fromV} toV={toV} repeatCount={repeatCount}
              rangeRepeat={rangeRepeat} hifzDelay={hifzDelay} reciterId={reciterId}
              verses={verses} navMode={navMode} isPlaying={isPlaying} loadingVA={loadingVA}
              verseAudios={verseAudios} selectedVerses={selectedVerses} curIdx={curIdx}
              playCount={playCount} rangeIteration={rangeIteration} showTrans={showTrans} ui={ui}
              REPEAT_OPTIONS={REPEAT_OPTIONS} RANGE_OPTIONS={RANGE_OPTIONS} DELAY_OPTIONS={DELAY_OPTIONS}
              hifzAudio={hifzAudio} activeId={activeId}
              onHifzModeChange={(mode) => { setHifzMode(mode); stopHifz(); if (mode === 'test') setRevealed({}); }}
              onFromVChange={(v) => { stopHifz(); setFromV(v); }}
              onToVChange={(v) => { stopHifz(); setToV(v); }}
              onRepeatCountChange={setRepeatCount}
              onRangeRepeatChange={setRangeRepeat}
              onHifzDelayChange={setHifzDelay}
              onHifzReciterChange={(v) => { stopHifz(); setReciterId(HIFZ_RECITERS.find((r) => r.id === v) ? v : HIFZ_RECITERS[0].id); }}
              onShowTransChange={setShowTrans}
              startHifz={startHifz}
              stopHifz={stopHifz}
              handleHifzEnded={handleHifzEnded}
              onRevealAll={revealAll}
              onHideAll={hideAll}
              onVerseTimeUpdate={(e) => setHifzTime(e.target.currentTime)}
              onVerseDurationLoad={(e) => { const d = e.target.duration; setHifzDuration(isFinite(d) ? d : 0); }}
              onVerseEnded={() => { setHifzTime(0); setHifzDuration(0); }}
            />
          )}

          {tab === 'reading' && readingMode === 'continuous' && !loading && !error ? (
            <QuranMushafPage
              verses={verses} chapters={chapters} pageNum={pageNum} navMode={navMode}
              fontSize={fontSize} showTrans={showTrans} ui={ui}
              isBookmarked={isBookmarked} onToggleBookmark={toggleBookmark} getBookmark={getBookmark}
              onPrev={() => goRelative(-1)} onNext={() => goRelative(1)}
              canPrev={canGoPrev} canNext={canGoNext}
              chromeHidden={chromeHidden} onToggleChrome={() => setChromeHidden((v) => !v)}
              progressLabel={progressLabel}
            />
          ) : (
            <QuranVerseList
              displayVerses={displayVerses} tab={tab} hifzMode={hifzMode} isPlaying={isPlaying}
              curIdx={curIdx} navMode={navMode} chapters={chapters} translationId={translationId}
              fontSize={fontSize} showTrans={showTrans} revealed={revealed} openTafsir={openTafsir}
              tafsirId={tafsirId} tafsirPicker={tafsirPicker} copiedKey={copiedKey}
              fromV={fromV} repeatCount={repeatCount} playCount={playCount} showBasmalah={showBasmalah}
              loadingVA={loadingVA} ui={ui} loading={loading} error={error} jumpVerse={jumpVerse}
              onToggleReveal={toggleReveal}
              onToggleTafsir={toggleTafsir}
              onCopyVerse={copyVerse}
              onShareVerse={shareVerse}
              onShowCard={showCard}
              onSetTafsirPicker={setTafsirPicker}
              onSetTafsirId={(tid, verseKey) => { setTafsirId(tid); setOpenTafsir((p) => ({ ...p, [verseKey]: true })); }}
              onPlayVerseByIndex={(idx) => { setCurIdx(idx); setIsPlaying(true); setTimeout(() => playVerse(idx), 50); }}
              onJumpVerseChange={setJumpVerse}
              onJump={doJumpVerse}
              isBookmarked={isBookmarked}
              onToggleBookmark={toggleBookmark}
              getBookmark={getBookmark}
              onSaveNote={saveNote}
              onSetHighlight={setHighlight}
            />
          )}
        </main>
      </div>

      <QuranFloatingBar
        tab={tab} hifzMode={hifzMode} isPlaying={isPlaying} selectedVerses={selectedVerses}
        curIdx={curIdx} playCount={playCount} repeatCount={repeatCount}
        rangeIteration={rangeIteration} rangeRepeat={rangeRepeat} ui={ui} stopHifz={stopHifz}
        verseTime={hifzTime} verseDuration={hifzDuration}
      />

      <VerseCardModal
        verse={cardVerse}
        chapterName={activeChapter?.name_simple}
        onClose={closeCard}
      />
    </div>
  );
}
