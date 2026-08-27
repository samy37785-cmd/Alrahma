import { useId } from 'react';

/**
 * BrandIcon — Al-Rahma Academy's official logo mark, hand-redrawn as SVG
 * from the official brand guideline sheet: a green mosque dome with a gold
 * minaret + crescent finial, resting on a two-tone green/gold laurel-leaf /
 * open-book wing shape. This is the single source of truth for the icon —
 * every logo placement in the app renders this same component so a future
 * brand update only happens in one place.
 *
 * Palette is the guideline's exact 5 swatches: #0C3834 (deep green tile),
 * #1E6B5C (mid green), #D4AF37 (gold), #F6F1E6 (cream), #0F1417 (near-black,
 * used sparingly for depth in shading only).
 *
 * Props:
 *   size      – px width/height (default 40)
 *   tile      – render the rounded-square dark-green background (default
 *               true, matching the guideline's "App Icon"/"Favicon" panels;
 *               set false for use inside BrandLockup, where the icon sits
 *               directly on the page's own dark-green background instead)
 *   tone      – 'brand' (default) = full gradient color version. 'black' /
 *               'white' = flat single-color silhouette matching the
 *               guideline's monochrome panels — no gradients, no stroke, no
 *               internal rib linework, since the guideline's monochrome
 *               versions are clean solid shapes. `tile` is ignored for
 *               monochrome tones (the guideline's mono panels are icon-only,
 *               no background plate).
 *   className – extra class on the root <svg>
 */
export default function BrandIcon({ size = 40, tile = true, tone = 'brand', className = '' }) {
  const uid = useId();
  const tileId = `bi-tile-${uid}`;
  const domeId = `bi-dome-${uid}`;
  const wingLId = `bi-wingl-${uid}`;
  const wingRId = `bi-wingr-${uid}`;

  if (tone === 'black' || tone === 'white') {
    const fill = tone === 'black' ? '#0f1417' : '#f6f1e6';
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Al-Rahma Academy"
        className={`brand-icon brand-icon--${tone}${className ? ' ' + className : ''}`}
      >
        <rect x="47.6" y="14.5" width="4.8" height="13" rx="2.4" fill={fill} />
        <path
          d="M50 9c2.6 0 4.7 2 4.7 4.5 0 1-.35 1.95-.95 2.7a5.4 5.4 0 0 0 .1-6.1 4.9 4.9 0 0 0-3.85-1.6 4.9 4.9 0 0 0-3.85 1.6 5.4 5.4 0 0 0 .1 6.1 4.6 4.6 0 0 1-.95-2.7c0-2.5 2.1-4.5 4.7-4.5Z"
          fill={fill}
        />
        <path
          d="M50 26.5 C 44.5 26.5, 40.5 31, 38.7 37 C 37.2 42, 37 47, 38.2 51.5 C 38.9 54, 40.3 55.7, 42 56.4 C 42 55, 42.4 54, 43.2 53.5 C 45.2 52.2, 54.8 52.2, 56.8 53.5 C 57.6 54, 58 55, 58 56.4 C 59.7 55.7, 61.1 54, 61.8 51.5 C 63 47, 62.8 42, 61.3 37 C 59.5 31, 55.5 26.5, 50 26.5 Z"
          fill={fill}
        />
        <rect x="36" y="55.5" width="28" height="7" rx="1.5" fill={fill} />
        <path
          d="M50 60 C 40 66, 24 66, 12 61 C 10.5 61.5, 9 63.5, 9 66 C 9 76, 22 84, 38 85.5 C 44 86, 48 84, 50 80 Z"
          fill={fill}
        />
        <path
          d="M50 60 C 60 66, 76 66, 88 61 C 89.5 61.5, 91 63.5, 91 66 C 91 76, 78 84, 62 85.5 C 56 86, 52 84, 50 80 Z"
          fill={fill}
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Al-Rahma Academy"
      className={`brand-icon${className ? ' ' + className : ''}`}
    >
      <defs>
        <linearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#123f3a" />
          <stop offset="1" stopColor="#0c3834" />
        </linearGradient>
        {/* Dome: darker at the base, lighter highlight toward the upper-left */}
        <linearGradient id={domeId} x1="0.15" y1="0.05" x2="0.85" y2="1">
          <stop offset="0" stopColor="#3a9c85" />
          <stop offset="0.45" stopColor="#1e6b5c" />
          <stop offset="1" stopColor="#0c3834" />
        </linearGradient>
        {/* Wings: mirrored two-tone gradient — green at the spine, gold at the outer tip */}
        <linearGradient id={wingLId} x1="1" y1="0.3" x2="0" y2="1">
          <stop offset="0" stopColor="#1e6b5c" />
          <stop offset="0.4" stopColor="#2c8069" />
          <stop offset="0.72" stopColor="#c39a3a" />
          <stop offset="1" stopColor="#d4af37" />
        </linearGradient>
        <linearGradient id={wingRId} x1="0" y1="0.3" x2="1" y2="1">
          <stop offset="0" stopColor="#1e6b5c" />
          <stop offset="0.4" stopColor="#2c8069" />
          <stop offset="0.72" stopColor="#c39a3a" />
          <stop offset="1" stopColor="#d4af37" />
        </linearGradient>
      </defs>

      {tile && <rect width="100" height="100" rx="22" fill={`url(#${tileId})`} />}

      {/* Minaret shaft + crescent finial */}
      <rect x="47.6" y="14.5" width="4.8" height="13" rx="2.4" fill="#d4af37" />
      <path
        d="M50 9c2.6 0 4.7 2 4.7 4.5 0 1-.35 1.95-.95 2.7a5.4 5.4 0 0 0 .1-6.1 4.9 4.9 0 0 0-3.85-1.6 4.9 4.9 0 0 0-3.85 1.6 5.4 5.4 0 0 0 .1 6.1 4.6 4.6 0 0 1-.95-2.7c0-2.5 2.1-4.5 4.7-4.5Z"
        fill="#d4af37"
      />

      {/* Dome: bulbous onion-dome silhouette (bulges near the base, tapers to a point) on a short drum */}
      <path
        d="M50 26.5
           C 44.5 26.5, 40.5 31, 38.7 37
           C 37.2 42, 37 47, 38.2 51.5
           C 38.9 54, 40.3 55.7, 42 56.4
           C 42 55, 42.4 54, 43.2 53.5
           C 45.2 52.2, 54.8 52.2, 56.8 53.5
           C 57.6 54, 58 55, 58 56.4
           C 59.7 55.7, 61.1 54, 61.8 51.5
           C 63 47, 62.8 42, 61.3 37
           C 59.5 31, 55.5 26.5, 50 26.5
           Z"
        fill={`url(#${domeId})`}
        stroke="#d4af37"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="36" y="55.5" width="28" height="7" rx="1.5" fill={`url(#${domeId})`} stroke="#d4af37" strokeWidth="1.4" />

      {/* Wings — a laurel-leaf / open-book shape fanning out beneath the dome */}
      <path
        d="M50 60
           C 40 66, 24 66, 12 61
           C 10.5 61.5, 9 63.5, 9 66
           C 9 76, 22 84, 38 85.5
           C 44 86, 48 84, 50 80
           Z"
        fill={`url(#${wingLId})`}
      />
      <path
        d="M50 60
           C 60 66, 76 66, 88 61
           C 89.5 61.5, 91 63.5, 91 66
           C 91 76, 78 84, 62 85.5
           C 56 86, 52 84, 50 80
           Z"
        fill={`url(#${wingRId})`}
      />
      {/* Center spine, echoing the open-book fold */}
      <path d="M50 60 L50 80.5" stroke="#0c3834" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      {/* Layered rib lines on each wing, echoing a stacked-page/feather pattern —
          3 per wing at increasing radius, fading opacity outward */}
      <path d="M47 61.5 C 41 65, 32 65.5, 24 63.5" stroke="#0c3834" strokeWidth="0.7" opacity="0.32" fill="none" />
      <path d="M46 63 C 38 67, 26 68, 15 64.5" stroke="#0c3834" strokeWidth="0.8" opacity="0.28" fill="none" />
      <path d="M44.5 65.5 C 34 70.5, 20 71.5, 11.5 67" stroke="#0c3834" strokeWidth="0.7" opacity="0.22" fill="none" />
      <path d="M53 61.5 C 59 65, 68 65.5, 76 63.5" stroke="#0c3834" strokeWidth="0.7" opacity="0.32" fill="none" />
      <path d="M54 63 C 62 67, 74 68, 85 64.5" stroke="#0c3834" strokeWidth="0.8" opacity="0.28" fill="none" />
      <path d="M55.5 65.5 C 66 70.5, 80 71.5, 88.5 67" stroke="#0c3834" strokeWidth="0.7" opacity="0.22" fill="none" />
    </svg>
  );
}
