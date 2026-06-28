import { useEffect, useRef } from 'react';

/**
 * Adds a `.reveal` class to the element and toggles `.visible` when it
 * scrolls into view. Returns a ref to attach to the target element.
 */
export default function useScrollReveal(options = { threshold: 0.12 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.add('reveal');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
