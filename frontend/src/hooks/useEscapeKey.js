import { useEffect, useRef } from 'react';

/**
 * Calls onEscape whenever the Escape key is pressed while enabled is true.
 * Consolidates the "close on Escape" listener previously hand-rolled
 * separately in several components (QuickTrialModal, Header's mobile drawer).
 *
 * onEscape is read from a ref rather than being a effect dependency, so
 * passing a fresh inline arrow function on every render (the common case)
 * does not tear down and re-attach the listener on every render — only
 * `enabled` flipping does, matching the original hand-rolled effects this
 * replaces (each depended only on their own "is X open" flag).
 */
export function useEscapeKey(onEscape, enabled = true) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => { if (e.key === 'Escape') onEscapeRef.current(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
