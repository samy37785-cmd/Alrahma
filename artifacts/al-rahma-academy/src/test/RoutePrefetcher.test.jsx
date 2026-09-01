import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import RoutePrefetcher from '../components/ui/RoutePrefetcher';

// Stage 2C Final Corrective Round 2 (see docs/user-admin-auth-contract.md):
// the full frontend suite passed all 1637 assertions but still exited 1,
// because RoutePrefetcher's idle-scheduled scan called
// `new IntersectionObserver(...)` unconditionally. jsdom (this project's
// test environment) has neither `requestIdleCallback` nor
// `IntersectionObserver`, so the fallback `setTimeout` always fired a
// `ReferenceError: IntersectionObserver is not defined` as an unhandled
// exception 1.5s after any test rendered <App/> - often surfacing during a
// LATER, unrelated test once its timer finally elapsed. This file had zero
// prior dedicated coverage; it now proves the production fix (a runtime
// guard, plus a scheduler/canceller pairing that never leaks a timer) both
// when IntersectionObserver is absent (jsdom's real default) and when a
// fake one is present, without ever adding a global IntersectionObserver
// mock to setup.js to paper over the gap.

vi.mock('../routePreloadMap', () => ({
  routePreloadMap: {
    '/rp-pointer': vi.fn(() => Promise.resolve({})),
    '/rp-observer': vi.fn(() => Promise.resolve({})),
    '/rp-filter-blank': vi.fn(() => Promise.resolve({})),
    '/rp-filter-download': vi.fn(() => Promise.resolve({})),
    '/rp-unmount-fallback': vi.fn(() => Promise.resolve({})),
    '/rp-unmount-idle': vi.fn(() => Promise.resolve({})),
    '/rp-path-a': vi.fn(() => Promise.resolve({})),
    '/rp-path-b': vi.fn(() => Promise.resolve({})),
    '/rp-locale': vi.fn(() => Promise.resolve({})),
  },
}));

import { routePreloadMap } from '../routePreloadMap';

function NavButton({ to }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>navigate</button>;
}

function renderHarness({ links = [], navTo, initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {links.map((l, i) => (
        <a key={i} href={l.href} target={l.target} download={l.download}>
          {l.text || `link-${i}`}
        </a>
      ))}
      {navTo && <NavButton to={navTo} />}
      <RoutePrefetcher />
    </MemoryRouter>,
  );
}

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el) {
    this.observed.push(el);
  }
  unobserve = vi.fn();
  disconnect = vi.fn();
}
FakeIntersectionObserver.instances = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeIntersectionObserver.instances = [];
});

describe('RoutePrefetcher: IntersectionObserver unavailable (jsdom default)', () => {
  beforeEach(() => {
    expect(typeof window.IntersectionObserver).toBe('undefined');
    expect('requestIdleCallback' in window).toBe(false);
  });

  it('the idle-scheduled scan runs without throwing and never attempts `new IntersectionObserver`', () => {
    vi.useFakeTimers();
    renderHarness({ links: [{ href: '/rp-observer' }] });

    expect(() => vi.advanceTimersByTime(1500)).not.toThrow();
    // No IntersectionObserver was ever defined globally, so if the guard
    // failed this would already have thrown above - this assertion just
    // documents the invariant explicitly.
    expect(typeof window.IntersectionObserver).toBe('undefined');
  });

  it('pointer/touch intent prefetch keeps working when IntersectionObserver is absent', () => {
    const { getByText } = renderHarness({ links: [{ href: '/rp-pointer', text: 'go' }] });
    fireEvent.pointerDown(getByText('go'));
    expect(routePreloadMap['/rp-pointer']).toHaveBeenCalledTimes(1);
  });

  it('touchstart intent prefetch also keeps working when IntersectionObserver is absent', () => {
    const { getByText } = renderHarness({ links: [{ href: '/rp-locale', text: 'go2' }] });
    fireEvent.touchStart(getByText('go2'));
    expect(routePreloadMap['/rp-locale']).toHaveBeenCalledTimes(1);
  });
});

describe('RoutePrefetcher: IntersectionObserver available (stubbed)', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('creates an observer during the idle-scheduled scan and observes internal root-relative links', () => {
    vi.useFakeTimers();
    const { getByText } = renderHarness({ links: [{ href: '/rp-observer', text: 'internal' }] });

    vi.advanceTimersByTime(1500);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const instance = FakeIntersectionObserver.instances[0];
    expect(instance.observed).toContain(getByText('internal'));
  });

  it('calls the route preloader when an observed link intersects, then unobserves it', () => {
    vi.useFakeTimers();
    const { getByText } = renderHarness({ links: [{ href: '/rp-observer', text: 'internal' }] });
    vi.advanceTimersByTime(1500);

    const instance = FakeIntersectionObserver.instances[0];
    const anchor = getByText('internal');
    instance.callback([{ isIntersecting: true, target: anchor }]);

    expect(routePreloadMap['/rp-observer']).toHaveBeenCalledTimes(1);
    expect(instance.unobserve).toHaveBeenCalledWith(anchor);
  });

  it('never prefetches a target="_blank" link even if it intersects', () => {
    vi.useFakeTimers();
    const { getByText } = renderHarness({ links: [{ href: '/rp-filter-blank', target: '_blank', text: 'blank' }] });
    vi.advanceTimersByTime(1500);

    const instance = FakeIntersectionObserver.instances[0];
    instance.callback([{ isIntersecting: true, target: getByText('blank') }]);

    expect(routePreloadMap['/rp-filter-blank']).not.toHaveBeenCalled();
  });

  it('never prefetches a download link even if it intersects', () => {
    vi.useFakeTimers();
    const { getByText } = renderHarness({ links: [{ href: '/rp-filter-download', download: '', text: 'dl' }] });
    vi.advanceTimersByTime(1500);

    const instance = FakeIntersectionObserver.instances[0];
    instance.callback([{ isIntersecting: true, target: getByText('dl') }]);

    expect(routePreloadMap['/rp-filter-download']).not.toHaveBeenCalled();
  });

  it('resolves a locale-prefixed href (/fr/...) to its unprefixed route key before prefetching', () => {
    vi.useFakeTimers();
    const { getByText } = renderHarness({ links: [{ href: '/fr/rp-locale', text: 'frlink' }] });
    vi.advanceTimersByTime(1500);

    const instance = FakeIntersectionObserver.instances[0];
    instance.callback([{ isIntersecting: true, target: getByText('frlink') }]);

    expect(routePreloadMap['/rp-locale']).toHaveBeenCalledTimes(1);
  });
});

describe('RoutePrefetcher: scheduling is cancellable and never leaks a timer', () => {
  it('unmounting before the setTimeout fallback fires cancels it - no scan, no observer construction', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const { unmount } = renderHarness({ links: [{ href: '/rp-unmount-fallback' }] });

    unmount();
    vi.advanceTimersByTime(5000);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(routePreloadMap['/rp-unmount-fallback']).not.toHaveBeenCalled();
  });

  it('unmounting before requestIdleCallback fires calls cancelIdleCallback with the matching id, not clearTimeout', () => {
    let capturedCallback;
    const requestIdle = vi.fn((cb) => {
      capturedCallback = cb;
      return 4242;
    });
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    const { unmount } = renderHarness({ links: [{ href: '/rp-unmount-idle' }] });
    unmount();

    expect(cancelIdle).toHaveBeenCalledWith(4242);
    // Defense in depth: even if a stub browser ignored the cancel and fired
    // the callback late, the internal `cancelled` guard must still stop it.
    expect(() => capturedCallback()).not.toThrow();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(routePreloadMap['/rp-unmount-idle']).not.toHaveBeenCalled();
  });

  it('a pathname change disconnects the previous observer and rescans the new path', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const { getByText } = renderHarness({
      links: [{ href: '/rp-path-a', text: 'a' }, { href: '/rp-path-b', text: 'b' }],
      navTo: '/some-other-route',
    });

    vi.advanceTimersByTime(1500);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const firstInstance = FakeIntersectionObserver.instances[0];

    fireEvent.click(getByText('navigate'));
    expect(firstInstance.disconnect).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
  });
});
