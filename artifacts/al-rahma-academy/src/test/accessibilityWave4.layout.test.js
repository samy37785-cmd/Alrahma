// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromiumOrSkip } from './utils/launchChromium';
import { contrastProbe } from './utils/contrastProbe';

// Accessibility Wave 4 (real-browser half): Quran Reader contrast, measured on
// the BUILT site (dist/public, served locally) in light, dark and sepia at
// 1440px and 390px, in the reader's base view (Mushaf and verse-by-verse) and
// in every panel the audit opened: sidebar drawer, shortcuts side panel,
// shortcuts modal, settings, tafsir picker and the share-card modal.
//
// Ratios come from contrastProbe (utils/contrastProbe.js), which composites the
// computed colours itself; no expected colour is written here. axe-core's
// color-contrast rule must also report 0 violations inside the reader.
//
// No network: everything outside the local server is aborted, and api.quran.com
// is answered with the small SYNTHETIC fixtures below (placeholder strings, not
// Quran text and not a copy of any API response). Nothing plays: media requests
// are aborted and no play control is ever clicked. The reader only fetches for a
// non-automated visitor (navigator.webdriver gate in pages/Quran.jsx), so the
// test reports webdriver=false; the consent banner that the same flag reveals is
// hidden with CSS (never clicked, no choice stored).
//
// /it and /fr are the published reader routes. EN (/tools/quran-reader) and AR
// (/ar/tools/quran-reader, RTL) are checked too, rendered client-side from the
// SPA fallback; no route is added or published by this test.
//
// WAVE4_DIST=<dir> points the test at another build (used for the negative
// control against the unfixed stylesheet).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DIST = process.env.WAVE4_DIST ? path.resolve(process.env.WAVE4_DIST) : path.resolve(__dirname, '../../dist/public');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const browser = await launchChromiumOrSkip('accessibilityWave4.layout');
const hasDist = fs.existsSync(path.join(DIST, 'index.html'));
if (browser && !hasDist && process.env.REQUIRE_CHROMIUM === '1') {
  throw new Error('accessibilityWave4.layout needs dist/public: run `pnpm run build` before this step');
}
if (browser && !hasDist) console.warn('[accessibilityWave4.layout] dist/public missing, layout tests skipped (run pnpm run build)');
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
  if (p.startsWith('/chapter_recitations/')) return { audio_file: { audio_url: `${base}/__wave4-no-audio.mp3` } };
  if (p.startsWith('/recitations/')) return { audio_files: [] };
  return null;
};

const LOCALES = [
  { lang: 'it', url: '/it/tools/quran-reader', dir: 'ltr' },
  { lang: 'fr', url: '/fr/tools/quran-reader', dir: 'ltr' },
  { lang: 'en', url: '/tools/quran-reader', dir: 'ltr' },
  { lang: 'ar', url: '/ar/tools/quran-reader', dir: 'rtl' },
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

// Failing text rows under `root` (disabled controls are exempt and symbol-only glyphs are not text).
const failing = async (page, root) => (await page.evaluate(contrastProbe, root))
  .filter((r) => !r.disabled && !r.symbol && r.ratio < r.required)
  .map((r) => `${r.sig} "${r.text}" ${r.fg} on ${r.bg} = ${r.ratio} (< ${r.required})`);
const textCount = async (page, root) => (await page.evaluate(contrastProbe, root)).filter((r) => !r.symbol).length;

const axeContrast = async (page, include) => {
  await page.evaluate(AXE);
  return page.evaluate(async (inc) => {
    if (!document.querySelector(inc)) return ['missing ' + inc];
    const res = await window.axe.run({ include: [[inc]], exclude: [['.consent-banner']] }, { runOnly: ['color-contrast'] });
    return res.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.fgColor} on ${n.any[0]?.data?.bgColor} = ${n.any[0]?.data?.contrastRatio}`));
  }, include);
};

const visible = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return false;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  // Fully inside the viewport horizontally: a closed drawer can leave a sub-pixel sliver at the edge (RTL).
  return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= window.innerWidth + 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
}, sel);

// Every check of one state: probe + axe, both empty.
async function expectClean(page, root, label, results) {
  const probe = await failing(page, root);
  const ax = await axeContrast(page, root);
  results[label] = { probe, axe: ax, measured: await textCount(page, root) };
  expect.soft(probe, `${label}: probe`).toEqual([]);
  expect.soft(ax, `${label}: axe color-contrast`).toEqual([]);
}

// Hover and keyboard focus on each control: the control's own text stays >= its threshold,
// and a focus ring is drawn with >= 3:1 against what surrounds it. Returns the controls a
// pointer could not reach (another element on top); callers assert that list explicitly.
async function expectInteractive(page, selectors, label) {
  const blocked = [];
  for (const sel of selectors) {
    if (!(await visible(page, sel))) continue;
    await page.evaluate((s) => document.querySelector(s).setAttribute('data-w4', 'target'), sel);
    if (await page.hover('[data-w4="target"]', { timeout: 3000 }).then(() => true, () => false)) {
      await page.waitForTimeout(250);
      expect.soft(await failing(page, '[data-w4="target"]'), `${label} hover ${sel}`).toEqual([]);
    } else {
      blocked.push(sel);
    }
    await page.mouse.move(0, 0);
    await page.keyboard.press('Shift'); // keyboard modality, so :focus-visible applies
    await page.focus('[data-w4="target"]');
    await page.waitForTimeout(250);
    expect.soft(await failing(page, '[data-w4="target"]'), `${label} focus ${sel}`).toEqual([]);
    const ring = await page.evaluate(() => {
      const el = document.querySelector('[data-w4="target"]');
      const cs = getComputedStyle(el);
      const parse = (c) => c.match(/[\d.]+/g).map(Number);
      const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      let bg = [255, 255, 255];
      for (let n = el.parentElement; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if ((c[3] ?? 1) === 1 && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
      }
      const o = parse(cs.outlineColor);
      const [hi, lo] = [lum(o), lum(bg)].sort((a, b) => b - a);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), ratio: (hi + 0.05) / (lo + 0.05), shadow: cs.boxShadow };
    });
    if (RING_REQUIRED.some((s) => sel.startsWith(s))) {
      expect.soft(ring.style, `${label} focus ring ${sel}`).not.toBe('none');
      expect.soft(ring.width, `${label} focus ring ${sel}`).toBeGreaterThan(0);
      expect.soft(ring.ratio, `${label} focus ring contrast ${sel}`).toBeGreaterThanOrEqual(3);
    }
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('[data-w4="target"]')?.removeAttribute('data-w4'); });
  }
  return blocked;
}
const RING_REQUIRED = ['.qlc__back', '.qlc__bar-icon', '.qlc__tab', '.qlc__lang-select', '.qlc__sidebar-toggle', '.qlc__nav-tab', '.qlc__mode-switch-btn', '.qlc__tafsirbtn', '.qlc__surah-btn', '.qlc__jump-btn'];
const BASE_CONTROLS = ['.qlc__back', '.qlc__bar-icon', '.qlc__tab:not(.qlc__tab--active)', '.qlc__tab--active', '.qlc__lang-select', '.qlc__sidebar-toggle',
  '.qlc__nav-tab:not(.active)', '.qlc__nav-tab.active', '.qlc__surah-btn:not(.active)', '.qlc__surah-btn.active', '.qlc__mode-switch-btn:not(.active)', '.qlc__mode-switch-btn.active',
  '.qlc__cbar-font-btn', '.qlc__syncplayer .qplayer__speed:not(.active)', '.qlc__syncplayer .qplayer__speed.active', '.qplayer__speeds .qplayer__speed:not(.active)', '.qplayer__skip-btn', '.mushaf-ayah-num'];
const VERSE_CONTROLS = ['.qlc__tafsirbtn', '.qlc__jump-btn', '.qlc__vbadge'];

// The star / page-turn glyphs are the controls' only visible content (WCAG 1.4.11: >= 3:1).
async function expectGlyphs(page, label) {
  const rows = await page.evaluate(contrastProbe, '.qlc');
  const glyphs = rows.filter((r) => r.symbol && /qlc__bookmark-btn/.test(r.sig) && !r.disabled);
  for (const g of glyphs) expect.soft(g.ratio, `${label} ${g.sig} "${g.text}" ${g.fg} on ${g.bg}`).toBeGreaterThanOrEqual(3);
  return glyphs.length;
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// Text of the restyled labels is not cut off, and the top-bar controls do not overlap.
const layoutProblems = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.qlc__chapter-en, .qlc__cbar-label, .qlc__cbar-font-val, .qlc__jump-label, .qlc__jump-of, .qlc__vbadge, .qlc__back, .mushaf-margin__badge, .mushaf-progress, .qlc__mode-switch-label, .qlc__settings-label, .qlc__shortcuts-cat')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || getComputedStyle(el).display === 'none') continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped ${el.className}`);
  }
  const bar = [...document.querySelectorAll('.qlc__bar-right > *')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
  for (let i = 0; i < bar.length; i += 1) for (let j = i + 1; j < bar.length; j += 1) {
    const a = bar[i]; const b = bar[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`overlap bar items ${i}/${j}`);
  }
  return out;
});

async function clickWhenVisible(page, sel) {
  if (!(await visible(page, sel))) return false;
  await page.click(sel);
  await page.waitForTimeout(500);
  return true;
}

describeBuilt('Wave 4: Quran Reader contrast on the built site (light / dark / sepia, 1440 / 390)', () => {
  for (const { lang, url, dir } of LOCALES) {
    for (const width of [1440, 390]) {
      for (const theme of THEMES) {
        it(`${lang} @${width}px ${theme}: every audited state is >= 4.5:1 (axe 0), hover / focus / selected pass, rings >= 3:1, no overflow, no hydration errors`, async () => {
          const { page, errors, external, close } = await openReader(url, width, theme);
          const results = {};
          try {
            expect(await page.$eval('.qlc', (e) => e.className)).toMatch(THEME_CLASS[theme]);
            expect(await page.evaluate(() => document.documentElement.dir || 'ltr')).toBe(dir);

            // 1. Base view (Mushaf / continuous) and its controls.
            await expectClean(page, '.qlc', 'base', results);
            expect(await expectInteractive(page, BASE_CONTROLS, 'base'), 'base: controls a pointer cannot reach').toEqual([]);
            await expectGlyphs(page, 'base');

            // 2. Sidebar: a drawer below 900px (opened with its toggle); always shown at 1440 (covered by base).
            if (await clickWhenVisible(page, '.qlc__sidebar-toggle')) {
              await page.waitForTimeout(400);
              await expectClean(page, '.qlc__sidebar', 'sidebar', results);
              // Known, out of scope (not contrast): the drawer's close button sits over the end tab
              // (the active first tab in RTL), so only a nav tab may be unreachable by pointer here.
              const blocked = await expectInteractive(page, ['.qlc__nav-tab:not(.active)', '.qlc__nav-tab.active', '.qlc__surah-btn:not(.active)', '.qlc__surah-btn.active'], 'sidebar');
              expect(blocked.filter((s) => !s.startsWith('.qlc__nav-tab')), 'sidebar: controls a pointer cannot reach').toEqual([]);
              await page.click('.qlc__sidebar-close');
              await page.waitForTimeout(400);
            }

            // 3. Shortcuts side panel (tab on the right edge).
            if (await clickWhenVisible(page, '.qlc__ksp-tab')) {
              await expectClean(page, '.qlc__ksp', 'kbdSidePanel', results);
              await page.click('.qlc__ksp-close');
            }

            // 4. Shortcuts modal ('?').
            await page.evaluate(() => document.activeElement?.blur());
            await page.keyboard.press('?');
            await page.waitForSelector('.qlc__shortcuts');
            await page.waitForTimeout(500); // qlc-pop open animation fades opacity in
            await expectClean(page, '.qlc__shortcuts', 'shortcutsModal', results);
            await page.click('.qlc__shortcuts .qlc__panel-close');

            // 5. Settings (selected theme chip included).
            await page.evaluate(() => [...document.querySelectorAll('.qlc__bar-icon')].find((b) => b.textContent.includes('⚙')).setAttribute('data-w4-settings', ''));
            await page.click('[data-w4-settings]');
            await page.waitForSelector('.qlc__settings');
            await page.waitForTimeout(500);
            await expectClean(page, '.qlc__settings', 'settings', results);
            expect(await expectInteractive(page, ['.qlc__theme-btn:not(.active)', '.qlc__theme-btn.active'], 'settings'), 'settings: controls a pointer cannot reach').toEqual([]);
            await page.click('.qlc__settings .qlc__panel-close');

            // 6. Verse-by-verse view (display toggle only: same verses, nothing refetched).
            await page.click('.qlc__mode-switch-btn:not(.active)');
            await page.waitForSelector('.qlc__verse');
            await page.waitForTimeout(400);
            await expectClean(page, '.qlc', 'baseVerse', results);
            expect(await expectInteractive(page, VERSE_CONTROLS, 'baseVerse'), 'baseVerse: controls a pointer cannot reach').toEqual([]);
            expect(await expectGlyphs(page, 'baseVerse')).toBeGreaterThan(0);

            // 7. Tafsir picker (opened only: no tafsir is selected or loaded).
            await page.click('.qlc__tafsirbtn');
            await page.waitForSelector('.qlc__tafsir-picker');
            await page.waitForTimeout(500);
            await expectClean(page, '.qlc__tafsir-picker', 'tafsirPicker', results);
            await page.click('.qlc__tafsir-picker-head button');

            // 8. Share card modal (opened only: Share / Copy / Print are never pressed).
            await page.click('.qlc__actbtn--card');
            await page.waitForSelector('.vcard-modal');
            await page.waitForTimeout(300);
            await expectClean(page, '.vcard-modal', 'shareCard', results);
            await page.click('.vcard-modal__close');

            expect(await noOverflow(page), 'horizontal overflow').toBeLessThanOrEqual(0);
            expect(await layoutProblems(page)).toEqual([]);
            expect(errors, 'page / hydration errors').toEqual([]);
            // Each state measured real text, not an empty container.
            for (const [state, r] of Object.entries(results)) expect(r.measured, `${state} measured text nodes`).toBeGreaterThan(state === 'tafsirPicker' ? 3 : 2);
          } finally {
            await close();
          }
        }, 120000);
      }
    }
  }
});
