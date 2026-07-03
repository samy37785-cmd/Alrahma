import { useState, useEffect, useRef, useCallback } from 'react';
import { getVerseAudioMapForVerses } from '../../../api/quran';
import { useQuranAudioEngine, readSavedPosition } from '../../../hooks/useQuranAudioEngine';
import { useReadingProgress, useUpdatePosition, useLogReading } from '../../../hooks/useQuranProgress';
import { useAuth } from '../../../context/AuthContext';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const REPEAT_PAGE_OPTIONS = [1, 2, 3, 5, 10];
const SLEEP_OPTIONS = [5, 10, 15, 30, 60];
const BACKEND_SYNC_INTERVAL_MS = 15000;

const fmtRemaining = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/*
 * QuranSyncPlayer — verse-synced playback bar for the Reading tab.
 *
 * Plays a queue of per-verse audio (same source Hifz already uses) so the
 * current verse can be highlighted + auto-scrolled into view, and supports
 * "repeat page/surah/juz/hizb" (via rangeRepeat) and "repeat a verse
 * selection" (by loading just that sub-range), a sleep timer, Media
 * Session integration, and cross-device resume — independent of the
 * existing Hifz repeat engine (useQuranHifz), which is untouched.
 */
export default function QuranSyncPlayer({
  verses, reciterId, reciterName, navMode, activeId, pageNum, juzNum, hizbNum, ui,
}) {
  const { user } = useAuth();
  const [audioMap, setAudioMap]     = useState({});
  const [loadingMap, setLoadingMap] = useState(false);
  const [selFrom, setSelFrom]       = useState(1);
  const [selTo, setSelTo]           = useState(verses.length || 1);
  const [rangeRepeat, setRangeRepeat] = useState(1);
  const [sleepOpen, setSleepOpen]   = useState(false);
  const highlightedElRef = useRef(null);

  const { data: progress } = useReadingProgress();
  const updatePositionMutation = useUpdatePosition();
  const logReadingMutation = useLogReading();
  const lastBackendSyncRef = useRef(0);
  const versesReadSinceLogRef = useRef(0);

  const positionMeta = { navMode, chapterId: activeId, pageNum, juzNum, hizbNum, reciterName };

  const handlePositionChange = useCallback((pos) => {
    versesReadSinceLogRef.current += 1;
    if (!user) return;
    const now = Date.now();
    if (now - lastBackendSyncRef.current < BACKEND_SYNC_INTERVAL_MS) return;
    lastBackendSyncRef.current = now;
    updatePositionMutation.mutate({
      navMode: pos.navMode, chapterId: pos.chapterId, pageNum: pos.pageNum,
      juzNum: pos.juzNum, hizbNum: pos.hizbNum,
      verseKey: pos.verseKey, verseTimestamp: pos.verseTimestamp,
    });
    if (versesReadSinceLogRef.current > 0) {
      logReadingMutation.mutate({ versesRead: versesReadSinceLogRef.current, minutesRead: 0 });
      versesReadSinceLogRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const engine = useQuranAudioEngine({ onPositionChange: handlePositionChange });

  useEffect(() => {
    setSelFrom(1);
    setSelTo(verses.length || 1);
  }, [verses]);

  /* ── Fetch per-verse audio for the currently displayed range ──────── */
  useEffect(() => {
    let alive = true;
    if (!verses.length) { setAudioMap({}); return; }
    setLoadingMap(true);
    getVerseAudioMapForVerses(verses, reciterId)
      .then((m) => { if (alive) setAudioMap(m); })
      .catch(() => { if (alive) setAudioMap({}); })
      .finally(() => { if (alive) setLoadingMap(false); });
    return () => { alive = false; };
  }, [verses, reciterId]);

  const hasAudio = Object.keys(audioMap).length > 0;

  const startPlayback = useCallback((fromIdx = 0, toIdx = verses.length) => {
    const slice = verses.slice(fromIdx, toIdx);
    engine.loadQueue(slice, audioMap, {
      mode: 'reading', repeatCount: 1, rangeRepeat, delayMs: 0,
      meta: positionMeta, autoplay: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses, audioMap, rangeRepeat, engine]);

  const playAll = () => startPlayback(0, verses.length);
  const playSelection = () => startPlayback(selFrom - 1, selTo);

  /* ── Resume-where-you-left-off chip ───────────────────────────────── */
  const saved = progress?.lastPosition?.verseKey ? progress.lastPosition : readSavedPosition();
  const resumeMatchesView = saved?.verseKey && verses.some((v) => v.verse_key === saved.verseKey);
  const resumeHere = () => {
    if (!resumeMatchesView) return;
    const idx = verses.findIndex((v) => v.verse_key === saved.verseKey);
    if (idx < 0) return;
    startPlayback(idx, verses.length);
  };

  /* ── Highlight + auto-scroll the currently playing verse ──────────── */
  useEffect(() => {
    if (highlightedElRef.current) highlightedElRef.current.classList.remove('qlc__verse--active');
    const item = engine.queue[engine.currentIndex];
    if (!item) { highlightedElRef.current = null; return; }
    const el = document.getElementById(`v-${item.verseKey}`);
    if (el) {
      el.classList.add('qlc__verse--active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightedElRef.current = el;
    }
  }, [engine.currentIndex, engine.queue]);

  useEffect(() => () => highlightedElRef.current?.classList.remove('qlc__verse--active'), []);

  if (!verses.length) return null;

  return (
    <div className="qlc__syncplayer">
      <div className="qlc__syncplayer-row">
        <button
          className="btn btn--green btn--sm"
          onClick={engine.isPlaying ? engine.pause : (engine.queue.length ? engine.play : playAll)}
          disabled={loadingMap || !hasAudio}
        >
          {engine.isPlaying ? `⏸ ${ui.stop || 'Pause'}` : `▶ ${ui.syncPlay || 'Play synced (highlight + auto-scroll)'}`}
        </button>
        {engine.queue.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={engine.stop}>
            ⏹ {ui.stop}
          </button>
        )}

        <label className="qlc__syncplayer-field">
          {ui.repeatPage || 'Repeat this view'}
          <select value={rangeRepeat} onChange={(e) => setRangeRepeat(Number(e.target.value))}>
            {REPEAT_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        </label>

        <div className="qlc__syncplayer-speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`qplayer__speed${engine.speed === s ? ' active' : ''}`}
              onClick={() => engine.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="qlc__syncplayer-sleep">
          <button className="btn btn--ghost btn--sm" onClick={() => setSleepOpen((v) => !v)}>
            🌙 {ui.sleepTimer || 'Sleep timer'}
            {engine.sleepMinutes ? ` (${fmtRemaining(engine.sleepRemainingMs)})` : ''}
            {engine.sleepEndOfItem ? ` (${ui.endOfItem || 'end of item'})` : ''}
          </button>
          {sleepOpen && (
            <div className="qlc__syncplayer-sleep-menu">
              {SLEEP_OPTIONS.map((m) => (
                <button key={m} onClick={() => { engine.setSleepTimer(m, 'timer'); setSleepOpen(false); }}>
                  {m} {ui.minutes || 'min'}
                </button>
              ))}
              <button onClick={() => { engine.setSleepTimer(1, 'end-of-item'); setSleepOpen(false); }}>
                {ui.endOfItem || 'End of current verse'}
              </button>
              {(engine.sleepMinutes || engine.sleepEndOfItem) && (
                <button onClick={() => { engine.cancelSleepTimer(); setSleepOpen(false); }}>
                  {ui.cancel || 'Cancel'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="qlc__syncplayer-row">
        <label className="qlc__syncplayer-field">
          {ui.repeatSelection || 'Repeat selection'}
          <select value={selFrom} onChange={(e) => setSelFrom(Number(e.target.value))}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
          {ui.toVerse}
          <select value={selTo} onChange={(e) => setSelTo(Number(e.target.value))}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <button className="btn btn--ghost btn--sm" onClick={playSelection} disabled={loadingMap || !hasAudio}>
          🔁 {ui.start}
        </button>

        {resumeMatchesView && !engine.isPlaying && (
          <button className="btn btn--ghost btn--sm qlc__syncplayer-resume" onClick={resumeHere}>
            ⏵ {ui.continueReading || 'Continue reading'} · {saved.verseKey}
          </button>
        )}
      </div>

      {engine.queue.length > 0 && (
        <div className="qlc__syncplayer-status">
          {engine.queue[engine.currentIndex]?.verseKey}
          {engine.rangeRepeat > 1 && ` · ${engine.rangeIteration + 1}/${engine.rangeRepeat}`}
        </div>
      )}
    </div>
  );
}
