import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeferredSection from '../components/ui/DeferredSection';

// Frontend UX Sprint 1 (Homepage): DeferredSection used to render a bare
// aria-hidden blank div while waiting to mount its children — this covers
// the replacement generic skeleton placeholder, plus the pre-existing
// no-IntersectionObserver fallback (jsdom has no IntersectionObserver by
// default, so that path is exercised by every other test in this file).

describe('DeferredSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no IntersectionObserver available (jsdom default): renders children immediately', () => {
    render(<DeferredSection><p>Real content</p></DeferredSection>);
    expect(screen.getByText('Real content')).toBeInTheDocument();
  });

  it('IntersectionObserver available but not yet intersecting: shows a skeleton placeholder, not the real children', () => {
    class FakeIO {
      constructor() {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);

    render(<DeferredSection><p>Real content</p></DeferredSection>);

    expect(screen.queryByText('Real content')).not.toBeInTheDocument();
    expect(document.querySelector('.skeleton')).toBeTruthy();
  });

  it('IntersectionObserver reports intersecting: mounts the real children instead of the skeleton', () => {
    let callback;
    class FakeIO {
      constructor(cb) { callback = cb; }
      observe() { callback([{ isIntersecting: true }]); }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);

    render(<DeferredSection><p>Real content</p></DeferredSection>);

    expect(screen.getByText('Real content')).toBeInTheDocument();
    expect(document.querySelector('.skeleton')).toBeFalsy();
  });
});
