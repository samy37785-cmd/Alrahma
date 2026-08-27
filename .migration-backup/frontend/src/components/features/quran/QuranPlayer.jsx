import { useState, useEffect, useRef, useCallback } from 'react';

const fmt = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </svg>
);
const FwdIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
    <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z" />
  </svg>
);
const NoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

/*
 * QuranPlayer — premium custom audio player for chapter recitations.
 *
 * Receives the audioRef from the parent so the keyboard-shortcut hook
 * (useQuranKeyboard) can still call audioRef.current.play() / .pause().
 * The hidden <audio> element is rendered here and attached to that ref.
 */
export default function QuranPlayer({ src, audioKey, audioRef, reciterName }) {
  const [playing, setPlaying]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration]   = useState(0);
  const [buffered, setBuffered]   = useState(0);
  const [speed, setSpeed]         = useState(1);
  const seekRef  = useRef(null);
  const dragging = useRef(false);

  /* ── Attach / re-attach listeners whenever the audio element remounts ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay  = () => { setPlaying(true);  setLoading(false); };
    const onPause = () =>   setPlaying(false);
    const onWait  = () =>   setLoading(true);
    const onCanP  = () =>   setLoading(false);
    const onEnd   = () => { setPlaying(false); setCurrent(0); };
    const onTU    = () => {
      if (!dragging.current) setCurrent(audio.currentTime);
      if (audio.buffered.length)
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
    };
    const onDC = () => { if (isFinite(audio.duration)) setDuration(audio.duration); };

    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('waiting',        onWait);
    audio.addEventListener('canplay',        onCanP);
    audio.addEventListener('ended',          onEnd);
    audio.addEventListener('timeupdate',     onTU);
    audio.addEventListener('durationchange', onDC);
    audio.addEventListener('loadedmetadata', onDC);

    return () => {
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('waiting',        onWait);
      audio.removeEventListener('canplay',        onCanP);
      audio.removeEventListener('ended',          onEnd);
      audio.removeEventListener('timeupdate',     onTU);
      audio.removeEventListener('durationchange', onDC);
      audio.removeEventListener('loadedmetadata', onDC);
    };
  }, [audioKey, audioRef]); // re-run when audio element remounts (key changed)

  /* ── Reset display state on track change ── */
  useEffect(() => {
    setPlaying(false); setCurrent(0); setDuration(0); setBuffered(0); setLoading(false);
  }, [audioKey]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      setLoading(true);
      audio.play().catch(() => setLoading(false));
    }
  }, [playing, audioRef]);

  const skip = useCallback((delta) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
  }, [audioRef, duration]);

  const changeSpeed = useCallback((s) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }, [audioRef]);

  const getSeekPct = useCallback((clientX) => {
    const rect = seekRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, [duration]);

  const doSeek = useCallback((clientX) => {
    const pct = getSeekPct(clientX);
    const t   = pct * duration;
    setCurrent(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  }, [getSeekPct, duration, audioRef]);

  /* ── Global drag-to-seek handlers ── */
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setCurrent(getSeekPct(e.clientX) * duration);
    };
    const onUp = (e) => {
      if (!dragging.current) return;
      dragging.current = false;
      doSeek(e.clientX);
    };
    const onTM = (e) => {
      if (!dragging.current) return;
      setCurrent(getSeekPct(e.touches[0].clientX) * duration);
    };
    const onTE = (e) => {
      if (!dragging.current) return;
      dragging.current = false;
      doSeek(e.changedTouches[0].clientX);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onTM,  { passive: true });
    document.addEventListener('touchend',  onTE);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onTM);
      document.removeEventListener('touchend',  onTE);
    };
  }, [duration, doSeek, getSeekPct]);

  const pct    = duration ? (currentTime / duration) * 100 : 0;
  const bufPct = duration ? (buffered   / duration) * 100 : 0;

  return (
    <div className="qplayer" role="region" aria-label="Chapter recitation player">
      {/* Hidden audio element — ref shared with parent keyboard hook */}
      <audio
        ref={audioRef}
        src={src}
        key={audioKey}
        preload="metadata"
        style={{ display: 'none' }}
      />

      {/* Row 1: Reciter name + time counter */}
      <div className="qplayer__top">
        <div className="qplayer__meta">
          <NoteIcon />
          <span className="qplayer__reciter">{reciterName}</span>
        </div>
        <span className="qplayer__time" aria-live="off">
          {fmt(currentTime)}
          <span className="qplayer__time-sep"> / </span>
          {duration ? fmt(duration) : '—:——'}
        </span>
      </div>

      {/* Row 2: Seek bar */}
      <div
        ref={seekRef}
        className="qplayer__seek"
        onClick={(e) => { if (!dragging.current) doSeek(e.clientX); }}
        onMouseDown={() => { dragging.current = true; }}
        onTouchStart={() => { dragging.current = true; }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-label="Audio position"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft')  { e.preventDefault(); skip(-5); }
          if (e.key === 'ArrowRight') { e.preventDefault(); skip(5); }
        }}
      >
        <div className="qplayer__seek-buf"   style={{ width: `${bufPct}%` }} />
        <div className="qplayer__seek-fill"  style={{ width: `${pct}%` }} />
        <div className="qplayer__seek-thumb" style={{ left: `${Math.min(pct, 99.5)}%` }} />
      </div>

      {/* Row 3: Controls + speed selector */}
      <div className="qplayer__bottom">
        <div className="qplayer__ctrls">
          <button
            className="qplayer__skip-btn"
            onClick={() => skip(-10)}
            title="Rewind 10 seconds"
            aria-label="Rewind 10 seconds"
          >
            <BackIcon />
            <span>10</span>
          </button>

          <button
            className="qplayer__play-btn"
            onClick={toggle}
            aria-label={loading ? 'Loading…' : playing ? 'Pause' : 'Play'}
          >
            {loading
              ? <span className="qplayer__spin" role="status" aria-label="Loading audio" />
              : playing ? <PauseIcon /> : <PlayIcon />
            }
          </button>

          <button
            className="qplayer__skip-btn"
            onClick={() => skip(10)}
            title="Forward 10 seconds"
            aria-label="Forward 10 seconds"
          >
            <span>10</span>
            <FwdIcon />
          </button>
        </div>

        <div className="qplayer__speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`qplayer__speed${speed === s ? ' active' : ''}`}
              onClick={() => changeSpeed(s)}
              aria-label={`${s}× speed`}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
