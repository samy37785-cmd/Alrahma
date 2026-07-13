import BrandIcon from './BrandIcon';
import '../../styles/brand-lockup.css';

/**
 * BrandLockup — the official full logo lockup (icon + English/Arabic
 * wordmark + Bismillah), redrawn from the brand guideline sheet as a
 * self-contained card so it drops cleanly onto any page background
 * (Hero's light section, a dark footer, etc.) without needing per-page
 * text-color overrides — the guideline's lockup panels are themselves
 * self-contained dark-green plates, not transparent artwork meant to sit
 * directly on arbitrary backgrounds.
 *
 * Props:
 *   orientation    – 'horizontal' (icon, a tall gold divider, then a
 *                    stacked text column) or 'vertical' (icon on top, text
 *                    centered below), matching the guideline's two named
 *                    lockup variants exactly — including horizontal's
 *                    vertical divider spine between icon and text, which
 *                    the guideline shows explicitly. Default 'horizontal'.
 *   tone           – passthrough to BrandIcon ('brand' default, or
 *                    'black'/'white' for a monochrome icon on a
 *                    non-brand-colored background).
 *   showBismillah  – include the Bismillah line (default true). Set false
 *                    for tighter spaces where the guideline's own compact
 *                    mockups omit it.
 *   plain          – skip the card's own background/padding/shadow
 *                    (default false), for dropping the icon+wordmark
 *                    directly onto a parent that's already the brand's
 *                    dark green (e.g. the site header bar) instead of
 *                    nesting one dark card inside another.
 *   size           – icon px size (default 64 horizontal / 76 vertical,
 *                    matching the guideline's own proportions). Override
 *                    for smaller placements like a nav bar.
 *   className      – extra class on the root element
 */
export default function BrandLockup({ orientation = 'horizontal', tone = 'brand', showBismillah = true, plain = false, size, className = '' }) {
  const iconSize = size ?? (orientation === 'horizontal' ? 64 : 76);
  return (
    <div className={`brand-lockup brand-lockup--${orientation}${plain ? ' brand-lockup--plain' : ''}${className ? ' ' + className : ''}`}>
      <BrandIcon size={iconSize} tile={false} tone={tone} className="brand-lockup__icon" />
      {orientation === 'horizontal' && <span className="brand-lockup__spine" aria-hidden="true" />}
      <div className="brand-lockup__text">
        <div className="brand-lockup__en">
          <span className="brand-lockup__en-main">AL-RAHMA</span>
          <span className="brand-lockup__divider" aria-hidden="true" />
          <span className="brand-lockup__en-sub">ACADEMY</span>
        </div>
        <div className="brand-lockup__ar" lang="ar" dir="rtl">
          أكاديمية الرحمة
        </div>
        {showBismillah && (
          <div className="brand-lockup__bismillah" lang="ar" dir="rtl">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>
        )}
      </div>
    </div>
  );
}
