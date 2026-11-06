import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusableIn(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
}

// Shared modal accessibility behavior: closes on Escape, moves initial focus
// into the dialog, keeps Tab / Shift+Tab inside it, locks background scroll
// while open, and returns focus to whatever triggered the modal once it
// closes. Extracted from the one modal in this codebase that already had
// this (QuickTrialModal.jsx) so the other five modals — previously missing
// all of it — get the same behavior without each re-implementing it.
//
// Usage: const firstFocusRef = useModalA11y(isOpen, onClose);
// then attach `ref={firstFocusRef}` to the first focusable element inside
// the dialog (a close button, or the first input). The focus trap uses the
// nearest [role="dialog"] around that element; without one, Tab is left alone.
export function useModalA11y(isOpen, onClose) {
  const firstFocusRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;
    const focusTimer = setTimeout(() => firstFocusRef.current?.focus(), 60);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = firstFocusRef.current?.closest?.('[role="dialog"]');
      if (!dialog) return;
      const items = focusableIn(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // html carries `overflow-x: clip`, so body's overflow no longer reaches
    // the viewport: the page itself is html's to lock. The gutter keeps the
    // layout from jumping sideways when a desktop scrollbar disappears.
    const root = document.documentElement;
    const prev = {
      body: document.body.style.overflow,
      root: root.style.overflow,
      gutter: root.style.scrollbarGutter,
    };
    const hadScrollbar = window.innerWidth > root.clientWidth;
    document.body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    if (hadScrollbar) root.style.scrollbarGutter = 'stable';

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev.body;
      root.style.overflow = prev.root;
      root.style.scrollbarGutter = prev.gutter;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return firstFocusRef;
}
