import { describe, it, expect, vi } from 'vitest';
import { decideBootRedirect, runBootRedirect } from '../utils/bootRedirect';

// Stage 1 URL Closure (see docs/localization-audit.md): the pre-mount
// runtime fallback. decideBootRedirect() is pure (no window access) so it
// can be tested without a DOM at all; runBootRedirect() is the thin,
// separately-tested side-effecting wrapper main.jsx actually calls before
// creating a React root.

function fakeWindow(pathname, search = '', hash = '') {
  const replace = vi.fn();
  const assign = vi.fn();
  return { location: { pathname, search, hash, replace, assign } };
}

describe('decideBootRedirect: pure decision, no window needed', () => {
  it('a legacy ?lang= URL resolves to its canonical href, hash preserved', () => {
    expect(decideBootRedirect({ pathname: '/courses/ijazah', search: '?lang=ar&foo=bar', hash: '#lesson' }))
      .toBe('/ar/courses/ijazah?foo=bar#lesson');
  });

  it('an already-canonical URL resolves to null - no redirect needed', () => {
    expect(decideBootRedirect({ pathname: '/fr/courses/ijazah', search: '', hash: '' })).toBeNull();
  });

  it('17. a plain canonical visit (no query at all) also resolves to null', () => {
    expect(decideBootRedirect({ pathname: '/', search: '', hash: '' })).toBeNull();
  });
});

describe('runBootRedirect: 15. uses replace(), never assign()', () => {
  it('calls location.replace with the canonical href when a redirect is needed', () => {
    const win = fakeWindow('/', '?lang=fr', '');
    const redirected = runBootRedirect(win);
    expect(redirected).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith('/fr/');
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('16. returns true and calls replace() when the URL is non-canonical (caller must skip React mount)', () => {
    const win = fakeWindow('/courses/ijazah', '?lang=de&foo=bar', '#lesson');
    expect(runBootRedirect(win)).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith('/de/courses/ijazah?foo=bar#lesson');
  });
});

describe('runBootRedirect: 17. normal mount when already canonical', () => {
  it('returns false and never calls replace()/assign() for an already-canonical URL', () => {
    const win = fakeWindow('/fr/', '', '');
    expect(runBootRedirect(win)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('25. never redirects a plain canonical deep route - no post-hydration NotFound risk from this function', () => {
    const win = fakeWindow('/resources/faq', '', '');
    expect(runBootRedirect(win)).toBe(false);
  });
});

describe('runBootRedirect: 26. no redirect loop', () => {
  it('the href it would replace() to is itself a no-op on a second pass', () => {
    const win = fakeWindow('/', '?lang=fr', '');
    runBootRedirect(win);
    const targetHref = win.location.replace.mock.calls[0][0];
    const [pathname, search = ''] = targetHref.split('?');
    const win2 = fakeWindow(pathname, search ? `?${search}` : '', '');
    expect(runBootRedirect(win2)).toBe(false);
  });

  it('/fr/fr/ is never produced from a single legacy or trailing-slash input', () => {
    const win = fakeWindow('/fr/courses/ijazah', '?lang=fr', '');
    runBootRedirect(win);
    const targetHref = win.location.replace.mock.calls[0][0];
    expect(targetHref).not.toContain('/fr/fr');
  });
});
