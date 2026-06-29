const fmt = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

export default function QuranFloatingBar({
  tab, hifzMode, isPlaying, selectedVerses, curIdx,
  playCount, repeatCount, rangeIteration, rangeRepeat, ui, stopHifz,
  verseTime, verseDuration,
}) {
  if (tab !== 'hifz' || hifzMode !== 'repeat' || !isPlaying || !selectedVerses[curIdx]) return null;

  const verse       = selectedVerses[curIdx];
  const versePct    = verseDuration > 0 ? (verseTime   / verseDuration)   * 100 : 0;
  const rangePct    = selectedVerses.length > 1
    ? (curIdx / (selectedVerses.length - 1)) * 100
    : 100;

  return (
    <div className="qlc__float-bar" role="status" aria-live="polite" aria-atomic="true">

      {/* Verse info */}
      <div className="qlc__float-info">
        <span className="qlc__float-key">{verse.verse_key}</span>
        <span className="qlc__float-ar" dir="rtl">
          {verse.text_uthmani.slice(0, 80)}
          {verse.text_uthmani.length > 80 ? '…' : ''}
        </span>
      </div>

      {/* Centre: verse audio progress + time */}
      <div className="qlc__float-centre">
        <div className="qlc__float-verse-seek">
          <div
            className="qlc__float-verse-fill"
            style={{ width: `${versePct}%` }}
          />
        </div>
        {verseDuration > 0 && (
          <span className="qlc__float-time">
            {fmt(verseTime)} / {fmt(verseDuration)}
          </span>
        )}
      </div>

      {/* Right: repeat counter + range + stop */}
      <div className="qlc__float-right">
        <span className="qlc__float-count">{playCount}/{repeatCount}×</span>
        {rangeRepeat > 1 && (
          <span className="qlc__float-range">{rangeIteration + 1}/{rangeRepeat}</span>
        )}
        <button className="qlc__float-stop" onClick={stopHifz} aria-label="Stop memorization">
          {ui.stop}
        </button>
      </div>

      {/* Bottom: range-level progress (which verse in the selection) */}
      <div className="qlc__float-progress" aria-hidden="true">
        <div className="qlc__float-fill" style={{ width: `${rangePct}%` }} />
      </div>
    </div>
  );
}
