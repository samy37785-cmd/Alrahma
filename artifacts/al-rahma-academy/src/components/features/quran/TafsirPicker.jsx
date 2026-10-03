import { TAFASEER } from '../../../data/quranLangs';

export default function TafsirPicker({ onSelect, onClose, ui = {} }) {
  const AR  = TAFASEER.filter((t) => t.lang === 'ar');
  const NON = TAFASEER.filter((t) => t.lang !== 'ar');
  return (
    <div className="qlc__tafsir-picker" dir={ui.tafsirPickerTitle ? ui.dir : 'rtl'}>
      <div className="qlc__tafsir-picker-head">
        <span>📚 {ui.tafsirPickerTitle || 'اختر التفسير'}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="qlc__tafsir-picker-group">
        <p className="qlc__tafsir-picker-cat">{ui.tafsirGroupArabic || 'تفاسير عربية'}</p>
        {AR.map((t) => (
          <button key={t.id} className="qlc__tafsir-picker-item" onClick={() => onSelect(t.id)}>
            <span className="qlc__tafsir-picker-name">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="qlc__tafsir-picker-group">
        <p className="qlc__tafsir-picker-cat">{ui.tafsirGroupOther || 'تفاسير بلغات أخرى'}</p>
        {NON.map((t) => (
          <button key={t.id} className="qlc__tafsir-picker-item" onClick={() => onSelect(t.id)}>
            <span className="qlc__tafsir-picker-name">{t.name}</span>
            <span className="qlc__tafsir-picker-en">{t.nameEn}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
