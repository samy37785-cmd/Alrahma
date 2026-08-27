import { useState, useRef, useEffect, useCallback } from 'react';

const RECITATION_URL =
  'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3';

export default function QuranAudioPlayer() {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const audioRef = useRef(null);

  const initAudio = useCallback(() => {
    if (audioRef.current) return;
    const audio = new Audio(RECITATION_URL);
    audio.loop = true;
    audio.volume = 0.18;
    audio.preload = 'none';
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('waiting', () => setLoading(true));
    audioRef.current = audio;
  }, []);

  const toggle = useCallback(() => {
    initAudio();
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      audio.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [playing, initAudio]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  if (dismissed) return null;

  return (
    <div className="qap" role="region" aria-label="Quran recitation audio">
      <button
        type="button"
        className={`qap__btn${playing ? ' qap__btn--active' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Mute Quran recitation' : 'Play Quran recitation softly'}
        title={playing ? 'Mute recitation' : 'Play Quran softly'}
      >
        {loading ? (
          <span className="qap__spin" aria-hidden="true" />
        ) : playing ? (
          <span className="qap__wave" aria-hidden="true">
            <span /><span /><span /><span />
          </span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
        )}
        <span className="qap__label">{playing ? 'Quran playing' : 'Play Quran'}</span>
      </button>
      <button
        type="button"
        className="qap__close"
        onClick={() => { if (audioRef.current) audioRef.current.pause(); setDismissed(true); }}
        aria-label="Dismiss audio player"
      >×</button>
    </div>
  );
}
