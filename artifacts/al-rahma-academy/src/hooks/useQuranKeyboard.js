import { useEffect } from 'react';

export function useQuranKeyboard({
  tab, isPlaying, navMode,
  startHifz, stopHifz, audioRef, toggleDark,
  setShowShortcuts, setShowSettings, setKbdPanelOpen,
  setActiveId, setFontSize, setShowTrans, goRelative,
  onQuickNavToggle,
}) {
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      switch (e.key) {
        case '/': e.preventDefault(); onQuickNavToggle?.((v) => !v); break;
        case '?': setShowShortcuts((v) => !v); break;
        case 'g': case 'G': setShowSettings((v) => !v); break;
        case 'k': case 'K': setKbdPanelOpen((v) => !v); break;
        case 'p': case 'P': window.print(); break;
        case 'Escape':
          setShowShortcuts(false); setShowSettings(false); setKbdPanelOpen(false); stopHifz();
          onQuickNavToggle?.(false);
          break;
        case ' ':
          e.preventDefault();
          if (tab === 'hifz') { isPlaying ? stopHifz() : startHifz(); }
          else if (audioRef.current) {
            audioRef.current.paused ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
          }
          break;
        case 'ArrowRight': goRelative(-1); break;
        case 'ArrowLeft':  goRelative(1);  break;
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
  }, [tab, isPlaying, navMode, startHifz, stopHifz, toggleDark, onQuickNavToggle, goRelative]); // eslint-disable-line react-hooks/exhaustive-deps
}
