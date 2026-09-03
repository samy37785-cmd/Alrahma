/**
 * BrandIcon — Al-Rahma Academy's official logo mark. Renders the real
 * official artwork (not a hand-drawn recreation) processed into two web
 * variants — see docs/official-logo-integration.md for the full
 * source-to-asset pipeline, matte parameters, and how to rebuild these:
 *
 *   - transparent icon (public/brand/icon.png, 484x560, PNG only — no WebP
 *     variant exists, see the doc's "WebP decision") — the glyph alone,
 *     alpha-matted with the flat render background removed via a
 *     border-flood-fill matte (not a flat color-distance threshold — see
 *     the doc for why that produced a shadow halo), for placements that
 *     already sit on a brand-dark-green (or white) surface: the header bar,
 *     BrandLockup's own card, the sidebar, the footer/auth brand mark.
 *   - tile icon (public/brand/icon-tile-*.png) — the same glyph on its own
 *     self-contained rounded dark-green plate, for standalone badge
 *     placements (favicon, PWA/apple-touch icons, the invoice/dashboard
 *     logo badges) where there's no guarantee of a matching backdrop.
 *
 * Props (API preserved from the previous hand-drawn-SVG implementation, so
 * every existing caller needs no structural changes beyond passing `alt`):
 *   size      – px width; height follows the asset's own aspect ratio
 *               (default 40)
 *   tile      – true (default) = the self-contained tile asset; false = the
 *               transparent icon, for use inside BrandLockup or directly on
 *               an already-brand-colored surface
 *   tone      – 'brand' (default) = full color. 'black' / 'white' = a flat
 *               monochrome silhouette via CSS filter (no separate monochrome
 *               raster export exists for the official art; unused by any
 *               current caller, kept only so the prop still behaves
 *               correctly if a future caller passes it)
 *   alt       – accessible name (default 'Al-Rahma Academy'). Pass alt=""
 *               when the icon sits beside its own visible name as text
 *               (BrandLockup, the dashboard sidebar, the invoice header,
 *               Brand.jsx) — the icon is then decorative, since the text
 *               already announces the name once; a screen reader
 *               announcing it twice is a real regression, not a courtesy.
 *               Only leave the default when BrandIcon is the sole
 *               identifier with no adjacent equivalent text.
 *   className – extra class on the root <img>
 */

const TILE_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 512];

// Intrinsic aspect ratio of the transparent icon export (public/brand/icon.png
// is 484x560 — taller than wide, unlike the square tile) — used to derive a
// non-distorted height from the `size` prop instead of forcing a square box.
const ICON_ASPECT = 484 / 560;

function pickTileSrc(size) {
  const target = size * 2; // export at >=2x the display size for retina sharpness
  const best = TILE_SIZES.find((s) => s >= target) ?? TILE_SIZES[TILE_SIZES.length - 1];
  return `/brand/icon-tile-${best}.png`;
}

const TONE_FILTER = {
  black: 'brightness(0)',
  white: 'brightness(0) invert(1)',
};

export default function BrandIcon({ size = 40, tile = true, tone = 'brand', alt = 'Al-Rahma Academy', className = '' }) {
  const src = tile ? pickTileSrc(size) : '/brand/icon.png';
  const width = tile ? size : Math.round(size * ICON_ASPECT);
  const height = size;
  const style = TONE_FILTER[tone] ? { filter: TONE_FILTER[tone] } : undefined;

  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      aria-hidden={alt === '' ? 'true' : undefined}
      style={style}
      className={`brand-icon${className ? ' ' + className : ''}`}
    />
  );
}
