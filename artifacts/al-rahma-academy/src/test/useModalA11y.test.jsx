import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useModalA11y } from '../hooks/useModalA11y';

// Coverage for T20: 5 of 6 modals in this codebase had no Escape-to-close or
// focus management at all (only QuickTrialModal did, hand-rolled). This
// hook was extracted from that pattern so all 6 share identical behavior.
// Tests the hook directly, in isolation, since it has no rendering of its
// own to assert against.

describe('useModalA11y', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it('does nothing while closed: no keydown listener, no focus, no scroll lock', () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(false, onClose));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose when Escape is pressed while open', () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(true, onClose));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(true, onClose));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores it on close/unmount', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = renderHook(({ open }) => useModalA11y(open, onClose), {
      initialProps: { open: true },
    });
    expect(document.body.style.overflow).toBe('hidden');

    rerender({ open: false });
    expect(document.body.style.overflow).toBe('');

    rerender({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('locks the page (html) too, since html carries overflow-x: clip, and restores it', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useModalA11y(open, onClose), {
      initialProps: { open: true },
    });
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender({ open: false });
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const [first, middle, last] = ['a', 'b', 'c'].map((name) => {
      const b = document.createElement('button');
      b.textContent = name;
      dialog.appendChild(b);
      return b;
    });
    const outside = document.createElement('button');
    document.body.append(dialog, outside);

    const { result } = renderHook(() => useModalA11y(true, vi.fn()));
    act(() => { result.current.current = first; });

    const tab = (shiftKey = false) => {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    last.focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(last);

    middle.focus();
    expect(tab()).toBe(false); // the browser moves focus on its own inside the dialog

    outside.focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(first);

    dialog.remove();
    outside.remove();
  });

  it('moves focus to the returned ref shortly after opening', async () => {
    vi.useRealTimers(); // focus + waitFor need real timers

    const button = document.createElement('button');
    document.body.appendChild(button);

    const onClose = vi.fn();
    const { result } = renderHook(() => useModalA11y(true, onClose));
    act(() => { result.current.current = button; });

    // Re-render isn't needed — the effect already scheduled the focus timer
    // against whatever `.current` holds when it fires.
    await waitFor(() => expect(document.activeElement).toBe(button), { timeout: 500 });

    document.body.removeChild(button);
  });

  it('returns focus to the previously-focused element after closing', async () => {
    vi.useRealTimers();

    const trigger = document.createElement('button');
    const modalButton = document.createElement('button');
    document.body.appendChild(trigger);
    document.body.appendChild(modalButton);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = vi.fn();
    const { result, rerender } = renderHook(({ open }) => useModalA11y(open, onClose), {
      initialProps: { open: true },
    });
    act(() => { result.current.current = modalButton; });
    await waitFor(() => expect(document.activeElement).toBe(modalButton), { timeout: 500 });

    rerender({ open: false });
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
    document.body.removeChild(modalButton);
  });
});
