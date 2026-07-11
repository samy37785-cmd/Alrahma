import { useState } from 'react';
import { escapeHtml } from '../../utils/escapeHtml';

const TYPE_LABEL = {
  completion: 'Certificate of Completion',
  hifz:       'Certificate of Hifz (Memorisation)',
  ijazah:     'Ijazah Certificate',
  attendance: 'Certificate of Attendance',
};

const TYPE_COLOR = {
  completion: '#0b6e4f',
  hifz:       '#1a5fa0',
  ijazah:     '#8b5e3c',
  attendance: '#5a3e8b',
};

function CertificatePrintView({ cert }) {
  const color = TYPE_COLOR[cert.type] || '#0b6e4f';
  // cert.title/studentName/issuedBy/course.title/certificateNumber are
  // admin-supplied free text (issueCertificate accepts them directly from
  // the admin request body) — interpolating them unescaped into raw HTML
  // written via document.write() would let a crafted value execute script
  // in this window's context (which shares the app's origin). Escaped here
  // the same way Profile.jsx's printCertificate already correctly does for
  // the same data.
  const title = escapeHtml(cert.title);
  const studentName = escapeHtml(cert.studentName);
  const issuedBy = escapeHtml(cert.issuedBy || 'Al-Rahma Academy');
  const courseTitle = escapeHtml(cert.course?.title);
  const certificateNumber = escapeHtml(cert.certificateNumber);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title} — Al-Rahma Academy</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Playfair+Display:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Playfair Display', Georgia, serif;
    background: #f9f6ef;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cert {
    background: #fff;
    width: 800px; max-width: 100%;
    border: 12px double ${color};
    border-radius: 4px;
    padding: 60px 70px;
    text-align: center;
    position: relative;
    box-shadow: 0 4px 40px rgba(0,0,0,.12);
  }
  .cert::before {
    content: '';
    position: absolute; inset: 18px;
    border: 1px solid ${color}44;
    border-radius: 2px;
    pointer-events: none;
  }
  .cert__mark {
    width: 56px; height: 56px;
    margin: 0 auto 10px;
  }
  .cert__logo {
    font-family: 'Amiri', serif;
    font-size: 1.5rem;
    color: ${color};
    margin-bottom: 6px;
  }
  .cert__academy { font-size: .85rem; letter-spacing: .15em; text-transform: uppercase; color: #888; margin-bottom: 30px; }
  .cert__bismillah { font-family: 'Amiri', serif; font-size: 2rem; color: ${color}; margin-bottom: 24px; direction: rtl; }
  .cert__label { font-size: .8rem; letter-spacing: .2em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
  .cert__type { font-size: 1.9rem; font-weight: 700; color: ${color}; margin-bottom: 28px; }
  .cert__presented { font-size: .9rem; color: #999; margin-bottom: 10px; }
  .cert__name { font-size: 2.6rem; font-weight: 700; color: #1a1a1a; margin-bottom: 24px; border-bottom: 2px solid ${color}22; padding-bottom: 20px; }
  .cert__title { font-size: 1.05rem; color: #444; margin-bottom: 6px; }
  .cert__course { font-size: .9rem; color: #888; margin-bottom: 32px; }
  .cert__meta { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; padding-top: 24px; border-top: 1px solid #eee; }
  .cert__sig { text-align: center; }
  .cert__sig-line { width: 160px; border-bottom: 1.5px solid #333; margin: 0 auto 6px; }
  .cert__sig-name { font-size: .78rem; font-weight: 700; color: #333; }
  .cert__sig-title { font-size: .7rem; color: #999; }
  .cert__number { font-size: .7rem; color: #ccc; margin-top: 20px; }
  .cert__date { font-size: .78rem; color: #888; }
  .cert__seal { width: 80px; height: 80px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .cert__seal-text { color: #fff; font-size: .6rem; text-align: center; letter-spacing: .05em; line-height: 1.3; }
  @media print { body { padding: 0; background: #fff; } .cert { box-shadow: none; width: 100%; } }
</style>
</head>
<body>
<div class="cert">
  <div class="cert__mark">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Al-Rahma Academy">
      <defs>
        <linearGradient id="cert-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b6e4f"/>
          <stop offset="1" stop-color="#15885f"/>
        </linearGradient>
        <linearGradient id="cert-mark-dome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3fc296"/>
          <stop offset="1" stop-color="#0b6e4f"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#cert-mark-bg)"/>
      <rect x="30.5" y="7" width="3" height="7" rx="1.5" fill="#d4af37"/>
      <circle cx="32" cy="6" r="1.8" fill="#d4af37"/>
      <path d="M22 37 C22 24 26 14 32 14 C38 14 42 24 42 37 Z" fill="url(#cert-mark-dome)" stroke="#d4af37" stroke-width="1.1"/>
      <rect x="22" y="35" width="20" height="4" rx="1" fill="url(#cert-mark-dome)" stroke="#d4af37" stroke-width="1"/>
      <path d="M32 42 C25 38 16 38 11 40 L11 54 C16 52 25 52 32 56 Z" fill="#ffffff"/>
      <path d="M32 42 C39 38 48 38 53 40 L53 54 C48 52 39 52 32 56 Z" fill="#f1f3f2"/>
      <rect x="30.8" y="42" width="2.4" height="13" rx="1.2" fill="#0b6e4f"/>
    </svg>
  </div>
  <div class="cert__logo">أكاديمية الرحمة</div>
  <div class="cert__academy">Al-Rahma Academy</div>
  <div class="cert__bismillah">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</div>
  <div class="cert__label">This is to certify that</div>
  <div class="cert__name">${studentName}</div>
  <div class="cert__presented">has successfully completed</div>
  <div class="cert__type">${TYPE_LABEL[cert.type] || escapeHtml(cert.type)}</div>
  <div class="cert__title">${title}</div>
  ${courseTitle ? `<div class="cert__course">Course: ${courseTitle}</div>` : ''}
  ${cert.grade != null ? `<div class="cert__course">Grade: <strong>${Number(cert.grade)}/100</strong></div>` : ''}
  <div class="cert__meta">
    <div class="cert__sig">
      <div class="cert__sig-line"></div>
      <div class="cert__sig-name">${issuedBy}</div>
      <div class="cert__sig-title">Issuing Authority</div>
      <div class="cert__date">${new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    <div class="cert__seal">
      <div class="cert__seal-text">AL-RAHMA<br/>ACADEMY<br/>CERTIFIED</div>
    </div>
    <div class="cert__sig">
      <div class="cert__sig-line"></div>
      <div class="cert__sig-name">Academic Director</div>
      <div class="cert__sig-title">Al-Rahma Academy</div>
    </div>
  </div>
  <div class="cert__number">Certificate No. ${certificateNumber}</div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
}

export default function CertificateCard({ cert }) {
  const color = TYPE_COLOR[cert.type] || '#0b6e4f';
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    // window.open returns null (rather than throwing) when the browser's
    // popup blocker intervenes — this used to crash on the next line with no
    // indication to the user why the button appeared to do nothing.
    if (!win) { setPopupBlocked(true); return; }
    setPopupBlocked(false);
    const html = CertificatePrintView({ cert });
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `2px solid ${color}33`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 12,
      padding: '16px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.4rem',
      }}>
        {cert.type === 'ijazah' ? '📜' : cert.type === 'hifz' ? '🧠' : '🎓'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cert.title}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {TYPE_LABEL[cert.type] || cert.type}
          {cert.course?.title && ` · ${cert.course.title}`}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          Issued {new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          {cert.grade != null && ` · Grade: ${cert.grade}/100`}
          <span style={{ marginLeft: 6, color: `${color}99` }}>{cert.certificateNumber}</span>
        </div>
      </div>

      {/* Print / save as PDF — this opens a print dialog, it doesn't download
          a file directly, so the label says so rather than "Download". */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            background: `${color}15`,
            border: `1px solid ${color}33`,
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
          title="Print or save as PDF"
        >
          🖨 Print / Save PDF
        </button>
        {popupBlocked && (
          <span role="alert" style={{ fontSize: '0.68rem', color: 'var(--color-danger-text)', textAlign: 'right', maxWidth: 140 }}>
            Please allow pop-ups to print this certificate.
          </span>
        )}
      </div>
    </div>
  );
}
