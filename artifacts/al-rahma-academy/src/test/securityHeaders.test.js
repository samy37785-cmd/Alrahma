import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Audit AR-05 (item 40): the frontend sent only HSTS. vercel.json now adds four
// headers to every page and static file. /api is left out: Vercel rewrites it to
// the Render backend (and the admin proxy function), whose own headers belong to
// the backend.
//
// The CSP is limited to directives that cannot block anything the app loads:
// frame-ancestors, object-src and base-uri. A full script/connect policy needs
// a reviewed allowlist (GA4, Tawk.to, AlAdhan, Quran.com, Render) of its own.
//
// No Permissions-Policy: the student dashboard opens live classes in an iframe
// that needs camera, microphone and display-capture (UpcomingClassCard.jsx), and
// prayer times / Qibla use geolocation, so a restrictive policy would break them.

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfig = JSON.parse(readFileSync(path.resolve(appRoot, '../../vercel.json'), 'utf8'));
const rules = vercelConfig.headers || [];
const securityRule = rules.find((r) => r.headers.some((h) => h.key === 'X-Content-Type-Options'));
const pattern = securityRule?.source.match(/^\/\((.*)\)$/)?.[1];
const matcher = pattern ? new RegExp(`^/(?:${pattern})$`, 'i') : null;
const covered = (p) => !!matcher && matcher.test(p);

describe('vercel.json: site-wide security headers', () => {
  it('has exactly one security header rule with exactly these four headers', () => {
    expect(rules.filter((r) => r.headers.some((h) => h.key === 'X-Content-Type-Options'))).toHaveLength(1);
    expect(securityRule.headers).toEqual([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ]);
    expect(matcher).toBeTruthy();
  });

  it('covers every page and static file, with or without a trailing slash, in every locale', () => {
    for (const p of [
      '/', '/it', '/it/', '/ar/', '/courses/quran', '/courses/quran/', '/fr/tools/quran-reader', '/it/tools/prayer-times/',
      '/enroll', '/login', '/dashboard', '/resources/blog', '/sitemap.xml', '/robots.txt', '/llms.txt', '/404.html',
      '/assets/index-abc123.js', '/assets/index-abc123.css', '/favicon.ico', '/apiary', '/tools/api-free',
    ]) {
      expect(covered(p), p).toBe(true);
    }
  });

  it('leaves /api (Render backend and the admin proxy) alone', () => {
    for (const p of ['/api', '/api/', '/api/v1/courses', '/api/v1/admin', '/api/v1/admin/users', '/api/v1/admin-proxy', '/api/healthz']) {
      expect(covered(p), p).toBe(false);
    }
  });

  it('sends no Permissions-Policy, which would block the live-class iframe camera and microphone', () => {
    for (const r of rules) expect(r.headers.map((h) => h.key), r.source).not.toContain('Permissions-Policy');
  });
});
