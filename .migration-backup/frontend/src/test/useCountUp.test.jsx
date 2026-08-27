import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCountUp from '../hooks/useCountUp';

// Frontend UX Sprint 2 (Student Dashboard): extracted from StatsBanner.jsx's
// previously-local, non-exported useCountUp so Dashboard.jsx's KPI stats can
// reuse the same count-up animation instead of duplicating it — this also
// added a prefers-reduced-motion check the original never had (a plain
// setInterval count isn't covered by the site-wide CSS reduced-motion
// override, unlike transitions/animations).

describe('useCountUp', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts at 0 and stays at 0 while inactive', () => {
    const { result } = renderHook(() => useCountUp(100, 1600, false));
    expect(result.current).toBe(0);
  });

  it('counts up toward the target over time once active', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountUp(160, 1600, true));

    expect(result.current).toBe(0);

    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(160);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(160);
  });

  it('supports decimal precision', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountUp(4.5, 100, true, 1));

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(4.5);
  });

  it('prefers-reduced-motion: jumps straight to the target, no animation', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.useFakeTimers();

    const { result } = renderHook(() => useCountUp(250, 1600, true));

    expect(result.current).toBe(250);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(result.current).toBe(250);
  });
});
