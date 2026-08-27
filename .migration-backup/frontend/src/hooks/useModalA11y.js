import { useEffect, useRef } from 'react';

// Shared modal accessibility behavior: closes on Escape, moves initial focus
// into the dialog, locks background scroll while open, and returns focus to
// whatever triggered the modal once it closes. Extracted from the one modal
// in this codebase that already had this (QuickTrialModal.jsx) so the other
// five modals — previously missing all of it — get the same behavior without
// each re-implementing it.
//
// Usage: const firstFocusRef = useModalA11y(isOpen, onClose);
// then attach `ref={firstFocusRef}` to the first focusable element inside
// the dialog (a close button, or the first input).
export function useModalA11y(isOpen, onClose) {
  const firstFocusRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;
    const focusTimer = setTimeout(() => firstFocusRef.current?.focus(), 60);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return firstFocusRef;
}
