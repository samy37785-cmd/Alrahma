import { useState, useCallback } from 'react';

const SHARE_MESSAGES = {
  surah: (name) => `🎉 I just completed ${name} at Al-Rahma Academy! Alhamdulillah. Learn Quran online: alrahmaacademy.com`,
  juz: (n) => `🌙 I memorized Juz ${n} of the Holy Quran at Al-Rahma Academy! Join me: alrahmaacademy.com`,
  percent: (pct) => `📖 I reached ${pct}% progress in my Quran course at Al-Rahma Academy! alrahmaacademy.com`,
};

function getShareText(type, value) {
  return SHARE_MESSAGES[type]?.(value) ?? `I'm learning Quran at Al-Rahma Academy! alrahmaacademy.com`;
}

function canNativeShare() {
  return typeof navigator !== 'undefined' && !!navigator.share;
}

export default function ShareAchievement({ type = 'percent', value, label, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const text = getShareText(type, value);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title: 'My Al-Rahma Achievement', text, url: 'https://alrahmaacademy.com' });
    } catch {
      /* user cancelled */
    }
  }, [text]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* noop */ }
  }, [text]);

  const handleWhatsApp = useCallback(() => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [text]);

  const handleFacebook = useCallback(() => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://alrahmaacademy.com')}&quote=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [text]);

  return (
    <div className="share-achievement" role="dialog" aria-modal="true" aria-label="Share your achievement">
      <div className="share-achievement__card">
        <button className="share-achievement__close" onClick={onDismiss} aria-label="Close">×</button>

        {/* Arabic calligraphy badge */}
        <div className="share-achievement__badge">
          <div className="share-achievement__arabic">بِسْمِ اللَّهِ</div>
          <div className="share-achievement__stars" aria-hidden="true">★★★★★</div>
        </div>

        <h3 className="share-achievement__title">مَاشَاءَ اللَّه! 🎉</h3>
        <p className="share-achievement__label">{label}</p>
        <p className="share-achievement__sub">Share your achievement and inspire others to start their Quran journey.</p>

        <div className="share-achievement__actions">
          {canNativeShare() && (
            <button type="button" className="share-achievement__btn share-achievement__btn--native" onClick={handleNativeShare}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>
          )}
          <button type="button" className="share-achievement__btn share-achievement__btn--whatsapp" onClick={handleWhatsApp}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button type="button" className="share-achievement__btn share-achievement__btn--facebook" onClick={handleFacebook}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Facebook
          </button>
          <button type="button" className="share-achievement__btn share-achievement__btn--copy" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
      <div className="share-achievement__backdrop" onClick={onDismiss} aria-hidden="true" />
    </div>
  );
}
