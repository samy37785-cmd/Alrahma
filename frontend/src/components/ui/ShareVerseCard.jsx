import { useCallback, useRef, useState } from 'react';

const VERSE_DESIGNS = [
  { bg: 'linear-gradient(135deg, #0b6e4f 0%, #1a9e72 100%)', accent: '#d4af37', text: '#fff' },
  { bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', accent: '#d4af37', text: '#fff' },
  { bg: 'linear-gradient(135deg, #2d1b69 0%, #4a2a8a 100%)', accent: '#f0c040', text: '#fff' },
  { bg: 'linear-gradient(135deg, #7c3a00 0%, #b35400 100%)', accent: '#ffd700', text: '#fff' },
];

export default function ShareVerseCard({ verse, translation, reference, lang, onClose }) {
  const cardRef = useRef(null);
  const [design, setDesign] = useState(0);
  const [copied, setCopied] = useState(false);

  const d = VERSE_DESIGNS[design];

  const shareText = `${verse}\n\n${translation}\n— ${reference}\n\n🕌 Al-Rahma Academy · al-rahma.academy`;

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title: reference, text: shareText });
    } catch { /* cancelled */ }
  }, [shareText, reference]);

  const handleWhatsApp = useCallback(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  }, [shareText]);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareText]);

  const handleDownload = useCallback(() => {
    if (!cardRef.current) return;
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width  = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // Background gradient — approximate since CSS gradients aren't directly reproducible
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (design === 0) { grad.addColorStop(0, '#0b6e4f'); grad.addColorStop(1, '#1a9e72'); }
    else if (design === 1) { grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#16213e'); }
    else if (design === 2) { grad.addColorStop(0, '#2d1b69'); grad.addColorStop(1, '#4a2a8a'); }
    else { grad.addColorStop(0, '#7c3a00'); grad.addColorStop(1, '#b35400'); }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Golden border frame
    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

    // Arabic verse
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${70}px serif`;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    const verseLines = wrapText(ctx, verse, canvas.width - 160, 70);
    let y = 240;
    verseLines.forEach((line) => { ctx.fillText(line, canvas.width / 2, y); y += 90; });

    // Divider
    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(200, y + 20); ctx.lineTo(canvas.width - 200, y + 20);
    ctx.stroke();

    // Translation
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${36}px sans-serif`;
    ctx.direction = 'ltr';
    const transLines = wrapText(ctx, translation, canvas.width - 180, 36);
    y += 70;
    transLines.forEach((line) => { ctx.fillText(line, canvas.width / 2, y); y += 50; });

    // Reference
    ctx.fillStyle = d.accent;
    ctx.font = `bold ${28}px sans-serif`;
    ctx.fillText(`— ${reference}`, canvas.width / 2, y + 40);

    // Branding
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${22}px sans-serif`;
    ctx.fillText('Al-Rahma Academy · al-rahma.academy', canvas.width / 2, canvas.height - 80);

    // Download
    const link = document.createElement('a');
    link.download = `quran-verse-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    void scale; // suppress unused warning
  }, [d, design, verse, translation, reference]);

  return (
    <div className="share-verse-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share verse card">
      <div className="share-verse-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-verse-modal__header">
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Share Verse Card</span>
          <button className="share-verse-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Preview card */}
        <div
          ref={cardRef}
          className="share-verse-card"
          style={{ background: d.bg, '--accent': d.accent, '--text': d.text }}
        >
          <div className="share-verse-card__frame" />
          <div className="share-verse-card__arabic" dir="rtl">{verse}</div>
          <div className="share-verse-card__divider" />
          <div className="share-verse-card__translation">{translation}</div>
          <div className="share-verse-card__ref" style={{ color: d.accent }}>— {reference}</div>
          <div className="share-verse-card__brand">Al-Rahma Academy</div>
        </div>

        {/* Design picker */}
        <div className="share-verse-designs">
          {VERSE_DESIGNS.map((dsgn, i) => (
            <button
              key={i}
              className={`share-verse-design-btn${design === i ? ' active' : ''}`}
              style={{ background: dsgn.bg }}
              onClick={() => setDesign(i)}
              aria-label={`Design ${i + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="share-verse-actions">
          {typeof navigator !== 'undefined' && navigator.share && (
            <button className="share-verse-btn share-verse-btn--native" onClick={handleNativeShare}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share
            </button>
          )}
          <button className="share-verse-btn share-verse-btn--wa" onClick={handleWhatsApp}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            WhatsApp
          </button>
          <button className="share-verse-btn share-verse-btn--copy" onClick={handleCopy}>
            {copied ? '✓ Copied!' : '📋 Copy text'}
          </button>
          <button className="share-verse-btn share-verse-btn--dl" onClick={handleDownload}>
            ⬇ Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
