import { useMemo } from 'react';
import { getDailyWisdom } from '../../../data/dailyWisdom';

export default function DailyWisdomCard({ t }) {
  const quote = useMemo(() => getDailyWisdom(), []);
  const text = t.dashboard.wisdomQuotes?.[quote.id];

  const share = () => {
    const txt = `${quote.arabic}\n\n${text?.gloss || ''}\n— ${text?.source || ''}`;
    if (navigator.share) navigator.share({ title: t.dashboard.wisdomEyebrow, text: txt }).catch(() => {});
    else navigator.clipboard?.writeText(txt);
  };

  return (
    <div className="ds-card ds-wisdom">
      <div className="ds-wisdom__hd">
        <div className="ds-wisdom__eyebrow">{t.dashboard.wisdomEyebrow}</div>
        <button type="button" className="ds-wisdom__share" onClick={share} aria-label="Share">⤴</button>
      </div>
      <p className="ds-wisdom__arabic" dir="rtl" lang="ar">{quote.arabic}</p>
      {text && (
        <>
          <p className="ds-wisdom__gloss">{text.gloss}</p>
          <p className="ds-wisdom__source">{text.source}</p>
        </>
      )}
    </div>
  );
}
