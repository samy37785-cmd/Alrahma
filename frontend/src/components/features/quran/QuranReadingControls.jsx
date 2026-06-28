import { CtrlItem } from './QuranControls';
import { RECITERS } from '../../../api/quran';
import { TRANSLATIONS, TAFASEER } from '../../../data/quranLangs';

export default function QuranReadingControls({
  reciterId, lang, tafsirId, fontSize, navMode, audioUrl, audioRef, audioKey, ui,
  onReciterChange, onLangChange, onTafsirChange, onFontSizeChange,
}) {
  return (
    <div className="qlc__cbar">
      <div className="qlc__cbar-selects">
        <CtrlItem icon="🎙" label={ui.reciter}>
          <select className="qlc__cbar-select" value={reciterId} onChange={(e) => onReciterChange(Number(e.target.value))}>
            {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </CtrlItem>
        <div className="qlc__cbar-sep" />
        <CtrlItem icon="🌐" label={ui.translation}>
          <select className="qlc__cbar-select" value={lang} onChange={(e) => onLangChange(e.target.value)}>
            {TRANSLATIONS.map((t) => (
              <option key={t.lang} value={t.lang}>{t.flag} {t.label} — {t.name}</option>
            ))}
          </select>
        </CtrlItem>
        <div className="qlc__cbar-sep" />
        <CtrlItem icon="📚" label={ui.tafsir}>
          <select
            className="qlc__cbar-select"
            value={tafsirId}
            onChange={(e) => onTafsirChange(Number(e.target.value))}
          >
            <option value={0}>— اختر تفسيراً —</option>
            <optgroup label="تفاسير عربية">
              {TAFASEER.filter((t) => t.lang === 'ar').map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
            <optgroup label="Other languages">
              {TAFASEER.filter((t) => t.lang !== 'ar').map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.lang.toUpperCase()})</option>
              ))}
            </optgroup>
          </select>
        </CtrlItem>
        <div className="qlc__cbar-sep" />
        <div className="qlc__cbar-item">
          <span className="qlc__cbar-label">🔤 Font</span>
          <div className="qlc__cbar-font-row">
            <button className="qlc__cbar-font-btn" onClick={() => onFontSizeChange((v) => Math.max(v - 2, 22))}>A−</button>
            <span className="qlc__cbar-font-val">{fontSize}px</span>
            <button className="qlc__cbar-font-btn" onClick={() => onFontSizeChange((v) => Math.min(v + 2, 52))}>A+</button>
          </div>
        </div>
      </div>

      {navMode === 'surah' && audioUrl && (
        <div className="qlc__cbar-player">
          <span className="qlc__cbar-reciter-name">
            ♪ {RECITERS.find((r) => r.id === reciterId)?.name}
          </span>
          <audio ref={audioRef} controls src={audioUrl} className="qlc__audio"
            key={audioKey} />
        </div>
      )}
    </div>
  );
}
