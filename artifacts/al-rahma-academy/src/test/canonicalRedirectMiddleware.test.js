import { describe, it, expect, vi } from 'vitest';
import { canonicalRedirectMiddleware } from '../utils/canonicalRedirectMiddleware.js';

// Part 12 of the Content Truth Contract task: the prior test suite
// (canonicalRedirectDecision.test.js) only covers the pure decision
// function. This file exercises the actual Node/Vite middleware — the
// req/res wiring (statusCode, Location header, end(), next()) that
// vite.config.ts's dev/preview server plugin installs — using mock
// req/res objects, so the HTTP-level behavior is proven directly rather
// than only inferred from the decision function it delegates to.

function mockReqRes({ method = 'GET', url }) {
  const req = { method, url };
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn((name, value) => { headers[name] = value; }),
    end: vi.fn(),
    _headers: headers,
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('canonicalRedirectMiddleware', () => {
  it('issues a 308 redirect with a Location header for a non-canonical GET', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/?lang=fr' });
    canonicalRedirectMiddleware(req, res, next);
    expect(res.statusCode).toBe(308);
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/fr/');
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('issues the identical 308 redirect for a non-canonical HEAD', () => {
    const { req, res, next } = mockReqRes({ method: 'HEAD', url: '/?lang=fr' });
    canonicalRedirectMiddleware(req, res, next);
    expect(res.statusCode).toBe(308);
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/fr/');
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() exactly once and never touches res for an already-canonical GET', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/fr/courses/ijazah' });
    canonicalRedirectMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'never redirects a %s request, even for an otherwise non-canonical URL',
    (method) => {
      const { req, res, next } = mockReqRes({ method, url: '/?lang=fr' });
      canonicalRedirectMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.end).not.toHaveBeenCalled();
    },
  );

  it('excludes API paths from redirection', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/api/healthz?lang=fr' });
    canonicalRedirectMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('excludes asset paths from redirection', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/favicon.svg?lang=fr' });
    canonicalRedirectMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('preserves unrelated query parameters when redirecting', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/courses?lang=fr&foo=bar' });
    canonicalRedirectMiddleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/fr/courses?foo=bar');
    expect(next).not.toHaveBeenCalled();
  });

  it('strips an invalid/unsupported lang value without inventing a prefix', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/?lang=xx' });
    canonicalRedirectMiddleware(req, res, next);
    // lang=xx is not a recognized language, so no prefix is added — but the
    // invalid query param is still stripped, which is itself a redirect.
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/');
    expect(next).not.toHaveBeenCalled();
  });

  it('an existing path prefix always wins over a conflicting query lang', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/fr/courses?lang=it' });
    canonicalRedirectMiddleware(req, res, next);
    // Path prefix (fr) wins; the conflicting query lang (it) is dropped,
    // never used to override or duplicate the existing prefix.
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/fr/courses');
    expect(next).not.toHaveBeenCalled();
  });

  it('fails safe (calls next()) when the URL cannot be parsed, instead of throwing', () => {
    const { res, next } = mockReqRes({ method: 'GET', url: '/x' });
    const req = {
      method: 'GET',
      // A value whose coercion to string throws inside `new URL()`,
      // simulating a malformed-URL parse failure deterministically.
      url: { toString() { throw new Error('malformed'); } },
    };
    expect(() => canonicalRedirectMiddleware(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('never calls next() after end() has been called', () => {
    const { req, res, next } = mockReqRes({ method: 'GET', url: '/?lang=fr' });
    res.end.mockImplementation(() => {
      expect(next).not.toHaveBeenCalled();
    });
    canonicalRedirectMiddleware(req, res, next);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
