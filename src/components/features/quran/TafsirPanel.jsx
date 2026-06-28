import { useState, useEffect } from 'react';
import { getVerseTafsir, getVerseTafsirCloud } from '../../../api/quran';
import { TAFASEER } from '../../../data/quranLangs';

export default function TafsirPanel({ verseKey, tafsirId, onClose, ui }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  const entry  = TAFASEER.find((t) => t.id === tafsirId);
  const isHtml = entry?.source !== 'cloud';

  useEffect(() => {
    let alive = true;
    setLoading(true); setText(''); setErr('');
    const fetchP = entry?.source === 'cloud'
      ? getVerseTafsirCloud(verseKey, entry.edition)
      : getVerseTafsir(verseKey, tafsirId);
    fetchP
      .then((t) => { if (alive) setText(t); })
      .catch(() => { if (alive) setErr('التفسير غير متوفر لهذه الآية.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [verseKey, tafsirId, entry]);

  return (
    <div className="qlc__tafsir-panel">
      <div className="qlc__tafsir-head">
        <div className="qlc__tafsir-head-left">
          <span className="qlc__tafsir-name">📖 {entry?.name || 'تفسير'}</span>
          {entry?.nameEn && <span className="qlc__tafsir-name-en">{entry.nameEn}</span>}
        </div>
        <div className="qlc__tafsir-head-right">
          <span className="qlc__tafsir-key">{verseKey}</span>
          <button className="qlc__tafsir-close" onClick={onClose}>✕</button>
        </div>
      </div>
      {loading && (
        <div className="qlc__tafsir-loading-wrap">
          <div className="qlc__tafsir-spinner" />
          <span>{ui.tafsirLoading || 'جاري التحميل…'}</span>
        </div>
      )}
      {err && <p className="qlc__tafsir-err">⚠ {err}</p>}
      {text && (
        <div className="qlc__tafsir-body" dir={entry?.lang === 'ar' ? 'rtl' : 'ltr'} lang={entry?.lang}>
          {isHtml
            ? <div className="qlc__tafsir-html" dangerouslySetInnerHTML={{ __html: text }} />
            : text.split('\n').filter(Boolean).map((para, i) => (
                <p key={i} className="qlc__tafsir-para">{para}</p>
              ))
          }
        </div>
      )}
    </div>
  );
}
