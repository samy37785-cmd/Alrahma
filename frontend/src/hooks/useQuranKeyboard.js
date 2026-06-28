import { useEffect } from 'react';

export function useQuranKeyboard({
  tab, isPlaying, navMode, activeId, pageNum, juzNum,
  startHifz, stopHifz, audioRef, toggleDark,
  setShowShortcuts, setShowSettings, setKbdPanelOpen,
  setActiveId, setJuzNum, setFontSize, setShowTrans, goPage,
}) {
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
        case 'd': case 'D': toggleDark(); break;
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
  }, [tab, isPlaying, navMode, activeId, pageNum, juzNum, startHifz, stopHifz, toggleDark]); // eslint-disable-line react-hooks/exhaustive-deps
}
