import { describe, it, expect, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useEscapeKey } from '../hooks/useEscapeKey';

// Architecture Sprint 3: consolidates the "close on Escape" listener that was
// previously hand-rolled independently in QuickTrialModal.jsx and Header.jsx
// (mobile drawer) — same effect, duplicated. This covers the shared hook's
// exact behavior so the consolidation is a verified no-op, not a guess.

describe('useEscapeKey', () => {
  it('calls onEscape when Escape is pressed while enabled', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call onEscape for other keys', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does not attach a listener at all when disabled', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, false));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('stops responding once enabled flips back to false', () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useEscapeKey(onEscape, enabled), {
      initialProps: { enabled: true },
    });

    rerender({ enabled: false });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('always calls the latest onEscape callback, even without remounting the listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useEscapeKey(cb, true), {
      initialProps: { cb: first },
    });

    // A fresh inline callback on every render (the common real-world case)
    // must not require the caller to memoize it for correctness.
    rerender({ cb: second });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onEscape, true));

    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });
});
