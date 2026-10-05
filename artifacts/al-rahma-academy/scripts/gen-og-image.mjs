// Manual tool (NOT part of build/CI): rasterises public/og-cover.svg to public/og-cover.png (1200x630).
//
// Facebook, LinkedIn, WhatsApp and X do not render SVG as an og:image, so the social image has to be a
// raster file. The SVG names Cinzel / Cairo / Amiri, which a bare renderer would replace with fallbacks;
// this script loads the same self-hosted @fontsource files the app ships, so the PNG matches the brand.
//
//   node scripts/gen-og-image.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(pathToFileURL(path.join(root, 'package.json')));
const font = (pkg, file) => readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`)).toString('base64');

const svg = readFileSync(path.join(root, 'public/og-cover.svg'), 'utf8');
const css = `
@font-face{font-family:Cinzel;font-weight:700;src:url(data:font/woff2;base64,${font('cinzel', 'cinzel-latin-700-normal.woff2')}) format('woff2')}
@font-face{font-family:Cairo;font-weight:700;src:url(data:font/woff2;base64,${font('cairo', 'cairo-arabic-700-normal.woff2')}) format('woff2')}
@font-face{font-family:Amiri;font-weight:400;src:url(data:font/woff2;base64,${font('amiri', 'amiri-arabic-400-normal.woff2')}) format('woff2')}
html,body{margin:0;background:#0c3834}svg{display:block;width:1200px;height:630px}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  writeFileSync(path.join(root, 'public/og-cover.png'), png);
  console.log(`wrote public/og-cover.png (${png.length} bytes)`);
} finally {
  await browser.close();
}
