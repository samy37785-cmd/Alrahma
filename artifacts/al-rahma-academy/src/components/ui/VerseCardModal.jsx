import { useRef } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';
import { escapeHtml } from '../../utils/escapeHtml';

const clean = (html = '') =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, ' ').replace(/<\/div>/gi, ' ')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").trim();

export default function VerseCardModal({ verse, chapterName, onClose }) {
  const cardRef = useRef(null);
  const firstFocusRef = useModalA11y(!!verse, onClose);

  if (!verse) return null;

  const arabic    = verse.text_uthmani || '';
  const trans     = verse.translations?.[0] ? clean(verse.translations[0].text) : '';
  const verseKey  = verse.verse_key || '';

  const handleShare = async () => {
    const [s, v] = verseKey.split(':');
    const url = `${window.location.origin}/tools/quran-reader#s=${s}&v=${v}`;
    const text = `${arabic}\n\n"${trans}"\n— Quran ${verseKey}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Quran ${verseKey}`, text, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      alert('Verse link copied to clipboard!');
    }
  };

  const handlePrint = () => {
    const card = cardRef.current;
    if (!card) return;
    const win = window.open('', '_blank', 'width=640,height=480');
    // arabic/trans/verseKey/chapterName come from the third-party Quran API,
    // not directly from our own users or admins — but a compromised/malicious
    // upstream response would still execute script in this window's
    // same-origin context via document.write() if left unescaped, so this
    // gets the same treatment as CertificateCard.jsx's admin-supplied data.
    const safeArabic = escapeHtml(arabic);
    const safeTrans = escapeHtml(trans);
    const safeVerseKey = escapeHtml(verseKey);
    const safeChapterName = escapeHtml(chapterName);
    win.document.write(`
      <html><head><title>Quran ${safeVerseKey}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#0b2e1e; display:flex; align-items:center; justify-content:center; min-height:100vh; font-family:Georgia,serif; }
        .card { background:linear-gradient(145deg,#0e3d28,#0b2e1e); border:1px solid rgba(212,175,55,.35); border-radius:16px; padding:40px 48px; max-width:580px; width:100%; text-align:center; }
        .brand { font-size:.75rem; letter-spacing:3px; color:rgba(212,175,55,.7); text-transform:uppercase; margin-bottom:28px; }
        .arabic { font-family:'Amiri',serif; font-size:2rem; color:#fff; line-height:1.9; direction:rtl; margin-bottom:24px; }
        .trans { font-size:.95rem; color:#a8d4bc; line-height:1.8; font-style:italic; margin-bottom:20px; }
        .ref { font-size:.78rem; color:rgba(212,175,55,.8); letter-spacing:1px; }
        .footer { margin-top:28px; font-size:.7rem; color:rgba(255,255,255,.3); letter-spacing:2px; text-transform:uppercase; }
      </style></head>
      <body>
        <div class="card">
          <div class="brand">Al-Rahma Academy</div>
          <div class="arabic">${safeArabic}</div>
          ${safeTrans ? `<div class="trans">"${safeTrans}"</div>` : ''}
          <div class="ref">Quran · ${safeVerseKey}${safeChapterName ? ` · ${safeChapterName}` : ''}</div>
          <div class="footer">alrahma.academy</div>
        </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  };

  return (
    <div
      className="vcard-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Share this verse"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="vcard-modal">
        <button ref={firstFocusRef} className="vcard-modal__close" onClick={onClose} aria-label="Close">✕</button>

        {/* The shareable card */}
        <div className="vcard" ref={cardRef}>
          <p className="vcard__brand">Al-Rahma Academy</p>

          <div className="vcard__decor" aria-hidden="true">
            <span className="vcard__decor-line" />
            <span className="vcard__decor-diamond">◆</span>
            <span className="vcard__decor-line" />
          </div>

          <p className="vcard__arabic" dir="rtl" lang="ar">{arabic}</p>

          {trans && (
            <p className="vcard__trans">
              <span className="vcard__quote-mark">&quot;</span>
              {trans}
              <span className="vcard__quote-mark">&quot;</span>
            </p>
          )}

          <div className="vcard__decor vcard__decor--bottom" aria-hidden="true">
            <span className="vcard__decor-line" />
            <span className="vcard__decor-diamond">◆</span>
            <span className="vcard__decor-line" />
          </div>

          <p className="vcard__ref">
            Quran · {verseKey}
            {chapterName ? ` · ${chapterName}` : ''}
          </p>

          <p className="vcard__footer">alrahma.academy</p>
        </div>

        {/* Actions */}
        <div className="vcard-modal__actions">
          <button className="btn btn--gold" onClick={handleShare}>
            {navigator.share ? '🔗 Share' : '📋 Copy link'}
          </button>
          <button className="btn btn--ghost" onClick={handlePrint}>
            🖨️ Save as image
          </button>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="vcard-modal__hint">
          Take a screenshot of the card above to share it on Instagram or WhatsApp.
        </p>
      </div>
    </div>
  );
}
