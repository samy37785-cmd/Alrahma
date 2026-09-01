import { describe, it, expect } from 'vitest';
import { computeCanonicalUrl, formatCanonicalHref } from '../utils/urlCanonicalize';

// Stage 1 URL Closure (see docs/localization-audit.md): computeCanonicalUrl()
// is the single source of truth shared by the Vite dev/preview server
// middleware (vite.config.ts) and the pre-mount browser runtime fallback
// (utils/bootRedirect.js). This file proves the full example table from
// the task spec, plus every edge case the two callers depend on.

describe('computeCanonicalUrl: legacy ?lang= migration', () => {
  it('1. legacy query on root: /?lang=fr -> /fr/', () => {
    expect(computeCanonicalUrl({ pathname: '/', search: '?lang=fr' }))
      .toEqual({ pathname: '/fr/', search: '' });
  });

  it('2. legacy query on a deep route: /courses/ijazah?lang=ar -> /ar/courses/ijazah', () => {
    expect(computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?lang=ar' }))
      .toEqual({ pathname: '/ar/courses/ijazah', search: '' });
  });

  it('3. preserves every other query parameter, only lang is removed', () => {
    expect(computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?lang=ar&foo=bar' }))
      .toEqual({ pathname: '/ar/courses/ijazah', search: '?foo=bar' });
  });

  it('5. path prefix wins over a conflicting query lang (path is source of truth)', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/courses/ijazah', search: '?lang=de&foo=bar' }))
      .toEqual({ pathname: '/fr/courses/ijazah', search: '?foo=bar' });
  });

  it('6. an unsupported lang value never invents a prefix, and is still stripped', () => {
    expect(computeCanonicalUrl({ pathname: '/', search: '?lang=xx' }))
      .toEqual({ pathname: '/', search: '' });
  });

  it('6b. an unsupported lang value under an existing prefix is dropped, prefix untouched', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/courses/ijazah', search: '?lang=invalid&foo=bar' }))
      .toEqual({ pathname: '/fr/courses/ijazah', search: '?foo=bar' });
  });

  it('7. null/missing lang: no lang param at all -> untouched (no redirect)', () => {
    expect(computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?foo=bar' })).toBeNull();
  });

  it('8. lang=en on an unprefixed path: stays unprefixed, lang stripped', () => {
    expect(computeCanonicalUrl({ pathname: '/', search: '?lang=en' }))
      .toEqual({ pathname: '/', search: '' });
  });

  it('does not invent a prefix for an empty lang value', () => {
    expect(computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?lang=&foo=bar' }))
      .toEqual({ pathname: '/courses/ijazah', search: '?foo=bar' });
  });
});

describe('computeCanonicalUrl: trailing-slash policy', () => {
  it('9. language root gets a trailing slash: /fr -> /fr/', () => {
    expect(computeCanonicalUrl({ pathname: '/fr', search: '' }))
      .toEqual({ pathname: '/fr/', search: '' });
  });

  it('10. internal path loses a trailing slash: /courses/ -> /courses', () => {
    expect(computeCanonicalUrl({ pathname: '/courses/', search: '' }))
      .toEqual({ pathname: '/courses', search: '' });
  });

  it('an internal path under a locale loses its trailing slash, prefix kept: /fr/resources/faq/ -> /fr/resources/faq', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/resources/faq/', search: '' }))
      .toEqual({ pathname: '/fr/resources/faq', search: '' });
  });

  it('never touches "/" - already canonical', () => {
    expect(computeCanonicalUrl({ pathname: '/', search: '' })).toBeNull();
  });

  it('never touches "/fr/" - already canonical', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/', search: '' })).toBeNull();
  });

  it('every supported language root gets the same trailing-slash treatment', () => {
    for (const lang of ['fr', 'it', 'ar', 'es', 'de']) {
      expect(computeCanonicalUrl({ pathname: `/${lang}`, search: '' }))
        .toEqual({ pathname: `/${lang}/`, search: '' });
    }
  });
});

describe('computeCanonicalUrl: combined legacy-lang + trailing-slash in one redirect', () => {
  it('12. FR -> IT is not a case this function handles (language switch is a real navigation) - but the prefix, once present, round-trips unchanged', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/courses/ijazah', search: '' })).toBeNull();
    expect(computeCanonicalUrl({ pathname: '/it/courses/ijazah', search: '' })).toBeNull();
  });

  it('a legacy ?lang= AND a missing trailing slash on the root resolve in exactly one output', () => {
    // ?lang=fr on the bare root already implies the canonical "/fr/" (with
    // its trailing slash) in a single pass - not a redirect chain.
    expect(computeCanonicalUrl({ pathname: '/', search: '?lang=fr' }))
      .toEqual({ pathname: '/fr/', search: '' });
  });
});

describe('computeCanonicalUrl: no double-prefixing', () => {
  it('14. a path already carrying its own prefix is never prefixed again', () => {
    expect(computeCanonicalUrl({ pathname: '/fr/courses/ijazah', search: '?lang=fr' }))
      .toEqual({ pathname: '/fr/courses/ijazah', search: '' });
  });

  it('is idempotent: re-running on its own output is always a no-op', () => {
    const first = computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?lang=ar&foo=bar' });
    expect(first).not.toBeNull();
    expect(computeCanonicalUrl({ pathname: first.pathname, search: first.search })).toBeNull();
  });
});

describe('computeCanonicalUrl: 27/28. assets, API paths, and query preservation', () => {
  // The utility itself has no asset/API notion (that guard lives in the
  // server middleware, see vite.config.ts) - but proves query preservation
  // holds even for a path shaped like a real asset request.
  it('28. preserves query parameters through a redirect unrelated to them', () => {
    const result = computeCanonicalUrl({ pathname: '/resources/faq/', search: '?utm_source=x&utm_campaign=y' });
    expect(result).toEqual({ pathname: '/resources/faq', search: '?utm_source=x&utm_campaign=y' });
  });
});

describe('formatCanonicalHref: hash preservation (runtime-only concern)', () => {
  it('4. reassembles pathname + search + hash exactly, hash from the ORIGINAL request untouched', () => {
    const canonical = computeCanonicalUrl({ pathname: '/courses/ijazah', search: '?lang=ar&foo=bar' });
    expect(formatCanonicalHref(canonical, '#lesson')).toBe('/ar/courses/ijazah?foo=bar#lesson');
  });

  it('preserves hash through the prefix-conflict example with the full given hash', () => {
    const canonical = computeCanonicalUrl({ pathname: '/fr/courses/ijazah', search: '?lang=de&foo=bar' });
    expect(formatCanonicalHref(canonical, '#lesson')).toBe('/fr/courses/ijazah?foo=bar#lesson');
  });

  it('an empty hash produces no trailing "#"', () => {
    const canonical = computeCanonicalUrl({ pathname: '/', search: '?lang=fr' });
    expect(formatCanonicalHref(canonical, '')).toBe('/fr/');
  });
});
