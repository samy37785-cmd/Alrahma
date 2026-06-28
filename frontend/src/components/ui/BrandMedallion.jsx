/**
 * BrandMedallion — Al-Rahma's unique visual signature.
 * An 8-point Islamic geometric star (Rub el Hizb pattern) built entirely
 * from SVG paths. No external image, no runtime dependency.
 *
 * Props:
 *   size      – px width/height (default 320)
 *   animated  – rotate outer ring (default true)
 *   className – extra class on the root <svg>
 */
export default function BrandMedallion({ size = 320, animated = true, className = '' }) {
  const r = size / 2;
  const cx = r;
  const cy = r;

  // 8-point star polygon: two overlapping squares rotated 45° apart
  // Outer radius: 38% of size, inner notch: 21%
  const outerR = size * 0.38;
  const innerR = size * 0.21;
  const points8 = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    return `${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`;
  }).join(' ');

  // Decorative octagon (connecting the star points)
  const octR = size * 0.44;
  const octPoints = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 - Math.PI / 8;
    return `${cx + octR * Math.cos(angle)},${cy + octR * Math.sin(angle)}`;
  }).join(' ');

  // Small inner circle text arc radius
  const textR = size * 0.285;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-medallion${className ? ' ' + className : ''}`}
      aria-label="Al-Rahma Academy emblem"
      role="img"
    >
      <defs>
        <radialGradient id="med-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e4d8c" />
          <stop offset="100%" stopColor="#0b3a6b" />
        </radialGradient>
        <radialGradient id="med-star" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e8a93a" />
          <stop offset="100%" stopColor="#b8721e" />
        </radialGradient>
        <filter id="med-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.012} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="med-star-glow" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.018} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer ring — animated */}
      <g style={animated ? { transformOrigin: `${cx}px ${cy}px`, animation: 'med-spin 60s linear infinite' } : {}}>
        <circle cx={cx} cy={cy} r={size * 0.487} fill="none"
          stroke="rgba(200,132,42,0.22)" strokeWidth="1" strokeDasharray="4 6" />
        {/* 8 small diamond markers on outer ring */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const mx = cx + size * 0.487 * Math.cos(a);
          const my = cy + size * 0.487 * Math.sin(a);
          return (
            <circle key={i} cx={mx} cy={my} r={size * 0.014}
              fill="rgba(200,132,42,0.55)" />
          );
        })}
      </g>

      {/* Background disc */}
      <circle cx={cx} cy={cy} r={size * 0.46}
        fill="url(#med-bg)"
        stroke="rgba(200,132,42,0.35)" strokeWidth="1.5" />

      {/* Subtle Islamic pattern overlay — concentric dotted rings */}
      {[0.32, 0.38, 0.43].map((ratio, i) => (
        <circle key={i} cx={cx} cy={cy} r={size * ratio}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          strokeDasharray="2 5" />
      ))}

      {/* Octagon frame */}
      <polygon points={octPoints}
        fill="none" stroke="rgba(200,132,42,0.4)" strokeWidth="1.2" />

      {/* 8-point star — the brand signature */}
      <polygon points={points8}
        fill="url(#med-star)"
        filter="url(#med-star-glow)"
        opacity="0.92" />

      {/* Inner circle */}
      <circle cx={cx} cy={cy} r={size * 0.2}
        fill="rgba(10,40,80,0.65)"
        stroke="rgba(200,132,42,0.5)" strokeWidth="1.5" />

      {/* Arabic Bismillah — centre */}
      <text
        x={cx} y={cy - size * 0.028}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="Amiri, serif"
        fontSize={size * 0.072}
        fill="#e8c87a"
        filter="url(#med-glow)"
      >
        الرَّحمة
      </text>
      <text
        x={cx} y={cy + size * 0.065}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Segoe UI', Arial, sans-serif"
        fontSize={size * 0.032}
        fontWeight="700"
        letterSpacing={size * 0.004}
        fill="rgba(255,255,255,0.55)"
      >
        ACADEMY
      </text>

      {/* Curved text path: "Est. 1444 AH · Al-Azhar Certified" */}
      <path
        id="med-text-arc"
        d={`M ${cx - textR},${cy} A ${textR},${textR} 0 0 1 ${cx + textR},${cy}`}
        fill="none"
      />
      <text fontSize={size * 0.028} fill="rgba(200,132,42,0.7)" fontFamily="'Segoe UI', Arial, sans-serif" letterSpacing="1">
        <textPath href="#med-text-arc" startOffset="50%" textAnchor="middle">
          Al-Azhar Certified · Authentic Ijazah Chain
        </textPath>
      </text>

      <style>{`
        @keyframes med-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
