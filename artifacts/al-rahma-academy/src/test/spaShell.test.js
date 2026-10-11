import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { SPA_SHELL_FILE, SPA_SHELL_ROBOTS, buildSpaShell } from '../../scripts/spaShell.mjs';

// The SPA fallback shell served by vercel.json's catch-all rewrite for every
// URL without a prerendered file (see scripts/spaShell.mjs). It must never
// claim to be Home: no Home canonical, no Home hreflang, and noindex, so an
// unknown or not-yet-prerendered URL is no longer a duplicate of Home.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
const sourceIndex = readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const distDir = path.join(appRoot, 'dist', 'public');
const distExists = existsSync(distDir);
const vercelConfig = JSON.parse(readFileSync(path.resolve(appRoot, '../../vercel.json'), 'utf8'));

const head = (html) => new JSDOM(html).window.document;
const scriptSrcs = (doc) => [...doc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));

describe('buildSpaShell (source index.html)', () => {
  it('the source index.html still carries the Home canonical, hreflang and index robots it starts from', () => {
    const doc = head(sourceIndex);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://al-rahmaacademy.com/');
    expect(doc.querySelectorAll('link[hreflang]').length).toBeGreaterThan(0);
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/^index/);
  });

  it('removes the Home canonical and every hreflang link, and sets robots to noindex', () => {
    const doc = head(buildSpaShell(sourceIndex));
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
    expect(doc.querySelectorAll('link[hreflang]').length).toBe(0);
    const robots = [...doc.querySelectorAll('meta[name="robots"]')];
    expect(robots.length).toBe(1);
    expect(robots[0].getAttribute('content')).toBe(SPA_SHELL_ROBOTS);
    expect(SPA_SHELL_ROBOTS).toMatch(/^noindex/);
  });

  it('leaves the title, scripts, stylesheets and app root untouched', () => {
    const before = head(sourceIndex);
    const after = head(buildSpaShell(sourceIndex));
    expect(after.title).toBe(before.title);
    expect(scriptSrcs(after)).toEqual(scriptSrcs(before));
    expect([...after.querySelectorAll('link[rel="stylesheet"]')].length)
      .toBe([...before.querySelectorAll('link[rel="stylesheet"]')].length);
    expect(after.getElementById('root')).not.toBeNull();
  });

  it('adds a robots tag when the input has none, and rejects input that is not an HTML document', () => {
    const doc = head(buildSpaShell('<html><head><title>x</title></head><body></body></html>'));
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(SPA_SHELL_ROBOTS);
    expect(() => buildSpaShell('')).toThrow();
    expect(() => buildSpaShell(null)).toThrow();
  });
});

describe('vercel.json SPA fallback', () => {
  it('serves the shell file for every non-API, non-file URL', () => {
    const rule = vercelConfig.rewrites.find((r) => r.source === '/((?!api/|.*\\..*).*)');
    expect(rule?.destination).toBe(`/${SPA_SHELL_FILE}`);
  });
});

describe.skipIf(!distExists)('SPA shell output (dist/public) — post-build only', () => {
  const shellPath = path.join(distDir, SPA_SHELL_FILE);

  it('spa-shell.html exists next to the prerendered pages', () => {
    expect(existsSync(shellPath), `missing ${shellPath}`).toBe(true);
  });

  it('is noindex, has no canonical and no hreflang', () => {
    const doc = head(readFileSync(shellPath, 'utf8'));
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(SPA_SHELL_ROBOTS);
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
    expect(doc.querySelectorAll('link[hreflang]').length).toBe(0);
  });

  it('is the pre-render shell, not prerendered Home content, and boots the same app bundle as Home', () => {
    const shell = head(readFileSync(shellPath, 'utf8'));
    const home = head(readFileSync(path.join(distDir, 'index.html'), 'utf8'));
    expect(shell.querySelector('#main-content')).toBeNull();
    expect(shell.querySelector('h1')).toBeNull();
    const homeModule = scriptSrcs(home).find((src) => /\/assets\/.+\.js$/.test(src));
    expect(homeModule, 'Home should load a built /assets/*.js module').toBeTruthy();
    expect(scriptSrcs(shell)).toContain(homeModule);
  });

  it('prerendered Home (index.html) keeps its own canonical and index robots', () => {
    const home = head(readFileSync(path.join(distDir, 'index.html'), 'utf8'));
    expect(home.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://al-rahmaacademy.com/');
    expect(home.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/^index/);
  });
});
