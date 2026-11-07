import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// One free-trial form for the whole site (owner, 2026-11-06): the header's
// "Free Trial", the home page's tutor, pricing, quiz and Isnad buttons and the
// hero all open the same short QuickTrialModal instead of sending visitors to
// the four-step /enroll wizard. /enroll stays for anyone who follows its link
// directly. The modal is loaded on idle (and on first open, if sooner), so it
// adds nothing to the first paint and nothing to any prerendered page.
const loadModal = () => import('../components/ui/QuickTrialModal');
const QuickTrialModal = lazy(loadModal);

const QuickTrialContext = createContext(null);

export function QuickTrialProvider({ children }) {
  const [state, setState] = useState({ open: false, context: null, loaded: false });

  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => { loadModal().catch(() => {}); });
    return () => cancel(id);
  }, []);

  // context: optional { teacher: { id, name }, plan: string, course: string }
  // picked on the button the visitor pressed; the modal shows it and sends it.
  const openQuickTrial = useCallback((context = null) => {
    setState({ open: true, context, loaded: true });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const value = useMemo(() => ({ openQuickTrial }), [openQuickTrial]);

  return (
    <QuickTrialContext.Provider value={value}>
      {children}
      {state.loaded && (
        <Suspense fallback={null}>
          <QuickTrialModal open={state.open} onClose={close} context={state.context} />
        </Suspense>
      )}
    </QuickTrialContext.Provider>
  );
}

// Null outside the provider (isolated component tests): callers then keep their
// old navigation to /enroll.
// eslint-disable-next-line react-refresh/only-export-components
export function useQuickTrial() {
  return useContext(QuickTrialContext);
}

// For a real <a href="/enroll">: open the modal on a plain left click and let
// modified clicks (new tab, new window) and middle clicks follow the link.
// eslint-disable-next-line react-refresh/only-export-components
export function opensInPlace(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
