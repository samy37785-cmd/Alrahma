import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import {
  SPA_SHELL_FILE, NOT_FOUND_FILE, NOT_FOUND_ROBOTS, buildSpaShell, buildNotFoundPage,
} from '../../scripts/spaShell.mjs';
import { LANGS } from '../i18n/index.js';
import { builtDistReady } from './utils/builtDist';

// URLs without a prerendered file (see scripts/spaShell.mjs):
//   - a real App.jsx route  -> vercel.json rewrites it to spa-shell.html
//     (not Home: no Home canonical/hreflang; robots left indexable, because
//     useSEO() writes the page's own metadata once React renders);
//   - anything else          -> no rewrite matches, Vercel serves 404.html
//     with HTTP 404 (noindex).
// The HTTP status itself can only be observed on a real Vercel deployment;
// these tests pin the two inputs that decide it: which paths the rewrite
// matches, and what the two fallback files contain.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
const sourceIndex = readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJsx = readFileSync(path.join(appRoot, 'src', 'App.jsx'), 'utf8');
const distDir = path.join(appRoot, 'dist', 'public');
const distExists = builtDistReady('spaShell');
const vercelConfig = JSON.parse(readFileSync(path.resolve(appRoot, '../../vercel.json'), 'utf8'));

const doc = (html) => new JSDOM(html).window.document;
const scriptSrcs = (d) => [...d.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
const robotsOf = (d) => d.querySelector('meta[name="robots"]')?.getAttribute('content');

// ── Fallback documents ───────────────────────────────────────────────────

describe('spa-shell.html / 404.html builders (source index.html)', () => {
  it('the source index.html starts with the Home canonical, hreflang and index robots', () => {
    const d = doc(sourceIndex);
    expect(d.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://al-rahmaacademy.com/');
    expect(d.querySelectorAll('link[hreflang]').length).toBeGreaterThan(0);
    expect(robotsOf(d)).toMatch(/^index/);
  });

  it('spa shell (real routes): no Home canonical or hreflang, and NOT noindex', () => {
    const d = doc(buildSpaShell(sourceIndex));
    expect(d.querySelector('link[rel="canonical"]')).toBeNull();
    expect(d.querySelectorAll('link[hreflang]').length).toBe(0);
    expect(robotsOf(d)).toMatch(/^index/);
    expect(robotsOf(d)).not.toMatch(/noindex/);
  });

  it('404 page (unknown URLs): same shell, robots noindex', () => {
    const d = doc(buildNotFoundPage(sourceIndex));
    expect(d.querySelector('link[rel="canonical"]')).toBeNull();
    expect(d.querySelectorAll('link[hreflang]').length).toBe(0);
    const robots = [...d.querySelectorAll('meta[name="robots"]')];
    expect(robots.length).toBe(1);
    expect(robots[0].getAttribute('content')).toBe(NOT_FOUND_ROBOTS);
    expect(NOT_FOUND_ROBOTS).toMatch(/^noindex/);
  });

  it('both keep the title, scripts, stylesheets and #root, so the app boots as before', () => {
    const before = doc(sourceIndex);
    for (const html of [buildSpaShell(sourceIndex), buildNotFoundPage(sourceIndex)]) {
      const after = doc(html);
      expect(after.title).toBe(before.title);
      expect(scriptSrcs(after)).toEqual(scriptSrcs(before));
      expect(after.querySelectorAll('link[rel="stylesheet"]').length)
        .toBe(before.querySelectorAll('link[rel="stylesheet"]').length);
      expect(after.getElementById('root')).not.toBeNull();
    }
  });

  it('404 page adds robots when the input has none; both reject non-HTML input', () => {
    expect(robotsOf(doc(buildNotFoundPage('<html><head><title>x</title></head><body></body></html>')))).toBe(NOT_FOUND_ROBOTS);
    for (const build of [buildSpaShell, buildNotFoundPage]) {
      expect(() => build('')).toThrow();
      expect(() => build(null)).toThrow();
    }
  });
});

// ── vercel.json routing ──────────────────────────────────────────────────

// The SPA rule is `/:path(<pattern>)`. Vercel compiles it with
// path-to-regexp (strict: false, sensitive: false): the pattern must match
// the whole path, an optional trailing slash is allowed, case-insensitive.
// (Checked against path-to-regexp@6.1.0 itself while writing this PR.)
const spaRule = vercelConfig.rewrites.find((r) => r.destination === `/${SPA_SHELL_FILE}`);
const pattern = spaRule?.source.match(/^\/:path\((.*)\)$/)?.[1];
const spaMatcher = pattern ? new RegExp(`^/(?:${pattern})/?$`, 'i') : null;
const routedToShell = (p) => !!spaMatcher && spaMatcher.test(p);

const appRoutePaths = [...appJsx.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const LOCALE_PREFIXES = ['', ...LANGS.filter((l) => l !== 'en').map((l) => `/${l}`)];
const sample = (routePath) => routePath.replace(/:[A-Za-z]+/g, 'sample-1');

describe('vercel.json SPA rewrite', () => {
  it('exists, targets spa-shell.html, and is the only rule that does', () => {
    expect(spaRule).toBeTruthy();
    expect(spaMatcher).toBeTruthy();
    expect(vercelConfig.rewrites.filter((r) => r.destination === `/${SPA_SHELL_FILE}`).length).toBe(1);
    expect(vercelConfig.rewrites.some((r) => r.destination === '/index.html')).toBe(false);
  });

  it('App.jsx still defines the routes this test walks', () => {
    expect(appRoutePaths.length).toBeGreaterThan(50);
    expect(appRoutePaths).toContain('*');
  });

  it('matches every real App.jsx route, unprefixed and under every locale prefix, with and without a trailing slash', () => {
    const missing = [];
    for (const routePath of appRoutePaths) {
      if (routePath === '*' || routePath === '/') continue;
      for (const prefix of LOCALE_PREFIXES) {
        for (const p of [`${prefix}${sample(routePath)}`, `${prefix}${sample(routePath)}/`]) {
          if (!routedToShell(p)) missing.push(p);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('matches every locale root that has no prerendered file of its own', () => {
    for (const prefix of LOCALE_PREFIXES.filter(Boolean)) {
      expect(routedToShell(prefix)).toBe(true);
      expect(routedToShell(`${prefix}/`)).toBe(true);
    }
  });

  it('the pages this fix is about are real routes (shell, not 404)', () => {
    for (const p of [
      '/resources/blog', '/enroll', '/ar/enroll',
      '/tools/prayer-times', '/ar/tools/prayer-times',
      '/tools/quran-reader', '/ar/tools/quran-reader',
      '/tools/hadith', '/ar/tools/hadith',
      '/tools/verse-of-the-day', '/ar/tools/verse-of-the-day',
    ]) expect(routedToShell(p), p).toBe(true);
  });

  it('does NOT match unknown URLs, so Vercel answers them with 404.html and HTTP 404', () => {
    for (const p of [
      '/this-page-does-not-exist-xyz', '/ar/garbage', '/xx/courses', '/tools/nonexistent',
      '/courses/quran/extra', '/academy/teachers/1/extra', '/resources/blog/a/b',
      '/admin/anything', '/enrollx', '/wp-login.php', '/.env', '/index.php',
    ]) expect(routedToShell(p), p).toBe(false);
  });

  it('never captures API paths (they stay with the earlier API rewrites)', () => {
    for (const p of ['/api/healthz', '/api/v1/admin/users', '/api/trials']) expect(routedToShell(p), p).toBe(false);
  });
});

// ── Built output ─────────────────────────────────────────────────────────

describe.skipIf(!distExists)('fallback files in dist/public — post-build only', () => {
  const read = (f) => doc(readFileSync(path.join(distDir, f), 'utf8'));

  it('spa-shell.html and 404.html exist next to the prerendered pages', () => {
    expect(existsSync(path.join(distDir, SPA_SHELL_FILE))).toBe(true);
    expect(existsSync(path.join(distDir, NOT_FOUND_FILE))).toBe(true);
  });

  it('spa-shell.html: no canonical, no hreflang, not noindex', () => {
    const d = read(SPA_SHELL_FILE);
    expect(d.querySelector('link[rel="canonical"]')).toBeNull();
    expect(d.querySelectorAll('link[hreflang]').length).toBe(0);
    expect(robotsOf(d)).not.toMatch(/noindex/);
  });

  it('404.html: noindex, no canonical, no hreflang', () => {
    const d = read(NOT_FOUND_FILE);
    expect(robotsOf(d)).toBe(NOT_FOUND_ROBOTS);
    expect(d.querySelector('link[rel="canonical"]')).toBeNull();
    expect(d.querySelectorAll('link[hreflang]').length).toBe(0);
  });

  it('both are the pre-render shell (no Home content) and boot the same bundle as Home', () => {
    const home = read('index.html');
    const homeModule = scriptSrcs(home).find((src) => /\/assets\/.+\.js$/.test(src));
    expect(homeModule).toBeTruthy();
    for (const f of [SPA_SHELL_FILE, NOT_FOUND_FILE]) {
      const d = read(f);
      expect(d.querySelector('#main-content'), f).toBeNull();
      expect(d.querySelector('h1'), f).toBeNull();
      expect(scriptSrcs(d), f).toContain(homeModule);
    }
  });

  it('prerendered Home (index.html) keeps its own canonical and index robots', () => {
    const home = read('index.html');
    expect(home.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://al-rahmaacademy.com/');
    expect(robotsOf(home)).toMatch(/^index/);
  });
});
