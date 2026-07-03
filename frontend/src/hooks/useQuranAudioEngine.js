import { useRef, useState, useCallback, useEffect } from 'react';

// Unified verse-queue audio engine — a generalised version of the
// repeat-per-verse / repeat-whole-range algorithm already proven by
// useQuranHifz, but self-contained and reusable outside the Hifz tab:
// Reading-tab verse-synced playback, "repeat page" and "repeat selection"
// are all just this same engine loaded with a different verse range.
//
// Deliberately independent from useQuranHifz (which stays untouched) —
// see the Quran module plan for the rationale: consolidating Hifz's
// already-proven timeout-chain logic into this new engine was flagged as
// the highest-regression-risk item, so instead this engine is additive.

const POSITION_KEY = 'qlc-last-position';

export function readSavedPosition() {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSavedPosition(pos) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    // Storage unavailable/full — resume-on-reopen is best-effort only.
  }
}

const POSITION_SAVE_INTERVAL_MS = 15000;

export function useQuranAudioEngine({ onPositionChange } = {}) {
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== 'undefined') audioRef.current = new Audio();

  const queueRef            = useRef([]);
  const settingsRef         = useRef({ mode: 'reading', repeatCount: 1, rangeRepeat: 1, delayMs: 0, meta: {} });
  const currentIndexRef     = useRef(-1);
  const playCountRef        = useRef(0);
  const rangeIterationRef   = useRef(0);
  const stopAfterCurrentRef = useRef(false);
  const sleepIntervalRef    = useRef(null);
  const lastPositionSaveRef = useRef(0);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  const [isPlaying, setIsPlaying]           = useState(false);
  const [speed, setSpeedState]              = useState(1);
  const [sleepMinutes, setSleepMinutesState] = useState(null);
  const [sleepEndOfItem, setSleepEndOfItem]  = useState(false);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);

  const cancelSleepTimer = useCallback(() => {
    if (sleepIntervalRef.current) { clearInterval(sleepIntervalRef.current); sleepIntervalRef.current = null; }
    stopAfterCurrentRef.current = false;
    setSleepMinutesState(null);
    setSleepEndOfItem(false);
    setSleepRemainingMs(0);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const savePosition = useCallback(() => {
    const item = queueRef.current[currentIndexRef.current];
    if (!item) return;
    const pos = {
      ...settingsRef.current.meta,
      verseKey: item.verseKey,
      verseTimestamp: audioRef.current?.currentTime || 0,
      updatedAt: new Date().toISOString(),
    };
    writeSavedPosition(pos);
    onPositionChangeRef.current?.(pos);
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
    currentIndexRef.current   = -1;
    playCountRef.current      = 0;
    rangeIterationRef.current = 0;
    rerender();
  }, [rerender]);

  const playIndex = useCallback((idx) => {
    const item  = queueRef.current[idx];
    const audio = audioRef.current;
    if (!item || !audio) return;
    currentIndexRef.current = idx;
    playCountRef.current    = 1;
    audio.src = item.url;
    audio.playbackRate = speed;
    audio.play().catch(() => {});
    setIsPlaying(true);
    rerender();
    savePosition();

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title:  `Verse ${item.verseKey}`,
          artist: settingsRef.current.meta?.reciterName || 'Al-Rahma Academy',
          album:  'Al-Rahma Academy — Quran',
        });
      } catch {
        // MediaMetadata unsupported in this browser — non-fatal.
      }
    }
  }, [speed, rerender, savePosition]);

  const advance = useCallback(() => {
    const { repeatCount, rangeRepeat, delayMs } = settingsRef.current;

    if (stopAfterCurrentRef.current) {
      stop();
      cancelSleepTimer();
      return;
    }

    playCountRef.current += 1;
    if (playCountRef.current <= repeatCount) {
      setTimeout(() => audioRef.current?.play().catch(() => {}), delayMs);
      rerender();
      return;
    }

    const nextIdx = currentIndexRef.current + 1;
    playCountRef.current = 0;
    if (nextIdx < queueRef.current.length) {
      setTimeout(() => playIndex(nextIdx), 400 + delayMs);
    } else {
      rangeIterationRef.current += 1;
      if (rangeIterationRef.current < rangeRepeat) {
        setTimeout(() => playIndex(0), 800 + delayMs);
      } else {
        rangeIterationRef.current = 0;
        stop();
      }
    }
    rerender();
  }, [playIndex, rerender, stop, cancelSleepTimer]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => advance();
    const onTimeUpdate = () => {
      const now = Date.now();
      if (now - lastPositionSaveRef.current > POSITION_SAVE_INTERVAL_MS) {
        lastPositionSaveRef.current = now;
        savePosition();
      }
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [advance, savePosition]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIndexRef.current < 0 && queueRef.current.length) { playIndex(0); return; }
    audio.play().catch(() => {});
    setIsPlaying(true);
  }, [playIndex]);

  const next = useCallback(() => {
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx < queueRef.current.length) { playCountRef.current = 0; playIndex(nextIdx); }
  }, [playIndex]);

  const prev = useCallback(() => {
    const prevIdx = currentIndexRef.current - 1;
    if (prevIdx >= 0) { playCountRef.current = 0; playIndex(prevIdx); }
  }, [playIndex]);

  const seek = useCallback((seconds) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
  }, []);

  // Media Session action handlers — re-registered whenever the callbacks
  // they close over change, so the lock-screen/tab controls always call
  // the current queue's play/pause/next/prev, not a stale first render.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
    } catch {
      // Some actions are unsupported in some browsers — non-fatal.
    }
    return () => {
      try {
        ['play', 'pause', 'previoustrack', 'nexttrack'].forEach((a) => navigator.mediaSession.setActionHandler(a, null));
      } catch { /* no-op */ }
    };
  }, [play, pause, prev, next]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'; } catch { /* no-op */ }
  }, [isPlaying]);

  // Load a new verse queue — resets playback state. `verses` are the raw
  // quran.com verse objects, `audioMap` is { verseKey: url }.
  const loadQueue = useCallback((verses, audioMap, opts = {}) => {
    stop();
    queueRef.current = (verses || [])
      .map((v) => ({ verseKey: v.verse_key, url: audioMap?.[v.verse_key], text: v.text_uthmani }))
      .filter((it) => !!it.url);
    settingsRef.current = {
      mode:        opts.mode || 'reading',
      repeatCount: opts.repeatCount || 1,
      rangeRepeat: opts.rangeRepeat || 1,
      delayMs:     opts.delayMs || 0,
      meta:        opts.meta || {},
    };
    rerender();
    if (opts.autoplay && queueRef.current.length) playIndex(opts.startIndex || 0);
  }, [stop, playIndex, rerender]);

  const setSpeed = useCallback((rate) => {
    setSpeedState(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  // variant: 'timer' (pause after N minutes) or 'end-of-item' (finish the
  // current verse/repeat cycle, then pause instead of advancing).
  const setSleepTimer = useCallback((minutes, variant = 'timer') => {
    cancelSleepTimer();
    if (!minutes && variant !== 'end-of-item') return;
    if (variant === 'end-of-item') {
      stopAfterCurrentRef.current = true;
      setSleepEndOfItem(true);
      return;
    }
    setSleepMinutesState(minutes);
    const endAt = Date.now() + minutes * 60000;
    setSleepRemainingMs(minutes * 60000);
    sleepIntervalRef.current = setInterval(() => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        pause();
        cancelSleepTimer();
      } else {
        setSleepRemainingMs(remaining);
      }
    }, 1000);
  }, [cancelSleepTimer, pause]);

  useEffect(() => () => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    audioRef.current?.pause();
    savePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    loadQueue,
    play, pause, stop, next, prev, seek,
    speed, setSpeed,
    setSleepTimer, cancelSleepTimer, sleepMinutes, sleepEndOfItem, sleepRemainingMs,
    isPlaying,
    currentIndex:   currentIndexRef.current,
    playCount:      playCountRef.current,
    rangeIteration: rangeIterationRef.current,
    queue:          queueRef.current,
    mode:           settingsRef.current.mode,
    repeatCount:    settingsRef.current.repeatCount,
    rangeRepeat:    settingsRef.current.rangeRepeat,
  };
}
