// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { alphabetGroups } from '../data';

// Accessibility Wave 1 (real-browser half). jsdom has no layout engine, so the
// contrast ratios and tap-target boxes are measured in headless Chromium using
// the project's real stylesheets: the colours are the *computed* colours (after
// the cascade and !important), and the boxes are real getBoundingClientRect()s.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Some stylesheets start with a BOM, which would corrupt the first rule once concatenated.
const css = (rel) => fs.readFileSync(path.resolve(__dirname, '..', 'styles', rel), 'utf8').replace(/^﻿/, '');
const STYLES = ['tokens.css', 'global.css', 'layout/header.css', 'layout/enrollment.css', 'alphabet.css', 'responsive.css']
  .map(css)
  .join('\n');

const toLin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

// Chromium is only present where Playwright browsers are installed (local
// runs, and CI after its "Install Playwright Chromium" step). Without it these
// tests are skipped visibly rather than failing the browser-less vitest step.
let browser = null;
try {
  browser = await chromium.launch();
} catch (error) {
  console.warn(`[accessibilityWave1.layout] Chromium unavailable, layout tests skipped: ${String(error.message).split('\n')[0]}`);
}
afterAll(async () => { await browser?.close(); });
const describeInBrowser = browser ? describe : describe.skip;

async function newPage(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  return { page, close: () => ctx.close() };
}

const html = (body, htmlClass = '') =>
  `<!doctype html><html class="${htmlClass}"><head><meta name="viewport" content="width=device-width"><style>${STYLES}</style></head><body>${body}</body></html>`;

// Text colour and the background actually painted behind it: the first
// non-transparent background walking up from the element.
const colours = (page, sel) =>
  page.$eval(sel, (el) => {
    const fg = getComputedStyle(el).color;
    let bg = 'rgba(0, 0, 0, 0)';
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
    }
    return { fg, bg };
  });

describeInBrowser('1. header CTA (.nav__cta) contrast, computed from the real stylesheets', () => {
  for (const width of [1440, 390]) {
    it(`${width}px: text/background is at least 4.5:1 at rest, on hover and on focus`, async () => {
      const { page, close } = await newPage(width);
      await page.setContent(html('<header class="header"><nav class="nav open"><a class="nav__cta" href="/enroll">Free trial</a></nav></header>'));
      const rest = await colours(page, '.nav__cta');
      expect(ratio(rgb(rest.fg), rgb(rest.bg))).toBeGreaterThanOrEqual(4.5);

      await page.hover('.nav__cta');
      await page.waitForTimeout(300);
      const hover = await colours(page, '.nav__cta');
      expect(ratio(rgb(hover.fg), rgb(hover.bg))).toBeGreaterThanOrEqual(4.5);

      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement.className)).toBe('nav__cta');
      const focus = await colours(page, '.nav__cta');
      expect(ratio(rgb(focus.fg), rgb(focus.bg))).toBeGreaterThanOrEqual(4.5);
      const outline = await page.$eval('.nav__cta', (el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');

      // Desktop: still the brand gold, not a recolour. (In the mobile drawer
      // the CTA has always been painted on the drawer's own background.)
      if (width > 900) expect(rgb(rest.bg)).toEqual([200, 132, 42]);
      await close();
    });
  }
});

describeInBrowser('5. Enroll eyebrow contrast, computed from the real stylesheets', () => {
  const page$ = '<main class="enroll__page"><div class="enroll__header"><p class="eyebrow">Start your journey</p></div></main>';

  it('light mode: at least 4.5:1 on the page background (was 2.86:1)', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html(page$));
    const { fg, bg } = await colours(page, '.eyebrow');
    expect(ratio(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(4.5);
    await close();
  });

  it('dark mode: at least 4.5:1 on the dark page background', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html(page$, 'dark'));
    const { fg, bg } = await colours(page, '.eyebrow');
    expect(ratio(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(4.5);
    await close();
  });

  it('other .eyebrow elements are unaffected (selector is scoped to .enroll__header)', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html('<p class="eyebrow" id="x">Other</p>'));
    const before = await page.$eval('#x', (el) => getComputedStyle(el).color);
    await page.setContent(html('<main class="enroll__page"><div class="enroll__header"><p class="eyebrow">E</p></div></main><p class="eyebrow" id="x">Other</p>'));
    const after = await page.$eval('#x', (el) => getComputedStyle(el).color);
    expect(after).toBe(before);
    await close();
  });
});

describeInBrowser('4. alphabet progress dots: real boxes', () => {
  const dotsHtml = (n, containerWidth) =>
    `<div class="qlc" style="width:${containerWidth}px;margin:0 auto"><div class="alpha__dots">${
      Array.from({ length: n }, (_, i) => `<button class="${i === 0 ? 'alpha__dot alpha__dot--active' : 'alpha__dot'}" aria-label="Group ${i + 1}"></button>`).join('')
    }</div></div>`;

  // The tool card is narrower than the viewport; 310px is the 390px layout
  // with the page and card padding taken off, the others are wider layouts.
  for (const [vw, container] of [[390, 310], [1440, 640]]) {
    it(`${vw}px: every one of the ${alphabetGroups.length} dots is at least 24x24, none overlap, nothing overflows`, async () => {
      const { page, close } = await newPage(vw);
      await page.setContent(html(dotsHtml(alphabetGroups.length, container)));
      const boxes = await page.$$eval('.alpha__dot', (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }));
      expect(boxes).toHaveLength(alphabetGroups.length);
      for (const b of boxes) {
        expect(b.w).toBeGreaterThanOrEqual(24);
        expect(b.h).toBeGreaterThanOrEqual(24);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]; const b = boxes[j];
          const overlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
          expect(overlap, `dots ${i + 1} and ${j + 1} overlap`).toBe(false);
        }
      }
      // DOM order is the visual reading order (row by row, left to right).
      const sorted = [...boxes].sort((p, q) => (p.y - q.y) || (p.x - q.x));
      expect(sorted).toEqual(boxes);
      const overflow = await page.evaluate(() => ({
        dots: document.querySelector('.alpha__dots').scrollWidth - document.querySelector('.alpha__dots').clientWidth,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.dots).toBeLessThanOrEqual(0);
      expect(overflow.doc).toBeLessThanOrEqual(0);
      await close();
    });
  }

  it('the visible dot is still a small 8px circle, centred in its target, and the active one is scaled', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html(dotsHtml(alphabetGroups.length, 640)));
    const dot = await page.$eval('.alpha__dot:not(.alpha__dot--active)', (el) => {
      const s = getComputedStyle(el, '::before');
      return { w: s.width, h: s.height, radius: s.borderRadius };
    });
    expect(dot.w).toBe('8px');
    expect(dot.h).toBe('8px');
    const active = await page.$eval('.alpha__dot--active', (el) => getComputedStyle(el, '::before').transform);
    expect(active).not.toBe('none');
    await close();
  });

  it('keyboard: Tab reaches each dot in order and the focus ring is visible', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html(dotsHtml(alphabetGroups.length, 640)));
    for (let i = 1; i <= alphabetGroups.length; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const s = getComputedStyle(el);
        return { label: el.getAttribute('aria-label'), outlineStyle: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth) };
      });
      expect(info.label).toBe(`Group ${i}`);
      expect(info.outlineStyle).not.toBe('none');
      expect(info.outlineWidth).toBeGreaterThanOrEqual(2);
    }
    await close();
  });
});

describeInBrowser('4b. the restored alphabet learner has no contrast regression', () => {
  it('the pronunciation chip (.alpha__card-it) is at least 4.5:1', async () => {
    const { page, close } = await newPage(1440);
    await page.setContent(html('<div class="alpha"><div class="alpha__cards"><div class="alpha__card"><div class="alpha__card-it">Pronuncia: A</div></div></div></div>'));
    const { fg, bg } = await colours(page, '.alpha__card-it');
    expect(ratio(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(4.5);
    await close();
  });
});
