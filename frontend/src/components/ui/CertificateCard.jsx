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
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${cert.title} — Al-Rahma Academy</title>
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
  <div class="cert__logo">أكاديمية الرحمة</div>
  <div class="cert__academy">Al-Rahma Academy</div>
  <div class="cert__bismillah">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</div>
  <div class="cert__label">This is to certify that</div>
  <div class="cert__name">${cert.studentName}</div>
  <div class="cert__presented">has successfully completed</div>
  <div class="cert__type">${TYPE_LABEL[cert.type] || cert.type}</div>
  <div class="cert__title">${cert.title}</div>
  ${cert.course?.title ? `<div class="cert__course">Course: ${cert.course.title}</div>` : ''}
  ${cert.grade != null ? `<div class="cert__course">Grade: <strong>${cert.grade}/100</strong></div>` : ''}
  <div class="cert__meta">
    <div class="cert__sig">
      <div class="cert__sig-line"></div>
      <div class="cert__sig-name">${cert.issuedBy || 'Al-Rahma Academy'}</div>
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
  <div class="cert__number">Certificate No. ${cert.certificateNumber}</div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
}

export default function CertificateCard({ cert }) {
  const color = TYPE_COLOR[cert.type] || '#0b6e4f';

  const handleDownload = () => {
    const html = CertificatePrintView({ cert });
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{
      background: '#fff',
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

      {/* Download */}
      <button
        type="button"
        onClick={handleDownload}
        style={{
          flexShrink: 0,
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
        title="Download certificate as PDF"
      >
        ⬇ Download
      </button>
    </div>
  );
}
