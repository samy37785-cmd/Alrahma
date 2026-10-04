// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromiumOrSkip } from './utils/launchChromium';
import { contrastProbe } from './utils/contrastProbe';
import { focusProbe } from './utils/focusProbe';
import { getUI } from '../data/quranLangs';

// Accessibility Wave 5 (real-browser half): Quran Reader keyboard focus, mobile drawer overlap
// and the Mushaf accessible name, measured on the BUILT site (dist/public, served locally) in
// light, dark and sepia at 1440px and 390px, in EN / AR (RTL) / FR / IT.
//
//   1. Drawer (390): .qlc__sidebar-close overlaps no nav tab (rectangles measured, hit-tested
//      at each tab's centre and text), is >= 24x24, sits inside the drawer, and is reached by
//      Shift+Tab with a visible ring. At 1440 it is not displayed and the drawer is untouched.
//   2. .mushaf-navbtn: reached with real Tab presses, it is shown fully (effective opacity 1),
//      draws a >= 2px ring that is >= 3:1 against what it sits on, is not clipped or covered.
//      Unfocused, it keeps its hover-only (1440) / faint (390) look. The disabled previous
//      button is never a tab stop and never shown.
//   3. .qlc__cbar-select: the three selects get a >= 2px outline >= 3:1, not clipped; value and
//      options are untouched by focusing them.
//   4. axe: label-content-name-mismatch, nested-interactive, aria-prohibited-attr and
//      aria-allowed-role report nothing on the Mushaf element; its accessibility tree is a
//      group carrying the existing label, with the page-turn / ayah buttons inside it.
//   Plus: the Wave 4 contrast checks still pass (probe + axe color-contrast on the base view and
//   the drawer), no overflow, no hydration errors.
//
// No network: everything outside the local server is aborted, and api.quran.com is answered with
// the small SYNTHETIC fixtures below (placeholder strings, not Quran text). Nothing plays: media
// requests are aborted and no play control is ever pressed. The reader only fetches for a
// non-automated visitor (navigator.webdriver gate in pages/Quran.jsx), so the test reports
// webdriver=false; the consent banner that the same flag reveals is hidden with CSS (never clicked).
// /it and /fr are the published reader routes; EN and AR are rendered client-side from the SPA
// fallback; no route is added or published by this test.
//
// WAVE5_DIST=<dir> points the test at another build (the negative control against the unfixed code).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DIST = process.env.WAVE5_DIST ? path.resolve(process.env.WAVE5_DIST) : path.resolve(__dirname, '../../dist/public');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const browser = await launchChromiumOrSkip('accessibilityWave5.layout');
const hasDist = fs.existsSync(path.join(DIST, 'index.html'));
if (browser && !hasDist && process.env.REQUIRE_CHROMIUM === '1') {
  throw new Error('accessibilityWave5.layout needs dist/public: run `pnpm run build` before this step');
}
if (browser && !hasDist) console.warn('[accessibilityWave5.layout] dist/public missing, layout tests skipped (run pnpm run build)');
const run = browser && hasDist;
const describeBuilt = run ? describe : describe.skip;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };
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

// Synthetic api.quran.com answers: three chapters, three verses, placeholder text only.
const CHAPTERS = [1, 2, 3].map((id) => ({
  id, name_simple: `Fixture Surah ${id}`, name_arabic: 'سورة', translated_name: { name: `Fixture ${id}` },
  verses_count: 3, revelation_place: 'makkah', pages: [id, id], bismillah_pre: id !== 1,
}));
const VERSES = [1, 2, 3].map((n) => ({
  id: n, verse_key: `1:${n}`, verse_number: n, text_uthmani: 'نص تجريبي للاختبار', page_number: 1, juz_number: 1, hizb_number: 1,
  translations: [{ text: `Fixture translation line ${n}` }],
}));
const fixture = (url) => {
  const p = new URL(url).pathname.replace(/^\/api\/v4/, '');
  if (p === '/chapters') return { chapters: CHAPTERS };
  if (p.startsWith('/verses/')) return { verses: VERSES, pagination: { total_records: VERSES.length } };
  if (p.startsWith('/chapter_recitations/')) return { audio_file: { audio_url: `${base}/__wave5-no-audio.mp3` } };
  if (p.startsWith('/recitations/')) return { audio_files: [] };
  return null;
};

const LOCALES = [
  { lang: 'it', url: '/it/tools/quran-reader', dir: 'ltr', label: 'Mostra o nascondi i controlli di lettura' },
  { lang: 'fr', url: '/fr/tools/quran-reader', dir: 'ltr', label: 'Afficher/masquer les commandes de lecture' },
  { lang: 'en', url: '/tools/quran-reader', dir: 'ltr', label: 'Toggle reading view controls' },
  { lang: 'ar', url: '/ar/tools/quran-reader', dir: 'rtl', label: 'Toggle reading view controls' }, // no AR string exists: the English fallback is unchanged (out of scope)
];
const THEMES = ['light', 'dark', 'sepia'];
const THEME_CLASS = { light: /^(?!.*qlc--(dark|sepia)).*$/, dark: /qlc--dark/, sepia: /qlc--sepia/ };

async function openReader(url, width, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, deviceScaleFactor: width < 500 ? 2 : 1 });
  await ctx.addInitScript(({ theme: t }) => {
    try {
      localStorage.setItem('al-rahma-theme', t === 'dark' ? 'dark' : 'light');
      localStorage.setItem('qlc-sepia', t === 'sepia' ? '1' : '0');
      localStorage.setItem('qlc-reading-mode', 'continuous');
    } catch { /* storage unavailable */ }
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    const hide = () => { const s = document.createElement('style'); s.textContent = '.consent-banner{display:none!important}'; document.documentElement.appendChild(s); };
    if (document.documentElement) hide(); else document.addEventListener('DOMContentLoaded', hide);
  }, { theme });
  const external = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (/\.(mp3|ogg|m4a|wav|opus|aac)(\?|$)/i.test(u)) return route.abort();
    if (u.startsWith(base)) return route.continue();
    if (/^https:\/\/api\.quran\.com\//.test(u)) {
      const body = fixture(u);
      return body ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: '{}' });
    }
    external.push(new URL(u).host);
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/hydrat|Minified React error/i.test(m.text())) errors.push(m.text()); });
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mushaf-flow', { timeout: 30000 });
  await page.waitForTimeout(900); // theme transitions settle before measuring
  return { page, errors, external, close: () => ctx.close() };
}

const failing = async (page, root) => (await page.evaluate(contrastProbe, root))
  .filter((r) => !r.disabled && !r.symbol && r.ratio < r.required)
  .map((r) => `${r.sig} "${r.text}" ${r.fg} on ${r.bg} = ${r.ratio} (< ${r.required})`);

const axeRun = async (page, include, runOnly, enableExperimental = false) => {
  await page.evaluate(AXE);
  return page.evaluate(async ({ inc, only, exp }) => {
    if (!document.querySelector(inc)) return { missing: inc };
    const res = await window.axe.run({ include: [inc], exclude: [['.consent-banner']] }, { runOnly: only, rules: exp ? { 'label-content-name-mismatch': { enabled: true } } : {}, resultTypes: ['violations', 'incomplete'] });
    const nodes = (list) => list.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`));
    return { violations: nodes(res.violations), incomplete: nodes(res.incomplete) };
  }, { inc: include, only: runOnly, exp: enableExperimental });
};

const rectsOverlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

// Mark the focused element so focusProbe can find it, probe it, then unmark.
async function probeActive(page) {
  await page.waitForTimeout(350); // opacity (.2s) and border-colour (.15s) transitions finish before measuring
  await page.evaluate(() => document.activeElement?.setAttribute('data-w5', 'focus'));
  const probe = await page.evaluate(focusProbe, '[data-w5="focus"]');
  await page.evaluate(() => document.querySelector('[data-w5="focus"]')?.removeAttribute('data-w5'));
  return probe;
}
const activeSig = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  return { sig: `${e.tagName.toLowerCase()}${[...e.classList].map((c) => '.' + c).join('')}`, disabled: e.disabled === true, id: `${e.tagName}|${e.className}|${(e.getAttribute('aria-label') || e.textContent || '').slice(0, 24)}|${Math.round(e.getBoundingClientRect().top)}|${Math.round(e.getBoundingClientRect().left)}` };
});

// Real Tab presses from the top of the document; stops are probed where they matter.
async function tabWalk(page, max) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  const stops = []; const probes = { navbtn: [], select: [] }; const seen = new Set();
  let shiftBack = null;
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const a = await activeSig(page);
    if (!a || seen.has(a.id)) break;
    seen.add(a.id); stops.push(a.sig);
    if (a.sig.startsWith('button.mushaf-navbtn')) {
      probes.navbtn.push(await probeActive(page));
      // Shift+Tab goes back to the group (the disabled previous button is skipped), Tab forward again.
      await page.keyboard.press('Shift+Tab');
      shiftBack = (await activeSig(page))?.sig ?? null;
      await page.keyboard.press('Tab');
    } else if (a.sig.startsWith('select.qlc__cbar-select')) {
      probes.select.push(await probeActive(page));
    }
  }
  return { stops, probes, shiftBack };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

describeBuilt('Wave 5: Quran Reader focus, drawer overlap and Mushaf name on the built site (light / dark / sepia, 1440 / 390)', () => {
  for (const { lang, url, dir, label } of LOCALES) {
    for (const width of [1440, 390]) {
      for (const theme of THEMES) {
        it(`${lang} @${width}px ${theme}: drawer close overlaps nothing, Mushaf / select focus rings are visible (>= 3:1), the Mushaf element is a named group, Wave 4 contrast holds`, async () => {
          const ui = getUI(lang);
          const { page, errors, close } = await openReader(url, width, theme);
          try {
            expect(await page.$eval('.qlc', (e) => e.className)).toMatch(THEME_CLASS[theme]);
            expect(await page.evaluate(() => document.documentElement.dir || 'ltr')).toBe(dir);

            // ── 4. Mushaf accessible name ─────────────────────────────────────────
            const viewport = await page.evaluate(() => {
              const v = document.querySelector('.mushaf-viewport');
              return { role: v.getAttribute('role'), label: v.getAttribute('aria-label'), tabIndex: v.tabIndex, title: v.getAttribute('title') };
            });
            expect.soft(viewport).toEqual({ role: 'group', label, tabIndex: 0, title: null });
            const named = await axeRun(page, '.mushaf-viewport', ['label-content-name-mismatch', 'nested-interactive', 'aria-prohibited-attr', 'aria-allowed-role', 'button-name'], true);
            expect.soft(named.violations, 'axe rules on the Mushaf element').toEqual([]);
            expect.soft(named.incomplete.filter((n) => n.startsWith('label-content-name-mismatch .mushaf-viewport')), 'name needs review').toEqual([]);
            const tree = await page.locator('.mushaf-viewport').ariaSnapshot();
            expect.soft(tree.split('\n')[0]).toBe(`- group "${label}":`);
            expect.soft(tree).toContain(`button "${ui.nextPage || 'Next'}"`);
            expect.soft(tree).toContain(`button "${ui.prevPage || 'Previous'}" [disabled]`);
            expect.soft(tree).toMatch(/button "۝/);

            // ── Wave 4 contrast, base view, before any focus is moved ─────────────
            expect(await failing(page, '.qlc'), 'wave 4: base probe').toEqual([]);
            const ax = await axeRun(page, '.qlc', ['color-contrast']);
            expect(ax.violations, 'wave 4: axe color-contrast').toEqual([]);

            // ── 2. unfocused page-turn buttons keep their look; disabled previous stays hidden ──
            const unfocused = await page.evaluate(() => {
              const op = (s) => getComputedStyle(document.querySelector(s)).opacity;
              return { next: op('.mushaf-navbtn--next'), prev: op('.mushaf-navbtn--prev'), prevDisabled: document.querySelector('.mushaf-navbtn--prev').disabled, nextDisabled: document.querySelector('.mushaf-navbtn--next').disabled };
            });
            expect(unfocused).toEqual({ next: width < 900 ? '0.55' : '0', prev: '0', prevDisabled: true, nextDisabled: false });
            if (width >= 900) {
              await page.hover('.mushaf-viewport');
              await page.waitForTimeout(350);
              expect(await page.$eval('.mushaf-navbtn--next', (e) => getComputedStyle(e).opacity), 'hover reveal unchanged').toBe('0.85');
              expect(await page.$eval('.mushaf-navbtn--prev', (e) => getComputedStyle(e).opacity), 'disabled stays hidden on hover').toBe('0');
              await page.mouse.move(0, 0);
              await page.waitForTimeout(350);
            }
            const before = await page.evaluate(() => [...document.querySelectorAll('.qlc__cbar-select')].map((s) => [s.value, s.options.length]));

            // ── 2 + 3. keyboard walk with real Tab presses ────────────────────────
            const { stops, probes, shiftBack } = await tabWalk(page, 260);
            expect(stops.filter((s) => s === 'button.mushaf-navbtn.mushaf-navbtn--next'), 'next button is one tab stop').toHaveLength(1);
            expect(stops.filter((s) => s.includes('mushaf-navbtn--prev')), 'disabled previous button is not a tab stop').toEqual([]);
            expect(stops.indexOf('div.mushaf-viewport')).toBeGreaterThan(-1);
            expect(stops.indexOf('button.mushaf-navbtn.mushaf-navbtn--next')).toBe(stops.indexOf('div.mushaf-viewport') + 1);
            expect(shiftBack, 'Shift+Tab from the next button').toBe('div.mushaf-viewport');
            expect(stops.filter((s) => s.startsWith('select.qlc__cbar-select'))).toHaveLength(3);

            expect(probes.navbtn).toHaveLength(1);
            const nb = probes.navbtn[0];
            expect.soft(nb.focusVisible, 'navbtn :focus-visible').toBe(true);
            expect.soft(nb.effOpacity, 'navbtn effective opacity on focus').toBe(1);
            expect.soft(nb.drawn, 'navbtn ring drawn').toBe(true);
            expect.soft(nb.outline.width, 'navbtn ring width').toBeGreaterThanOrEqual(2);
            expect.soft(nb.ratio, `navbtn ring ${nb.outline.color} contrast`).toBeGreaterThanOrEqual(3);
            expect.soft(nb.clippedBy, 'navbtn ring clipped').toBeNull();
            expect.soft(nb.hit, 'navbtn covered by another element').toBe(true);
            expect.soft(nb.inViewport, 'navbtn inside the viewport').toBe(true);
            expect.soft(Math.min(nb.rect.w, nb.rect.h), 'navbtn target size').toBeGreaterThanOrEqual(24);

            expect(probes.select).toHaveLength(3);
            for (const [i, sp] of probes.select.entries()) {
              expect.soft(sp.focusVisible, `select ${i} :focus-visible`).toBe(true);
              expect.soft(sp.drawn, `select ${i} ring drawn`).toBe(true);
              expect.soft(sp.outline.width, `select ${i} ring width`).toBeGreaterThanOrEqual(2);
              expect.soft(sp.ratio, `select ${i} ring ${sp.outline.color} contrast`).toBeGreaterThanOrEqual(3);
              expect.soft(sp.clippedBy, `select ${i} ring clipped`).toBeNull();
            }
            const after = await page.evaluate(() => [...document.querySelectorAll('.qlc__cbar-select')].map((s) => [s.value, s.options.length]));
            expect(after, 'select values and options untouched by focusing').toEqual(before);

            // ── 1. drawer ──────────────────────────────────────────────────────────
            await page.evaluate(() => { document.activeElement?.blur(); });
            const toggle = await page.evaluate(() => { const t = document.querySelector('.qlc__sidebar-toggle'); const r = t.getBoundingClientRect(); return r.width > 0 && getComputedStyle(t).display !== 'none'; });
            expect(toggle, 'drawer toggle exists only below 900px').toBe(width < 900);
            const strip = await page.$eval('.qlc__sidebar', (e) => getComputedStyle(e).paddingTop);
            expect.soft(strip, 'drawer head strip').toBe(width < 900 ? '46px' : '0px');
            if (toggle) {
              await page.click('.qlc__sidebar-toggle');
              await page.waitForTimeout(700); // slide-in transition
            }
            const geo = await page.evaluate(() => {
              const rc = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
              const closeEl = document.querySelector('.qlc__sidebar-close');
              const close = { display: getComputedStyle(closeEl).display, rect: rc(closeEl) };
              const hit = (x, y, el) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
              const tabs = [...document.querySelectorAll('.qlc__nav-tab')].map((t) => {
                const r = rc(t);
                const range = document.createRange(); range.selectNodeContents(t); const tr = range.getBoundingClientRect();
                return { label: t.textContent.trim(), rect: r, text: { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom },
                  hitCentre: hit((r.l + r.r) / 2, (r.t + r.b) / 2, t), hitText: hit((tr.left + tr.right) / 2, (tr.top + tr.bottom) / 2, t), clipped: t.scrollWidth > t.clientWidth + 1 };
              });
              const others = [...document.querySelectorAll('.qlc__sidebar input, .qlc__sidebar .qlc__surah-btn, .qlc__nav-tabs')].map((e) => rc(e));
              return { close, tabs, others, sidebar: rc(document.querySelector('.qlc__sidebar')), vw: innerWidth };
            });
            expect(geo.tabs.map((t) => t.label)).toHaveLength(5);
            for (const t of geo.tabs) {
              expect.soft(t.hitCentre, `tab "${t.label}" centre reaches the tab`).toBe(true);
              expect.soft(t.hitText, `tab "${t.label}" text reaches the tab`).toBe(true);
              expect.soft(t.clipped, `tab "${t.label}" text clipped`).toBe(false);
            }
            if (width < 900) {
              const cr = geo.close.rect;
              expect(geo.close.display).toBe('flex');
              expect.soft(cr.w, 'close width').toBeGreaterThanOrEqual(24);
              expect.soft(cr.h, 'close height').toBeGreaterThanOrEqual(24);
              for (const t of geo.tabs) {
                expect.soft(rectsOverlap(cr, t.rect), `close overlaps tab "${t.label}" ${JSON.stringify(t.rect)}`).toBe(false);
                expect.soft(rectsOverlap(cr, { l: t.text.l, t: t.text.t, r: t.text.r, b: t.text.b }), `close overlaps the text of tab "${t.label}"`).toBe(false);
              }
              for (const o of geo.others) expect.soft(rectsOverlap(cr, o), 'close overlaps another drawer control').toBe(false);
              expect.soft(cr.t, 'close sits inside the drawer, top').toBeGreaterThanOrEqual(geo.sidebar.t + 4);
              expect.soft(cr.r, 'close sits inside the drawer, right').toBeLessThanOrEqual(geo.sidebar.r - 4);
              expect.soft(cr.l, 'close sits inside the drawer, left').toBeGreaterThanOrEqual(geo.sidebar.l + 4);
              expect(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e?.closest('.qlc__sidebar-close'); }, [cr.l + cr.w / 2, cr.t + cr.h / 2]), 'close centre reaches the close button').toBe(true);

              // Keyboard: Shift+Tab from the first tab reaches the close button; it shows a ring.
              await page.focus('.qlc__nav-tab');
              await page.keyboard.press('Shift');
              await page.keyboard.press('Shift+Tab');
              expect((await activeSig(page))?.sig, 'Shift+Tab from the first nav tab').toBe('button.qlc__sidebar-close');
              const cp = await probeActive(page);
              expect.soft(cp.focusVisible, 'close :focus-visible').toBe(true);
              expect.soft(cp.drawn && cp.outline.width >= 2, 'close ring drawn').toBe(true);
              expect.soft(cp.ratio, 'close ring contrast').toBeGreaterThanOrEqual(3);
              expect.soft(cp.clippedBy, 'close ring clipped').toBeNull();
              await page.keyboard.press('Tab');
              expect((await activeSig(page))?.sig, 'Tab from close goes to the first nav tab').toMatch(/^button\.qlc__nav-tab/);
              expect(await noOverflow(page), 'overflow with the drawer open').toBeLessThanOrEqual(0);

              // Wave 4 contrast inside the open drawer.
              expect(await failing(page, '.qlc__sidebar'), 'wave 4: drawer probe').toEqual([]);
              expect((await axeRun(page, '.qlc__sidebar', ['color-contrast'])).violations, 'wave 4: drawer axe color-contrast').toEqual([]);

              // Pressing the close button still closes the drawer.
              await page.focus('.qlc__sidebar-close');
              await page.keyboard.press('Enter');
              await page.waitForTimeout(500);
              expect(await page.$eval('.qlc__sidebar', (e) => e.getBoundingClientRect().right), 'drawer closed').toBeLessThanOrEqual(1);
            } else {
              expect(geo.close.display, 'close button hidden on desktop').toBe('none');
            }

            expect(await noOverflow(page), 'horizontal overflow').toBeLessThanOrEqual(0);
            expect(errors, 'page / hydration errors').toEqual([]);
          } finally {
            await close();
          }
        }, 120000);
      }
    }
  }
});
