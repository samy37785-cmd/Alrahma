// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromiumOrSkip } from './utils/launchChromium';

// Accessibility Wave 2 (real-browser half): the consent-settings target size,
// and the Quran audio button / scroll cue names under the project's real
// stylesheets (including the mobile rule that hides the player label).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Some stylesheets start with a BOM, which would corrupt the first rule once concatenated.
const css = (rel) => fs.readFileSync(path.resolve(__dirname, '..', 'styles', rel), 'utf8').replace(/^﻿/, '');
const STYLES = ['tokens.css', 'global.css', 'consent.css', 'trust-engage.css', 'layout/footer.css', 'layout/home.css', 'responsive.css']
  .map(css)
  .join('\n');

// Skipped visibly where Chromium is not installed; an error when REQUIRE_CHROMIUM=1 (see utils/launchChromium.js).
const browser = await launchChromiumOrSkip('accessibilityWave2.layout');
afterAll(async () => { await browser?.close(); });
const describeInBrowser = browser ? describe : describe.skip;

const COPY = {
  en: { dir: 'ltr', settings: 'Cookie settings', privacy: 'Privacy Policy', terms: 'Terms of Service', refund: 'Refund Policy', contact: 'Contact', play: 'Play Quran', playing: 'Quran playing', scroll: 'Scroll' },
  ar: { dir: 'rtl', settings: 'إعدادات ملفات تعريف الارتباط', privacy: 'سياسة الخصوصية', terms: 'شروط الخدمة', refund: 'سياسة الاسترداد', contact: 'تواصل معنا', play: 'تشغيل القرآن', playing: 'القرآن يُتلى', scroll: 'مرر' },
  fr: { dir: 'ltr', settings: 'Paramètres des cookies', privacy: 'Politique de confidentialité', terms: "Conditions d'utilisation", refund: 'Politique de remboursement', contact: 'Contact', play: 'Écouter le Coran', playing: 'Coran en lecture', scroll: 'Faire défiler' },
  it: { dir: 'ltr', settings: 'Impostazioni dei cookie', privacy: 'Informativa sulla privacy', terms: 'Termini di servizio', refund: 'Politica di rimborso', contact: 'Contatti', play: 'Ascolta il Corano', playing: 'Corano in riproduzione', scroll: 'Scorri' },
};

const page$ = (lang) => {
  const c = COPY[lang];
  return `<!doctype html><html lang="${lang}" dir="${c.dir}"><head><meta name="viewport" content="width=device-width"><style>${STYLES}</style></head><body>
  <section class="hero" style="min-height:700px">
    <div class="container"></div>
    <a href="#courses" class="hero__scroll-cue"><span>${c.scroll}</span><div class="hero__scroll-icon"></div></a>
    <div class="qap" role="region" aria-label="Audio">
      <button type="button" class="qap__btn" title="Play softly"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9z"/></svg><span class="qap__label">${c.play}</span></button>
      <button type="button" class="qap__close" aria-label="Close">x</button>
    </div>
  </section>
  <footer class="footer"><div class="footer__bottom"><div class="container">
    <p>Copyright &copy; 2026 Al-Rahma Academy.</p>
    <p><a href="/academy/privacy">${c.privacy}</a> · <a href="/academy/terms">${c.terms}</a> · <a href="/academy/refund-policy">${c.refund}</a> · <a href="mailto:x@y.z">${c.contact}</a> · <button type="button" class="consent-settings-link">${c.settings}</button></p>
  </div></div></footer>
  </body></html>`;
};

async function open(lang, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.setContent(page$(lang));
  return { page, close: () => ctx.close() };
}

const box = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

describeInBrowser('.consent-settings-link target size, real stylesheets', () => {
  for (const lang of Object.keys(COPY)) {
    for (const width of [1440, 390]) {
      it(`${lang} @${width}px: at least 24x24, no overlap with neighbours, no horizontal overflow`, async () => {
        const { page, close } = await open(lang, width);
        const b = await box(page, '.consent-settings-link');
        expect(b.w).toBeGreaterThanOrEqual(24);
        expect(b.h).toBeGreaterThanOrEqual(24);

        // Every other link/button box in the footer line (all their line fragments) misses it.
        const overlaps = await page.evaluate(() => {
          const target = document.querySelector('.consent-settings-link').getBoundingClientRect();
          const hit = [];
          for (const el of document.querySelectorAll('.footer__bottom a, .footer__bottom button')) {
            if (el.classList.contains('consent-settings-link')) continue;
            for (const r of el.getClientRects()) {
              if (r.left < target.right - 0.01 && target.left < r.right - 0.01 && r.top < target.bottom - 0.01 && target.top < r.bottom - 0.01) hit.push(el.textContent.trim());
            }
          }
          return hit;
        });
        expect(overlaps).toEqual([]);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        // The label is unchanged and RTL is preserved.
        expect(await page.$eval('.consent-settings-link', (el) => el.textContent)).toBe(COPY[lang].settings);
        expect(await page.evaluate(() => getComputedStyle(document.querySelector('.footer__bottom p:last-child')).direction)).toBe(COPY[lang].dir);
        await close();
      });
    }
  }

  it('the visible text size is unchanged (only the hit area grows)', async () => {
    const { page, close } = await open('it', 390);
    const style = await page.$eval('.consent-settings-link', (el) => {
      const s = getComputedStyle(el);
      return { font: s.fontSize, deco: s.textDecorationLine, display: s.display };
    });
    const parent = await page.$eval('.footer__bottom p:last-child', (el) => getComputedStyle(el).fontSize);
    expect(style.font).toBe(parent);
    expect(style.deco).toContain('underline');
    await close();
  });

  it('keyboard: Tab reaches the button last in the footer line and shows a focus ring', async () => {
    const { page, close } = await open('ar', 390);
    let reached = false;
    for (let i = 0; i < 12 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('consent-settings-link'));
    }
    expect(reached).toBe(true);
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThan(0);
    await close();
  });
});

describeInBrowser('.qap__btn name, real stylesheets (desktop shows the label, mobile hides it visually)', () => {
  for (const lang of Object.keys(COPY)) {
    it(`${lang}: named by its label at 1440px (visible) and at 390px (visually hidden, still in the accessibility tree)`, async () => {
      for (const width of [1440, 390]) {
        const { page, close } = await open(lang, width);
        const named = await page.getByRole('button', { name: COPY[lang].play, exact: true }).count();
        expect(named, `${lang}@${width} accessible name`).toBe(1);
        const label = await page.$eval('.qap__label', (el) => {
          const r = el.getBoundingClientRect();
          return { display: getComputedStyle(el).display, w: r.width, h: r.height };
        });
        expect(label.display).not.toBe('none');
        if (width === 1440) expect(label.w).toBeGreaterThan(20);
        else { expect(label.w).toBeLessThanOrEqual(1); expect(label.h).toBeLessThanOrEqual(1); }
        // The button keeps a tappable size on mobile.
        const b = await box(page, '.qap__btn');
        expect(b.h).toBeGreaterThanOrEqual(24);
        expect(b.w).toBeGreaterThanOrEqual(24);
        await close();
      }
    });
  }
});

describeInBrowser('.hero__scroll-cue name and behaviour, real stylesheets', () => {
  for (const lang of Object.keys(COPY)) {
    it(`${lang}: named by its visible text on desktop, and still hidden on mobile (unchanged)`, async () => {
      const desktop = await open(lang, 1440);
      expect(await desktop.page.getByRole('link', { name: COPY[lang].scroll, exact: true }).count()).toBe(1);
      expect(await desktop.page.$eval('.hero__scroll-cue', (el) => el.getAttribute('href'))).toBe('#courses');
      await desktop.close();

      const mobile = await open(lang, 390);
      expect(await mobile.page.$eval('.hero__scroll-cue', (el) => getComputedStyle(el).display)).toBe('none');
      await mobile.close();
    });
  }
});
