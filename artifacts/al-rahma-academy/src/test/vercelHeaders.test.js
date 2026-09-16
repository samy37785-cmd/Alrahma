// Auth hardening security batch (item 7) — contract tests for the Vercel
// security headers added in the repo-root vercel.json. Guards two failure
// directions: the headers silently regressing/disappearing in a future edit,
// and the CSP silently breaking GA/Clarity/Tawk.to (the app's only real
// third-party script/connect surface — see src/components/Analytics.jsx,
// src/components/LiveChat.jsx) by dropping one of their required origins.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..'); // artifacts/al-rahma-academy
const REPO_ROOT = path.resolve(ROOT, '..', '..');

const vercelConfig = JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));

describe('vercel.json — security headers', () => {
  it('parses as valid JSON with a headers array', () => {
    expect(Array.isArray(vercelConfig.headers)).toBe(true);
    expect(vercelConfig.headers.length).toBeGreaterThan(0);
  });

  const rule = vercelConfig.headers.find((h) => h.source === '/(.*)');

  it('has a catch-all rule applying to every route', () => {
    expect(rule).toBeTruthy();
  });

  function headerValue(key) {
    return rule.headers.find((h) => h.key === key)?.value;
  }

  it('sets X-Content-Type-Options: nosniff', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', () => {
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-Frame-Options: DENY', () => {
    expect(headerValue('X-Frame-Options')).toBe('DENY');
  });

  it('sets a real, long-lived Strict-Transport-Security header', () => {
    const hsts = headerValue('Strict-Transport-Security');
    expect(hsts).toMatch(/max-age=\d+/);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it('sets a Permissions-Policy that scopes camera/microphone to self and denies geolocation/payment', () => {
    const pp = headerValue('Permissions-Policy');
    expect(pp).toMatch(/camera=\(self\)/);
    expect(pp).toMatch(/microphone=\(self\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
    expect(pp).toMatch(/payment=\(\)/);
  });

  describe('Content-Security-Policy', () => {
    const csp = headerValue('Content-Security-Policy');

    it('is present and defaults to self', () => {
      expect(csp).toBeTruthy();
      expect(csp).toMatch(/default-src 'self'/);
    });

    it('allows Google Analytics/Tag Manager (script + connect) — regression guard for Analytics.jsx', () => {
      expect(csp).toMatch(/script-src[^;]*googletagmanager\.com/);
      expect(csp).toMatch(/connect-src[^;]*google-analytics\.com/);
    });

    it('allows Microsoft Clarity (script + connect) — regression guard for Analytics.jsx', () => {
      expect(csp).toMatch(/script-src[^;]*clarity\.ms/);
      expect(csp).toMatch(/connect-src[^;]*clarity\.ms/);
    });

    it('allows Tawk.to live chat (script + connect, including websocket) — regression guard for LiveChat.jsx', () => {
      expect(csp).toMatch(/script-src[^;]*embed\.tawk\.to/);
      expect(csp).toMatch(/connect-src[^;]*tawk\.to/);
      expect(csp).toMatch(/wss:\/\/\*\.tawk\.to/);
    });

    it('allows the Sentry ingest origins (connect-src) — regression guard for utils/sentry.js\'s VITE_SENTRY_DSN usage', () => {
      // src/utils/sentry.js genuinely calls Sentry.init({ dsn: VITE_SENTRY_DSN,
      // ... }) when the env var is set — this isn't unused/dead config, so the
      // CSP must allow reaching it. The exact ingest subdomain is only known
      // at runtime (it's derived from the org's DSN, an env var not committed
      // to the repo), so this allows Sentry's documented ingest domain
      // patterns rather than a specific org subdomain — narrower than a
      // blanket https:, but still covers whichever real DSN is configured.
      expect(readFileSync(path.join(ROOT, 'src/utils/sentry.js'), 'utf8')).toMatch(/VITE_SENTRY_DSN/);
      expect(csp).toMatch(/connect-src[^;]*\*\.ingest\.sentry\.io/);
      expect(csp).toMatch(/connect-src[^;]*\*\.ingest\.us\.sentry\.io/);
      expect(csp).toMatch(/connect-src[^;]*\*\.ingest\.de\.sentry\.io/);
    });

    it('allows a blob: worker (worker-src) — required for Sentry Replay\'s compression worker, which the DSN check above confirms is configured', () => {
      expect(csp).toMatch(/worker-src 'self' blob:/);
    });

    it('allows framing any https: origin (provider-agnostic live-class links) but blocks non-https frame sources', () => {
      expect(csp).toMatch(/frame-src 'self' https:/);
    });

    it('denies this site being framed by anyone (frame-ancestors none)', () => {
      expect(csp).toMatch(/frame-ancestors 'none'/);
    });

    it('restricts base-uri and form-action to self', () => {
      expect(csp).toMatch(/base-uri 'self'/);
      expect(csp).toMatch(/form-action 'self'/);
    });

    it('allows inline styles (style={{...}} is used throughout the app)', () => {
      expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    });
  });
});
