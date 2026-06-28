import { useRef } from 'react';

/*
 * MobileCarousel — keeps the existing desktop grid EXACTLY as-is, and on small
 * screens turns the same row of cards into a swipeable, scroll-snap carousel
 * with left/right arrow buttons. All the responsive behaviour lives in CSS
 * (.mcar*) under a max-width media query, so desktop is untouched.
 *
 * Usage: wrap the cards and pass the original grid class so the desktop layout
 * is preserved:
 *   <MobileCarousel trackClassName="courses__grid">{cards}</MobileCarousel>
 */
export default function MobileCarousel({ trackClassName = '', children, ariaLabel }) {
  const trackRef = useRef(null);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    // Scroll by ~85% of the visible width so the next card snaps into view.
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className="mcar" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="mcar__arrow mcar__arrow--prev"
        aria-label="Previous"
        onClick={() => scroll(-1)}
      >
        ‹
      </button>

      <div className={`mcar__track ${trackClassName}`} ref={trackRef}>
        {children}
      </div>

      <button
        type="button"
        className="mcar__arrow mcar__arrow--next"
        aria-label="Next"
        onClick={() => scroll(1)}
      >
        ›
      </button>
    </div>
  );
}
