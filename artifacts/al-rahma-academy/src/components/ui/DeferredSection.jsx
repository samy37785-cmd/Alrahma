import { useEffect, useRef, useState } from 'react';
import { Skeleton } from './Skeleton';

// Home.jsx used to mount ~20 sections synchronously on first render, which
// measured as 1.5s+ of main-thread blocking even on an unthrottled desktop
// (worse under mobile CPU throttling). This wraps a below-the-fold section so
// it only mounts once it's about to scroll into view, spreading that mount
// cost across the scroll session instead of paying all of it up front.
// rootMargin is generous (600px) so sections finish mounting well before the
// user actually scrolls to them — the deferral should be invisible, not a
// visible pop-in. On a slow device/connection where a gap is still visible,
// a generic centered skeleton reads as "loading" rather than a jarring blank
// space (the placeholder shape can't match every section's real content, so
// it stays intentionally generic rather than guessing).
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
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}
    >
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <Skeleton width="45%" height={22} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="65%" height={14} />
      </div>
    </div>
  );
}
