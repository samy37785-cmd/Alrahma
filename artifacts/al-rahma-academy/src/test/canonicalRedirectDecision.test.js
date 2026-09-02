import { describe, it, expect } from 'vitest';
import { computeCanonicalRedirect } from '../utils/canonicalRedirectDecision';

// Integration review finding (docs/stage1-trust-integration-review.md):
// vite.config.ts's canonical-redirect middleware previously had no method
// guard at all - it would have issued a 308 for a non-canonical path
// regardless of HTTP method. computeCanonicalRedirect() closes that gap.
describe('computeCanonicalRedirect', () => {
  it('never redirects a non-GET/HEAD method, even for an otherwise-non-canonical URL', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(
        computeCanonicalRedirect({ method, pathname: '/', search: '?lang=fr' }),
      ).toBeNull();
    }
  });

  it('redirects GET and HEAD identically for the same non-canonical URL', () => {
    const get = computeCanonicalRedirect({ method: 'GET', pathname: '/', search: '?lang=fr' });
    const head = computeCanonicalRedirect({ method: 'HEAD', pathname: '/', search: '?lang=fr' });
    expect(get).toEqual({ pathname: '/fr/', search: '' });
    expect(head).toEqual({ pathname: '/fr/', search: '' });
  });

  it('still excludes asset and API paths for GET', () => {
    expect(computeCanonicalRedirect({ method: 'GET', pathname: '/api/healthz', search: '?lang=fr' })).toBeNull();
    expect(computeCanonicalRedirect({ method: 'GET', pathname: '/favicon.svg', search: '?lang=fr' })).toBeNull();
  });

  it('returns null for an already-canonical GET request', () => {
    expect(computeCanonicalRedirect({ method: 'GET', pathname: '/fr/courses/ijazah', search: '' })).toBeNull();
  });
});
