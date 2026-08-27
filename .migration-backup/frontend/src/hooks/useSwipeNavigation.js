import { useRef, useCallback } from 'react';

// Simple threshold-based horizontal swipe detector — deliberately hand-rolled
// instead of a gesture library, since the only requirement is "swipe left/
// right triggers next/prev", not drag physics.
const SWIPE_THRESHOLD = 50; // px, minimum horizontal travel to count as a swipe
const SWIPE_RESTRAINT = 75; // px, max vertical drift allowed before we assume it's a scroll

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, disabled = false } = {}) {
  const startRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (disabled || !e.touches?.[0]) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  }, [disabled]);

  const onTouchEnd = useCallback((e) => {
    if (disabled || !startRef.current || !e.changedTouches?.[0]) { startRef.current = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    startRef.current = null;
    if (Math.abs(dy) > SWIPE_RESTRAINT || Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }, [disabled, onSwipeLeft, onSwipeRight]);

  return { onTouchStart, onTouchEnd };
}
