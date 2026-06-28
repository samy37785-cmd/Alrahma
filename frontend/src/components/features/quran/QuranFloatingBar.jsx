export default function QuranFloatingBar({
  tab, hifzMode, isPlaying, selectedVerses, curIdx,
  playCount, repeatCount, rangeIteration, rangeRepeat, ui, stopHifz,
}) {
  if (tab !== 'hifz' || hifzMode !== 'repeat' || !isPlaying || !selectedVerses[curIdx]) return null;

  return (
    <div className="qlc__float-bar">
      <div className="qlc__float-info">
        <span className="qlc__float-key">{selectedVerses[curIdx].verse_key}</span>
        <span className="qlc__float-ar" dir="rtl">
          {selectedVerses[curIdx].text_uthmani.slice(0, 80)}
          {selectedVerses[curIdx].text_uthmani.length > 80 ? '…' : ''}
        </span>
      </div>
      <div className="qlc__float-right">
        <span className="qlc__float-count">{playCount}/{repeatCount}×</span>
        {rangeRepeat > 1 && (
          <span className="qlc__float-range">{rangeIteration + 1}/{rangeRepeat}</span>
        )}
        <button className="qlc__float-stop" onClick={stopHifz}>{ui.stop}</button>
      </div>
      <div className="qlc__float-progress">
        <div className="qlc__float-fill"
          style={{ width: `${(curIdx / selectedVerses.length) * 100}%` }} />
      </div>
    </div>
  );
}
