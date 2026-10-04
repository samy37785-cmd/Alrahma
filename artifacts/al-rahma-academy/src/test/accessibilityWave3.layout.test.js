// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromiumOrSkip } from './utils/launchChromium';

// Accessibility Wave 3 (real-browser half). Unlike Waves 1-2 this runs against
// the BUILT site (dist/public, served locally), because the targets live in
// Home sections that only mount after the visitor scrolls. For each language
// and width it hydrates the prerendered Home, scrolls until every lazy section
// has mounted, then runs axe-core on the five target elements and measures
// contrast, names, focus and overflow. Needs `pnpm run build` first; the CI
// step that runs it comes after the build. Network access outside the local
// server is blocked, so no analytics, fonts or APIs are contacted.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DIST = path.resolve(__dirname, '../../dist/public');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const browser = await launchChromiumOrSkip('accessibilityWave3.layout');
const hasDist = fs.existsSync(path.join(DIST, 'index.html'));
if (browser && !hasDist && process.env.REQUIRE_CHROMIUM === '1') {
  throw new Error('accessibilityWave3.layout needs dist/public: run `pnpm run build` before this step');
}
if (browser && !hasDist) console.warn('[accessibilityWave3.layout] dist/public missing, layout tests skipped (run pnpm run build)');
const run = browser && hasDist;
const describeBuilt = run ? describe : describe.skip;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };
let server; let base;
beforeAll(async () => {
  if (!run) return;
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(DIST, url);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      if (url.startsWith('/api/') || path.extname(url)) { res.writeHead(404); res.end(); return; }
      file = path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await browser?.close(); await new Promise((r) => (server ? server.close(r) : r())); });

const LOCALES = [
  { lang: 'en', url: '/', dir: 'ltr' },
  { lang: 'ar', url: '/ar/', dir: 'rtl' },
  { lang: 'fr', url: '/fr/', dir: 'ltr' },
  { lang: 'it', url: '/it/', dir: 'ltr' },
];
const TARGETS = ['.tc3__avatar-col', '.trust-bar__wa', '.course-row__popular', '.section-head .eyebrow', '.nav__mobile-search'];
const RULES = ['aria-prohibited-attr', 'color-contrast', 'label-content-name-mismatch'];

async function openHome(url, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, deviceScaleFactor: width < 500 ? 2 : 1 });
  await ctx.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/hydrat/i.test(m.text())) errors.push(m.text()); });
  await page.goto(base + url, { waitUntil: 'networkidle' });
  // Scroll step by step until every lazy (DeferredSection) block has mounted:
  // each block loads its chunk only when it nears the viewport, so the page
  // keeps growing; stop when the target sections exist and the bottom is stable.
  const NEEDED = ['.tc3__card', '.trust-bar__wa', '.course-row__popular', '.features', '.steps', '#faq'];
  const deadline = Date.now() + 45000;
  let lastHeight = 0; let stable = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate((needed) => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      return {
        height: document.body.scrollHeight,
        atBottom: window.scrollY + window.innerHeight >= document.body.scrollHeight - 2,
        missing: needed.filter((s) => !document.querySelector(s)),
      };
    }, NEEDED);
    await page.waitForTimeout(250);
    if (state.atBottom && state.missing.length === 0 && state.height === lastHeight) { stable += 1; if (stable >= 3) break; } else stable = 0;
    lastHeight = state.height;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  return { page, errors, close: () => ctx.close() };
}

const axe = async (page, include) => {
  await page.evaluate(AXE);
  return page.evaluate(async ({ include: inc, rules }) => {
    const present = inc.filter((s) => document.querySelector(s));
    if (!present.length) return [];
    const res = await window.axe.run({ include: present.map((s) => [s]) }, { runOnly: rules });
    return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  }, { include, rules: RULES });
};

const toLin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
// Text colour and the first opaque background behind it.
const colours = (page, sel) => page.$$eval(sel, (els) => els.map((el) => {
  let bg = null;
  for (let n = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
  }
  const r = el.getBoundingClientRect();
  return { fg: getComputedStyle(el).color, bg: bg || 'rgb(255, 255, 255)', text: el.textContent.trim(), clipped: el.scrollWidth > el.clientWidth + 1, visible: r.width > 0 && r.height > 0 };
}));

describeBuilt('Wave 3 targets on the built Home, after every lazy section has mounted', () => {
  for (const { lang, url, dir } of LOCALES) {
    for (const width of [1440, 390]) {
      it(`${lang} @${width}px: lazy sections mounted; axe finds 0 violations on the five targets; contrast >= 4.5 in light and dark; no overflow`, async () => {
        const { page, errors, close } = await openHome(url, width);
        expect(await page.evaluate(() => document.documentElement.dir || 'ltr')).toBe(dir);
        // 1. The lazy sections really mounted.
        const mounted = await page.evaluate(() => ({
          cards: document.querySelectorAll('.tc3__card').length,
          badges: document.querySelectorAll('.tc3__verified').length,
          wa: !!document.querySelector('.trust-bar__wa'),
          popular: !!document.querySelector('.course-row__popular'),
          eyebrows: document.querySelectorAll('.section-head .eyebrow').length,
          features: !!document.querySelector('.features'),
          steps: !!document.querySelector('.steps'),
        }));
        expect(mounted.cards, JSON.stringify(mounted)).toBeGreaterThan(0);
        expect(mounted.badges).toBeGreaterThan(0);
        expect(mounted.wa && mounted.popular && mounted.features && mounted.steps).toBe(true);
        expect(mounted.eyebrows).toBeGreaterThanOrEqual(3);

        // 2. axe on the targets (light theme).
        expect(await axe(page, TARGETS)).toEqual([]);

        // 3. Contrast, light then dark, measured from computed colours.
        for (const theme of ['light', 'dark']) {
          if (theme === 'dark') {
            // The same class ThemeContext toggles; wait out the page's background transition.
            await page.evaluate(() => document.documentElement.classList.add('dark'));
            await page.waitForTimeout(1200);
          }
          // The Isnad eyebrow sits on a dark layer that is not an ancestor background,
          // so it cannot be measured this way; it is not a target (axe still runs on it).
          for (const sel of ['.course-row__popular', '.section-head:not(.isnad__head) .eyebrow']) {
            for (const c of await colours(page, sel)) {
              if (!c.visible) continue;
              expect(ratio(rgb(c.fg), rgb(c.bg)), `${lang}@${width} ${theme} ${sel} "${c.text}" ${c.fg} on ${c.bg}`).toBeGreaterThanOrEqual(4.5);
              expect(c.clipped, `${sel} "${c.text}" is clipped`).toBe(false);
            }
          }
          if (theme === 'dark') {
            expect(await axe(page, ['.course-row__popular', '.section-head .eyebrow'])).toEqual([]);
            await page.evaluate(() => document.documentElement.classList.remove('dark'));
          }
        }

        // 4. No horizontal overflow; no hydration errors.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
        await close();
      }, 120000);
    }

    it(`${lang} @390px: the mobile search button is visible in the open menu, named by its visible text, keyboard-focusable`, async () => {
      const { page, close } = await openHome(url, 390);
      await page.click('.nav-toggle');
      await page.waitForTimeout(500);
      const btn = page.locator('.nav__mobile-search');
      await expect.poll(() => btn.isVisible()).toBe(true);
      const visible = (await btn.innerText()).replace(/\s+/g, ' ').trim();
      expect(await page.getByRole('button', { name: visible, exact: true }).count()).toBe(1);
      expect(await axe(page, ['.nav__mobile-search'])).toEqual([]);
      let reached = false;
      for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(() => document.activeElement?.classList.contains('nav__mobile-search'));
      }
      expect(reached).toBe(true);
      const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      expect(ring).not.toBe('none');
      await close();
    }, 120000);

    it(`${lang} @1440px: the WhatsApp link is named by its visible text and shows a focus ring (not activated)`, async () => {
      const { page, close } = await openHome(url, 1440);
      const link = page.locator('.trust-bar__wa');
      const visible = (await link.innerText()).replace(/\s+/g, ' ').trim();
      expect(await page.getByRole('link', { name: visible, exact: true }).count()).toBe(1);
      expect(await link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+$/);
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => ({ cls: document.activeElement?.className, ring: getComputedStyle(document.activeElement).outlineStyle }));
      expect(state.cls).toBe('trust-bar__wa');
      expect(state.ring).not.toBe('none');
      await close();
    }, 120000);
  }
});

describeBuilt('Waves 1 and 2 have not regressed (built Home)', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: CTA contrast, brand name, quiz progressbar, audio button and scroll cue names`, async () => {
      const { page, close } = await openHome(url, 1440);
      const cta = (await colours(page, '.nav__cta'))[0];
      expect(ratio(rgb(cta.fg), rgb(cta.bg))).toBeGreaterThanOrEqual(4.5);
      expect(await page.locator('a.header__brand-link').getAttribute('aria-label')).toBeNull();
      expect(await page.locator('.lq__progress').getAttribute('role')).toBe('progressbar');
      expect(await page.locator('.qap__btn').getAttribute('aria-label')).toBeNull();
      expect(await page.locator('.hero__scroll-cue').getAttribute('aria-label')).toBeNull();
      await close();
    }, 120000);
  }
});
