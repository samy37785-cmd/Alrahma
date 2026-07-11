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
 *   orientation    – 'horizontal' (icon left, text right) or 'vertical'
 *                    (icon top, text below), matching the guideline's two
 *                    named lockup variants. Default 'horizontal'.
 *   showBismillah  – include the Bismillah line (default true). Set false
 *                    for tighter spaces where the guideline's own compact
 *                    mockups omit it.
 *   className      – extra class on the root element
 */
export default function BrandLockup({ orientation = 'horizontal', showBismillah = true, className = '' }) {
  return (
    <div className={`brand-lockup brand-lockup--${orientation}${className ? ' ' + className : ''}`}>
      <BrandIcon size={orientation === 'horizontal' ? 64 : 76} tile={false} className="brand-lockup__icon" />
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
