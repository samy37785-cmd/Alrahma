import { useEffect, useState } from 'react';

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a number counting up from 0 to `target` while `active` is true.
 * Jumps straight to `target` for prefers-reduced-motion users instead of
 * running the interval-driven animation (a plain setInterval count, unlike
 * CSS transitions, isn't covered by the site-wide reduced-motion override).
 */
export default function useCountUp(target, duration = 1600, active = false, decimals = 0) {
  const [count, setCount] = useState(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) { setCount(target); return; }

    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(decimals ? parseFloat(start.toFixed(decimals)) : Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration, decimals]);

  return count;
}
