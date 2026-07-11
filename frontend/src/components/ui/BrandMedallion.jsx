import { useId } from 'react';

/**
 * BrandMedallion — Al-Rahma's hero-scale brand signature: the same open
 * book + mosque dome + minaret mark used everywhere else (see BrandIcon.jsx),
 * set inside a static ring/octagon frame. Fully static by design — no
 * rotation, pulse or hover motion — to match the premium, minimal brand
 * presentation used across the rest of the app.
 *
 * Props:
 *   size      – px width/height (default 320)
 *   className – extra class on the root <svg>
 */
export default function BrandMedallion({ size = 320, className = '' }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const uid = useId();
  const bgId = `med-bg-${uid}`;
  const domeId = `med-dome-${uid}`;
  const arcId = `med-text-arc-${uid}`;

  // Decorative octagon (matches the outer ring's rhythm)
  const octR = size * 0.44;
  const octPoints = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 - Math.PI / 8;
    return `${cx + octR * Math.cos(angle)},${cy + octR * Math.sin(angle)}`;
  }).join(' ');

  // Brand icon (native 64×64) scaled to occupy ~44% of the medallion width,
  // positioned in the upper portion so the Arabic wordmark sits below it.
  const iconScale = (size * 0.4405) / 64;
  const iconX = size * 0.2794;
  const iconY = size * 0.2294;

  // Curved text path radius (bottom arc, "Al-Azhar Certified…")
  const textR = size * 0.3121;

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
        <radialGradient id={bgId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#15885f" />
          <stop offset="100%" stopColor="#0a4d39" />
        </radialGradient>
        <linearGradient id={domeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fc296" />
          <stop offset="1" stopColor="#0b6e4f" />
        </linearGradient>
      </defs>

      {/* Outer ring — static */}
      <g>
        <circle cx={cx} cy={cy} r={size * 0.487} fill="none"
          stroke="rgba(212,175,55,0.22)" strokeWidth="1" strokeDasharray="4 6" />
        {/* 8 small diamond markers on outer ring */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const mx = cx + size * 0.487 * Math.cos(a);
          const my = cy + size * 0.487 * Math.sin(a);
          return (
            <circle key={i} cx={mx} cy={my} r={size * 0.014}
              fill="rgba(212,175,55,0.55)" />
          );
        })}
      </g>

      {/* Background disc */}
      <circle cx={cx} cy={cy} r={size * 0.46}
        fill={`url(#${bgId})`}
        stroke="rgba(212,175,55,0.35)" strokeWidth="1.5" />

      {/* Subtle Islamic pattern overlay — concentric dotted rings */}
      {[0.32, 0.38, 0.43].map((ratio, i) => (
        <circle key={i} cx={cx} cy={cy} r={size * ratio}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          strokeDasharray="2 5" />
      ))}

      {/* Octagon frame */}
      <polygon points={octPoints}
        fill="none" stroke="rgba(212,175,55,0.4)" strokeWidth="1.2" />

      {/* Brand icon — open book + mosque dome/minaret */}
      <g transform={`translate(${iconX},${iconY}) scale(${iconScale})`}>
        <rect x="30.5" y="7" width="3" height="7" rx="1.5" fill="#d4af37" />
        <circle cx="32" cy="6" r="1.8" fill="#d4af37" />
        <path d="M22 37 C22 24 26 14 32 14 C38 14 42 24 42 37 Z" fill={`url(#${domeId})`} stroke="#d4af37" strokeWidth="1.1" />
        <rect x="22" y="35" width="20" height="4" rx="1" fill={`url(#${domeId})`} stroke="#d4af37" strokeWidth="1" />
        <path d="M32 42 C25 38 16 38 11 40 L11 54 C16 52 25 52 32 56 Z" fill="#ffffff" />
        <path d="M32 42 C39 38 48 38 53 40 L53 54 C48 52 39 52 32 56 Z" fill="#f1f3f2" />
        <rect x="30.8" y="42" width="2.4" height="13" rx="1.2" fill="#0b6e4f" />
      </g>

      {/* Arabic wordmark, below the icon */}
      <text
        x={cx} y={size * 0.75}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="Amiri, serif"
        fontSize={size * 0.0765}
        fill="#e8c87a"
      >
        الرَّحمة
      </text>
      <text
        x={cx} y={size * 0.8176}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Segoe UI', Arial, sans-serif"
        fontSize={size * 0.0353}
        fontWeight="700"
        letterSpacing={size * 0.004}
        fill="rgba(255,255,255,0.7)"
      >
        ACADEMY
      </text>

      {/* Curved text path: "Al-Azhar Certified · Authentic Ijazah Chain" */}
      <path
        id={arcId}
        d={`M ${cx - textR},${cy} A ${textR},${textR} 0 0 1 ${cx + textR},${cy}`}
        fill="none"
      />
      <text fontSize={size * 0.0279} fill="rgba(212,175,55,0.7)" fontFamily="'Segoe UI', Arial, sans-serif" letterSpacing="1">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          Al-Azhar Certified · Authentic Ijazah Chain
        </textPath>
      </text>
    </svg>
  );
}
