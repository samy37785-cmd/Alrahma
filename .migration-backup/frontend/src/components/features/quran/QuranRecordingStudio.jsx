import { useState, useRef, useEffect } from 'react';
import { useQuranRecorder } from '../../../hooks/useQuranRecorder';
import { useQuranMemoStats, useLogPractice } from '../../../hooks/useQuranMemoStats';

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/*
 * QuranRecordingStudio — a third Hifz sub-mode ("record"). Reuses the
 * existing from/to verse-range picker already in QuranHifzControls rather
 * than duplicating range-selection UI. Recordings persist to IndexedDB
 * (see utils/recordingStore.js); "compare with reciter" is a literal
 * toggle-playback of the student's own recording vs. the reference
 * reciter's audio for the first verse of the range — self-comparison by
 * ear only, no automated scoring (per product decision).
 */
export default function QuranRecordingStudio({ activeId, fromV, toV, verses, audioMap, ui }) {
  const {
    isSupported, isRecording, elapsedMs, recordings, error,
    startRecording, stopRecording, getPlaybackUrl, removeRecording,
  } = useQuranRecorder(activeId);

  const { data: memoStats } = useQuranMemoStats();
  const logPractice = useLogPractice();

  const [comparing, setComparing] = useState(null); // recording id currently being compared, or null
  const [compareSource, setCompareSource] = useState('mine'); // 'mine' | 'reciter'
  const audioRef = useRef(null);

  const firstVerseKey = verses[fromV - 1]?.verse_key;
  const reciterUrl = firstVerseKey ? audioMap[firstVerseKey] : null;

  useEffect(() => {
    if (!comparing) return;
    const recording = recordings.find((r) => r.id === comparing);
    if (!recording || !audioRef.current) return;
    audioRef.current.src = compareSource === 'mine' ? getPlaybackUrl(recording) : reciterUrl;
    audioRef.current.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparing, compareSource]);

  const handleStop = async () => {
    stopRecording();
    // logPractice fires once the recorder's onstop handler has persisted the
    // blob — give it a beat before counting it toward today's stats.
    setTimeout(() => {
      logPractice.mutate({ practiceSeconds: Math.round(elapsedMs / 1000), recordingsCount: 1 });
    }, 300);
  };

  if (!isSupported) {
    return (
      <div className="qlc__studio qlc__studio--unsupported">
        ⚠ {ui.recordingUnsupported || 'Voice recording is not supported in this browser. Try Chrome, Firefox, or Edge.'}
      </div>
    );
  }

  return (
    <div className="qlc__studio">
      <div className="qlc__studio-record-row">
        {!isRecording ? (
          <button className="btn btn--green" onClick={() => startRecording(fromV, toV)}>
            ⏺ {ui.startRecording || 'Start recording'} ({fromV}–{toV})
          </button>
        ) : (
          <button className="btn btn--ghost" onClick={handleStop}>
            ⏹ {ui.stopRecording || 'Stop'} · {fmt(elapsedMs)}
          </button>
        )}
        {memoStats && (
          <span className="qlc__studio-stats">
            {ui.streak || 'Streak'}: {memoStats.streak?.current || 0} ·
            {' '}{memoStats.stats?.totalRecordings || 0} {ui.recordings || 'recordings'}
          </span>
        )}
      </div>

      {error && <p className="qlc__studio-error">⚠ {error}</p>}

      <ul className="qlc__studio-list">
        {recordings.length === 0 && (
          <li className="qlc__studio-empty">{ui.noRecordingsYet || 'No recordings yet for this surah.'}</li>
        )}
        {recordings.map((r) => (
          <li key={r.id} className="qlc__studio-item">
            <span className="qlc__studio-item-label">
              {r.fromV}–{r.toV} · {fmt(r.durationMs)}
            </span>
            <div className="qlc__studio-item-actions">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => { setComparing(r.id); setCompareSource('mine'); }}
              >
                ▶ {ui.myRecording || 'My recording'}
              </button>
              {reciterUrl && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => { setComparing(r.id); setCompareSource('reciter'); }}
                >
                  ▶ {ui.reciter}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" onClick={() => removeRecording(r.id)}>
                🗑 {ui.delete || 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <audio ref={audioRef} onEnded={() => setComparing(null)} style={{ display: 'none' }} />
    </div>
  );
}
