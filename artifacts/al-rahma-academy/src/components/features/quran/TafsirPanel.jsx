import { useState, useEffect } from 'react';
import { getVerseTafsir, getVerseTafsirCloud } from '../../../api/quran';
import { TAFASEER } from '../../../data/quranLangs';

const ALLOWED_TAGS = new Set(['p','br','strong','em','b','i','u','span','div','sup','sub','ul','ol','li','blockquote','h3','h4']);

// Production-readiness audit follow-up (2026-09-17): `text` here is
// third-party tafsir HTML fetched from an external API (api/quran.js's
// getVerseTafsir), not first-party content — a hand-rolled sanitizer that
// builds on a live (even if detached) element via `.innerHTML =` was a real
// residual risk: some resource-bearing disallowed tags (img/svg-image/etc.)
// can start loading and fire an onerror/onload handler as soon as the
// content attribute is parsed, and only strictly-synchronous cleanup before
// the browser dispatches that (queued) event would prevent it — a subtle,
// hard-to-fully-guarantee timing assumption, not a robust guarantee.
// Switched to DOMParser().parseFromString(), which per spec produces an
// inert document with no browsing context — it does not execute scripts and
// does not fetch external resources at all, so there is no such window.
// Still no external dependency added (no DOMPurify) — same allowlist logic
// as before, just parsed into a document that can never load anything.
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  (function clean(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
          child.replaceWith(...child.childNodes);
          clean(node);
        } else {
          [...child.attributes].forEach((a) => child.removeAttribute(a.name));
          clean(child);
        }
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  }(root));
  return root.innerHTML;
}

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
      {err && <p className="qlc__tafsir-err" role="alert">⚠ {err}</p>}
      {text && (
        <div className="qlc__tafsir-body" dir={entry?.lang === 'ar' ? 'rtl' : 'ltr'} lang={entry?.lang}>
          {isHtml
            ? <div className="qlc__tafsir-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />
            : text.split('\n').filter(Boolean).map((para, i) => (
                <p key={i} className="qlc__tafsir-para">{para}</p>
              ))
          }
        </div>
      )}
    </div>
  );
}
