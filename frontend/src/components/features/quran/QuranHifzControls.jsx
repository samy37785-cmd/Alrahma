import { CtrlItem } from './QuranControls';
import { RECITERS } from '../../../api/quran';

const HIFZ_RECITERS = RECITERS.filter((r) => r.verseId != null);

export default function QuranHifzControls({
  hifzMode, fromV, toV, repeatCount, rangeRepeat, hifzDelay, reciterId,
  verses, navMode, isPlaying, loadingVA, verseAudios, selectedVerses, curIdx,
  playCount, rangeIteration, showTrans, ui,
  REPEAT_OPTIONS, RANGE_OPTIONS, DELAY_OPTIONS,
  hifzAudio,
  onHifzModeChange, onFromVChange, onToVChange, onRepeatCountChange,
  onRangeRepeatChange, onHifzDelayChange, onHifzReciterChange, onShowTransChange,
  startHifz, stopHifz, handleHifzEnded, onRevealAll, onHideAll,
}) {
  return (
    <div className="qlc__cbar qlc__cbar--hifz">
      <div className="qlc__hifz-modetabs">
        <button className={`qlc__hifz-modetab${hifzMode === 'repeat' ? ' active' : ''}`}
          onClick={() => onHifzModeChange('repeat')}>🔁 {ui.repeat}</button>
        <button className={`qlc__hifz-modetab${hifzMode === 'test' ? ' active' : ''}`}
          onClick={() => onHifzModeChange('test')}>🧪 {ui.test}</button>
      </div>

      <div className="qlc__cbar-selects qlc__cbar-selects--hifz">
        <CtrlItem icon="▶" label={ui.fromVerse}>
          <select className="qlc__cbar-select" value={fromV}
            onChange={(e) => onFromVChange(Number(e.target.value))}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </CtrlItem>
        <div className="qlc__cbar-sep" />
        <CtrlItem icon="⏹" label={ui.toVerse}>
          <select className="qlc__cbar-select" value={toV}
            onChange={(e) => onToVChange(Number(e.target.value))}>
            {verses.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </CtrlItem>

        {hifzMode === 'repeat' && (
          <>
            <div className="qlc__cbar-sep" />
            <CtrlItem icon="🔁" label={ui.repeatEach}>
              <select className="qlc__cbar-select" value={repeatCount}
                onChange={(e) => onRepeatCountChange(Number(e.target.value))}>
                {REPEAT_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
              </select>
            </CtrlItem>
            <div className="qlc__cbar-sep" />
            <CtrlItem icon="🔄" label={ui.rangeRepeat || 'Range'}>
              <select className="qlc__cbar-select" value={rangeRepeat}
                onChange={(e) => onRangeRepeatChange(Number(e.target.value))}>
                {RANGE_OPTIONS.map((n) => <option key={n} value={n}>{n}{ui.times}</option>)}
              </select>
            </CtrlItem>
            <div className="qlc__cbar-sep" />
            <CtrlItem icon="⏱" label={ui.delay || 'Delay'}>
              <select className="qlc__cbar-select" value={hifzDelay}
                onChange={(e) => onHifzDelayChange(Number(e.target.value))}>
                {DELAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </CtrlItem>
            <div className="qlc__cbar-sep" />
            <CtrlItem icon="🎙" label={ui.reciter}>
              <select className="qlc__cbar-select" value={reciterId}
                onChange={(e) => onHifzReciterChange(Number(e.target.value))}>
                {HIFZ_RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </CtrlItem>
          </>
        )}

        {hifzMode === 'test' && (
          <>
            <div className="qlc__cbar-sep" />
            <CtrlItem icon="👁" label={ui.showTranslation}>
              <label className="qlc__cbar-toggle">
                <input type="checkbox" checked={showTrans} onChange={(e) => onShowTransChange(e.target.checked)} />
                <span>{showTrans ? 'ON' : 'OFF'}</span>
              </label>
            </CtrlItem>
          </>
        )}
      </div>

      <div className="qlc__hifz-playbar">
        {hifzMode === 'repeat' && (
          navMode !== 'surah' ? (
            <p className="qlc__hifz-warn">⚠ Select a Surah first</p>
          ) : !HIFZ_RECITERS.find((r) => r.id === reciterId) ? (
            <p className="qlc__hifz-warn">⚠ This reciter has no per-verse audio. Choose another reciter above.</p>
          ) : loadingVA ? (
            <span className="qlc__hifz-status">{ui.loading}</span>
          ) : !isPlaying ? (
            <button className="btn btn--green qlc__hifz-startbtn" onClick={startHifz} disabled={!verseAudios.length}>
              ▶ {ui.start}
              <span className="qlc__hifz-startinfo">
                {selectedVerses.length} {ui.verses} · {repeatCount}{ui.times}
                {rangeRepeat > 1 ? ` · ${rangeRepeat}×` : ''}
              </span>
            </button>
          ) : (
            <>
              <button className="btn btn--ghost qlc__hifz-stopbtn" onClick={stopHifz}>{ui.stop}</button>
              <div className="qlc__hifz-progress-wrap">
                <span className="qlc__hifz-verse-label">{ui.verseOf} {fromV + curIdx}</span>
                <div className="qlc__hifz-dots">
                  {Array.from({ length: Math.min(repeatCount, 20) }, (_, i) => (
                    <span key={i} className={`qlc__hdot${i < playCount ? ' on' : ''}`} />
                  ))}
                  {repeatCount > 20 && (
                    <span className="qlc__hdot-more">{playCount}/{repeatCount}</span>
                  )}
                </div>
                {rangeRepeat > 1 && (
                  <span className="qlc__hifz-range">
                    {ui.range || 'Range'} {rangeIteration + 1}/{rangeRepeat}
                  </span>
                )}
              </div>
            </>
          )
        )}
        {hifzMode === 'test' && (
          <>
            <button className="btn btn--ghost btn--sm" onClick={onRevealAll}>{ui.revealAll}</button>
            <button className="btn btn--ghost btn--sm" onClick={onHideAll}>{ui.hideAll}</button>
          </>
        )}
      </div>

      <audio ref={hifzAudio} onEnded={handleHifzEnded} style={{ display: 'none' }} />
    </div>
  );
}
