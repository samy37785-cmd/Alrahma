import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { routePreloadMap } from '../../routePreloadMap';

// Route-level code splitting means the browser can't discover a page's JS/CSS
// until React has already parsed the entry bundle and matched the route —
// on a throttled mobile connection that serial step alone added 700ms-1.5s+
// on top of an already-slow load in our field measurements. This component
// closes that gap two ways, without touching the initial critical path:
//   1. Links already on screen are prefetched once the browser is idle.
//   2. Any link is prefetched the instant a finger/pointer touches it —
//      touchstart/pointerdown fire before the tap's click+navigation, so the
//      chunk request is already in flight when the route actually changes.
const triggered = new Set();

function preloadFor(pathname) {
  const load = routePreloadMap[pathname];
  if (!load || triggered.has(pathname)) return;
  triggered.add(pathname);
  load().catch(() => triggered.delete(pathname));
}

function internalPathname(anchor) {
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/')) return null;
  return href.split('?')[0].split('#')[0];
}

export default function RoutePrefetcher() {
  const { pathname } = useLocation();

  // Delegated on document, so it keeps working across client-side navigations
  // without needing to re-bind after every route change.
  useEffect(() => {
    const onPointerIntent = (e) => {
      const anchor = e.target.closest('a[href]');
      const target = internalPathname(anchor);
      if (target) preloadFor(target);
    };
    document.addEventListener('touchstart', onPointerIntent, { passive: true });
    document.addEventListener('pointerdown', onPointerIntent, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onPointerIntent);
      document.removeEventListener('pointerdown', onPointerIntent);
    };
  }, []);

  // Re-scan on-screen links after every navigation — the DOM is different
  // on every route, so a one-time scan at app mount would miss most links.
  useEffect(() => {
    let observer;
    let cancelled = false;
    const idleId = ('requestIdleCallback' in window ? requestIdleCallback : (cb) => setTimeout(cb, 1500))(() => {
      if (cancelled) return;
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = internalPathname(entry.target);
          if (target) preloadFor(target);
          observer.unobserve(entry.target);
        }
      }, { rootMargin: '200px' });

      document.querySelectorAll('a[href^="/"]').forEach((a) => observer.observe(a));
    }, { timeout: 3000 });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if ('cancelIdleCallback' in window) cancelIdleCallback(idleId);
    };
  }, [pathname]);

  return null;
}
