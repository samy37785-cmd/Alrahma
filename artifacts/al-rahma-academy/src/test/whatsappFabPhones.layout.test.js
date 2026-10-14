// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromiumOrSkip } from './utils/launchChromium';

// WhatsApp FAB on phones (audit item 21): at 56px, 22px from the edge, it reached
// into the text column while scrolling. Under the real stylesheets it is 48px and
// 14px from the edge (the left one in Arabic) up to 640px and stays 56px/22px
// above that. At the very bottom of the page no footer text is behind it, at any
// width: before, Cookie settings sat under it at 1024px.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Some stylesheets start with a BOM, which would corrupt the first rule once concatenated.
const css = (rel) => fs.readFileSync(path.resolve(__dirname, '..', 'styles', rel), 'utf8').replace(/^﻿/, '');
const STYLES = ['tokens.css', 'global.css', 'layout/footer.css', 'layout/rtl.css', 'responsive.css']
  .map(css)
  .join('\n');

// Skipped visibly where Chromium is not installed; an error when REQUIRE_CHROMIUM=1 (see utils/launchChromium.js).
const browser = await launchChromiumOrSkip('whatsappFabPhones.layout');
afterAll(async () => { await browser?.close(); });
const describeInBrowser = browser ? describe : describe.skip;

const COPY = {
  en: { dir: 'ltr', rights: 'Copyright © 2026 AL-Rahma Academy. All rights reserved.', links: ['Privacy Policy', 'Terms of Service', 'Refund Policy', 'Contact', 'Cookie settings'] },
  ar: { dir: 'rtl', rights: 'حقوق النشر © 2026 أكاديمية الرحمة. جميع الحقوق محفوظة.', links: ['سياسة الخصوصية', 'شروط الخدمة', 'سياسة الاسترداد', 'تواصل معنا', 'إعدادات ملفات تعريف الارتباط'] },
  it: { dir: 'ltr', rights: 'Copyright © 2026 AL-Rahma Academy. Tutti i diritti riservati.', links: ['Informativa sulla privacy', 'Termini di servizio', 'Politica di rimborso', 'Contatti', 'Impostazioni dei cookie'] },
};

const page$ = (lang) => {
  const c = COPY[lang];
  return `<!doctype html><html lang="${lang}" dir="${c.dir}"><head><meta name="viewport" content="width=device-width"><style>${STYLES}</style></head><body>
  <main style="min-height:1600px"></main>
  <footer class="footer"><div class="footer__bottom"><div class="container">
    <p>${c.rights}</p>
    <p>${c.links.map((l) => `<a href="#">${l}</a>`).join(' · ')}</p>
  </div></div></footer>
  <a href="https://wa.me/1" class="whatsapp-fab" aria-label="WhatsApp">💬</a>
  </body></html>`;
};

async function open(lang, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  await page.setContent(page$(lang));
  return { page, close: () => ctx.close() };
}

const fabBox = (page) => page.$eval('.whatsapp-fab', (el) => {
  const r = el.getBoundingClientRect();
  // clientWidth/clientHeight leave out the scrollbar, which the fixed button sits beside.
  const { clientWidth, clientHeight } = document.documentElement;
  return { w: r.width, h: r.height, left: r.left, right: clientWidth - r.right, bottom: clientHeight - r.bottom };
});

describeInBrowser('WhatsApp FAB size and position, real stylesheets', () => {
  for (const lang of Object.keys(COPY)) {
    const rtl = COPY[lang].dir === 'rtl';

    it(`${lang} @390px: 48x48, 14px from the ${rtl ? 'left' : 'right'} and bottom edges`, async () => {
      const { page, close } = await open(lang, 390);
      const b = await fabBox(page);
      expect([b.w, b.h]).toEqual([48, 48]);
      expect(rtl ? b.left : b.right).toBeCloseTo(14, 0); // subpixel layout: 13.6–14.2 measured
      expect(b.bottom).toBe(14);
      await close();
    });

    it(`${lang} @1024px: unchanged, 56x56 and 22px from the bottom edge`, async () => {
      const { page, close } = await open(lang, 1024);
      const b = await fabBox(page);
      expect([b.w, b.h]).toEqual([56, 56]);
      expect(b.bottom).toBe(22);
      await close();
    });

    for (const width of [320, 390, 1024, 1440]) {
      it(`${lang} @${width}px: at the bottom of the page no footer text is behind the FAB`, async () => {
        const { page, close } = await open(lang, width);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const covered = await page.evaluate(() => {
          const f = document.querySelector('.whatsapp-fab').getBoundingClientRect();
          const hit = [];
          for (const el of document.querySelectorAll('.footer__bottom p, .footer__bottom a')) {
            for (const n of el.childNodes) {
              if (n.nodeType !== 3 || !n.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              for (const r of range.getClientRects()) {
                if (Math.min(r.right, f.right) > Math.max(r.left, f.left) && Math.min(r.bottom, f.bottom) > Math.max(r.top, f.top)) hit.push(n.textContent.trim());
              }
            }
          }
          return hit;
        });
        expect(covered).toEqual([]);
        await close();
      });
    }
  }
});
