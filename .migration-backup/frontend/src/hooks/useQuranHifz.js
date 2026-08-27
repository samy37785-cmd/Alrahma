import { useCallback } from 'react';

export function useQuranHifz({
  hifzAudio, rangeCountRef,
  selectedVerses, audioMap,
  repeatCount, hifzDelay, rangeRepeat,
  curIdx,
  setCurIdx, setIsPlaying, setPlayCount, setRangeIteration,
}) {
  const playVerse = useCallback((idx) => {
    const v = selectedVerses[idx];
    if (!v || !hifzAudio.current) return;
    const url = audioMap[v.verse_key];
    if (!url) return;
    hifzAudio.current.src = url;
    hifzAudio.current.play().catch(() => {});
    setCurIdx(idx); setPlayCount(1);
  }, [selectedVerses, audioMap, hifzAudio, setCurIdx, setPlayCount]);

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
  }, [repeatCount, curIdx, selectedVerses.length, playVerse, hifzDelay, rangeRepeat, hifzAudio, rangeCountRef, setPlayCount, setRangeIteration, setIsPlaying]);

  const startHifz = useCallback(() => {
    rangeCountRef.current = 0; setRangeIteration(0);
    setIsPlaying(true); setCurIdx(0); setPlayCount(0);
    setTimeout(() => playVerse(0), 100);
  }, [playVerse, rangeCountRef, setRangeIteration, setIsPlaying, setCurIdx, setPlayCount]);

  const stopHifz = useCallback(() => {
    setIsPlaying(false);
    hifzAudio.current?.pause();
    if (hifzAudio.current) hifzAudio.current.currentTime = 0;
    setCurIdx(0); setPlayCount(0); rangeCountRef.current = 0; setRangeIteration(0);
  }, [hifzAudio, rangeCountRef, setIsPlaying, setCurIdx, setPlayCount, setRangeIteration]);

  return { playVerse, startHifz, stopHifz, handleHifzEnded };
}
