import { CtrlItem } from './QuranControls';
import QuranPlayer from './QuranPlayer';
import { RECITERS } from '../../../api/quran';
import { TRANSLATIONS, TAFASEER } from '../../../data/quranLangs';

/* Build a readable option label: "🇰🇼 Mishari Rashid al-Afasy · Murattal" */
const reciterLabel = (r) =>
  `${r.flag ?? ''} ${r.name}${r.style ? ` · ${r.style}` : ''}`.trim();

export default function QuranReadingControls({
  reciterId, lang, tafsirId, fontSize, navMode, audioUrl, audioRef, audioKey, ui,
  onReciterChange, onLangChange, onTafsirChange, onFontSizeChange,
}) {
  const activeReciter = RECITERS.find((r) => r.id === reciterId);

  return (
    <div className="qlc__cbar">
      <div className="qlc__cbar-selects">
        <CtrlItem icon="🎙" label={ui.reciter}>
          <select
            className="qlc__cbar-select"
            value={reciterId}
            onChange={(e) => onReciterChange(Number(e.target.value))}
          >
            {RECITERS.map((r) => (
              <option key={`${r.id}-${r.style}`} value={r.id}>
                {reciterLabel(r)}
              </option>
            ))}
          </select>
        </CtrlItem>

        <div className="qlc__cbar-sep" />

        <CtrlItem icon="🌐" label={ui.translation}>
          <select
            className="qlc__cbar-select"
            value={lang}
            onChange={(e) => onLangChange(e.target.value)}
          >
            {TRANSLATIONS.map((t) => (
              <option key={t.lang} value={t.lang}>
                {t.flag} {t.label} — {t.name}
              </option>
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
          <span className="qlc__cbar-label">🔤 {ui.fontSize ?? 'Font'}</span>
          <div className="qlc__cbar-font-row">
            <button
              className="qlc__cbar-font-btn"
              onClick={() => onFontSizeChange((v) => Math.max(v - 2, 22))}
              aria-label="Decrease font size"
            >
              A−
            </button>
            <span className="qlc__cbar-font-val">{fontSize}px</span>
            <button
              className="qlc__cbar-font-btn"
              onClick={() => onFontSizeChange((v) => Math.min(v + 2, 52))}
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {navMode === 'surah' && audioUrl && (
        <QuranPlayer
          src={audioUrl}
          audioKey={audioKey}
          audioRef={audioRef}
          reciterName={activeReciter ? reciterLabel(activeReciter) : ''}
        />
      )}
    </div>
  );
}
