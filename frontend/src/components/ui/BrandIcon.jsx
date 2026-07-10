import { useId } from 'react';

/**
 * BrandIcon — Al-Rahma Academy's logo mark: an open book with a mosque
 * dome + minaret rising from the spine, on a rounded green tile. This is
 * the single source of truth for the brand mark — every logo placement in
 * the app (header, footer, auth pages, dashboard sidebar, favicon, splash
 * screen, social preview) renders this same icon rather than each
 * maintaining its own copy, so a future brand update only happens in one
 * place.
 *
 * The tile background is always rendered (not optional) so the mark stays
 * legible regardless of what's behind it — light header, dark footer, dark
 * Quran reader bar, light auth card — the same reason the existing
 * favicon.svg already worked everywhere without a light/dark variant.
 *
 * Props:
 *   size      – px width/height (default 32)
 *   className – extra class on the root <svg>
 */
export default function BrandIcon({ size = 32, className = '' }) {
  const uid = useId();
  const bgId = `brand-bg-${uid}`;
  const domeId = `brand-dome-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Al-Rahma Academy"
      className={`brand-icon${className ? ' ' + className : ''}`}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b6e4f" />
          <stop offset="1" stopColor="#15885f" />
        </linearGradient>
        <linearGradient id={domeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fc296" />
          <stop offset="1" stopColor="#0b6e4f" />
        </linearGradient>
      </defs>

      {/* rounded tile */}
      <rect width="64" height="64" rx="15" fill={`url(#${bgId})`} />

      {/* minaret + crescent finial */}
      <rect x="30.5" y="7" width="3" height="7" rx="1.5" fill="#d4af37" />
      <circle cx="32" cy="6" r="1.8" fill="#d4af37" />

      {/* dome: single smooth bulge from base to a rounded point */}
      <path d="M22 37 C22 24 26 14 32 14 C38 14 42 24 42 37 Z" fill={`url(#${domeId})`} stroke="#d4af37" strokeWidth="1.1" />
      {/* dome base / drum */}
      <rect x="22" y="35" width="20" height="4" rx="1" fill={`url(#${domeId})`} stroke="#d4af37" strokeWidth="1" />

      {/* open book (Quran) */}
      <path d="M32 42 C25 38 16 38 11 40 L11 54 C16 52 25 52 32 56 Z" fill="#ffffff" />
      <path d="M32 42 C39 38 48 38 53 40 L53 54 C48 52 39 52 32 56 Z" fill="#f1f3f2" />
      <rect x="30.8" y="42" width="2.4" height="13" rx="1.2" fill="#0b6e4f" />
    </svg>
  );
}
