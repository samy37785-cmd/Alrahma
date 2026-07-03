import { useEffect, useRef, useState } from 'react';

// Home.jsx used to mount ~20 sections synchronously on first render, which
// measured as 1.5s+ of main-thread blocking even on an unthrottled desktop
// (worse under mobile CPU throttling). This wraps a below-the-fold section so
// it only mounts once it's about to scroll into view, spreading that mount
// cost across the scroll session instead of paying all of it up front.
// rootMargin is generous (600px) so sections finish mounting well before the
// user actually scrolls to them — the deferral should be invisible, not a
// visible pop-in.
export default function DeferredSection({ children, minHeight = 200 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '600px 0px' }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  if (visible) return children;
  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
}
