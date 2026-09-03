// Official Logo Final Corrective — contract tests for the brand asset
// pipeline (see docs/official-logo-integration.md). Written after two real
// defects shipped in the first version of this work: a dirty alpha matte
// (a translucent gray/green shadow halo baked around the icon, visible on
// white/checkerboard backgrounds) and documentation/code claiming 484x560
// while the actual shipped file was 363x420. These tests exist to make
// both classes of regression fail CI, not just "look fine in a screenshot."
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodePng } from './utils/decodePng.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..'); // artifacts/al-rahma-academy
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'brand');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'attached_assets', 'logo-src');

function readText(relToRoot) {
  return readFileSync(path.join(ROOT, relToRoot), 'utf8');
}

describe('official logo — production assets exist with the real, documented dimensions', () => {
  it('icon.png (transparent) is exactly 484x560 — the file the code/docs actually claim', () => {
    const { width, height } = decodePng(path.join(BRAND, 'icon.png'));
    expect(width).toBe(484);
    expect(height).toBe(560);
  });

  it.each([16, 32, 48, 64, 96, 128, 180, 192, 512])('icon-tile-%ipx.png is exactly %ix%i (square)', (size) => {
    const { width, height } = decodePng(path.join(BRAND, `icon-tile-${size}.png`));
    expect(width).toBe(size);
    expect(height).toBe(size);
  });

  it('icon-tile-512-maskable.png is exactly 512x512', () => {
    const { width, height } = decodePng(path.join(BRAND, 'icon-tile-512-maskable.png'));
    expect(width).toBe(512);
    expect(height).toBe(512);
  });

  it('favicon.ico exists and is a real ICO (not an empty/placeholder file)', () => {
    const icoPath = path.join(PUBLIC, 'favicon.ico');
    expect(existsSync(icoPath)).toBe(true);
    const buf = readFileSync(icoPath);
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type 1 = icon
    expect(buf.readUInt16LE(4)).toBeGreaterThan(0); // at least one image
  });
});

describe('official logo — alpha matte quality (regression guard for the reported halo bug)', () => {
  it('icon.png has zero interior transparent holes not connected to the image border', () => {
    // The original bug was a *halo* (background bleeding partially opaque
    // around the glyph), but a bad matte can just as easily eat holes into
    // the glyph's own dark shading the other direction — this guards both
    // failure directions by construction (see docs §4-5 for why a flood
    // fill, not a flat threshold, is what actually prevents either one).
    const { width, height, data, channels } = decodePng(path.join(BRAND, 'icon.png'));
    const isTransparent = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) isTransparent[i] = data[i * channels + 3] < 40 ? 1 : 0;

    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let qHead = 0, qTail = 0;
    const push = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = y * width + x;
      if (visited[idx] || !isTransparent[idx]) return;
      visited[idx] = 1;
      queue[qTail++] = idx;
    };
    for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
    for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % width, y = Math.floor(idx / width);
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    let holePixels = 0;
    for (let i = 0; i < width * height; i++) if (isTransparent[i] && !visited[i]) holePixels++;
    expect(holePixels).toBe(0);
  });

  it('icon.png has a clean edge — partial-alpha (anti-aliasing) pixels stay a thin rim, not a wide halo', () => {
    // A clean matte's only partial-alpha pixels are the 1-2px anti-aliased
    // edge of the glyph's true silhouette. The reported bug (a soft
    // drop-shadow partially matted in as translucent muddy pixels) showed
    // up as a MUCH larger share of partial-alpha pixels bleeding well
    // beyond the true edge. The clean asset measures ~2.4%; 8% is a
    // generous ceiling that still clearly fails the old, buggy matte.
    const { width, height, data, channels } = decodePng(path.join(BRAND, 'icon.png'));
    const total = width * height;
    let partial = 0;
    for (let i = 0; i < total; i++) {
      const a = data[i * channels + 3];
      if (a > 10 && a < 245) partial++;
    }
    expect(partial / total).toBeLessThan(0.08);
  });
});

describe('official logo — manifest.json icons and purposes', () => {
  const manifest = JSON.parse(readText('public/manifest.json'));

  it('declares a 192px "any" icon backed by a real file', () => {
    const entry = manifest.icons.find((i) => i.sizes === '192x192' && i.purpose === 'any');
    expect(entry).toBeTruthy();
    expect(existsSync(path.join(PUBLIC, entry.src.replace(/^\//, '')))).toBe(true);
  });

  it('declares a 512px "any" icon backed by a real file', () => {
    const entry = manifest.icons.find((i) => i.sizes === '512x512' && i.purpose === 'any');
    expect(entry).toBeTruthy();
    expect(existsSync(path.join(PUBLIC, entry.src.replace(/^\//, '')))).toBe(true);
  });

  it('declares a 512px "maskable" icon backed by a real file', () => {
    const entry = manifest.icons.find((i) => i.purpose === 'maskable');
    expect(entry).toBeTruthy();
    expect(entry.sizes).toBe('512x512');
    expect(existsSync(path.join(PUBLIC, entry.src.replace(/^\//, '')))).toBe(true);
  });

  it('every shortcut icon points at a real file', () => {
    for (const shortcut of manifest.shortcuts) {
      for (const icon of shortcut.icons) {
        expect(existsSync(path.join(PUBLIC, icon.src.replace(/^\//, '')))).toBe(true);
      }
    }
  });
});

describe('official logo — index.html references', () => {
  const html = readText('index.html');

  it('has a real favicon.ico link', () => {
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.ico"/);
  });
  it('has real PNG icon links (16/32/192)', () => {
    expect(html).toMatch(/\/brand\/icon-tile-16\.png/);
    expect(html).toMatch(/\/brand\/icon-tile-32\.png/);
    expect(html).toMatch(/\/brand\/icon-tile-192\.png/);
  });
  it('has a real apple-touch-icon link', () => {
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/brand\/icon-tile-180\.png"/);
  });
  it('the JSON-LD Organization logo points at a real PNG, not the deleted favicon.svg', () => {
    expect(html).toMatch(/"logo":\s*\{\s*"@type":\s*"ImageObject",\s*"url":\s*"https:\/\/al-rahmaacademy\.com\/brand\/icon-tile-512\.png"/);
  });
  it('the splash-screen mark is decorative (alt="" + aria-hidden) since the name renders as adjacent visible text', () => {
    const match = html.match(/<img class="alr-mark"[^>]*>/);
    expect(match).toBeTruthy();
    expect(match[0]).toMatch(/alt=""/);
    expect(match[0]).toMatch(/aria-hidden="true"/);
  });
});

describe('official logo — zero live references to the deleted favicon.svg', () => {
  it('public/favicon.svg does not exist', () => {
    expect(existsSync(path.join(PUBLIC, 'favicon.svg'))).toBe(false);
  });

  it.each([
    'index.html',
    'public/manifest.json',
    'public/sw.js',
    'src/pages/BlogPost.jsx',
    'src/pages/tools/PrayerTimesPage.jsx',
  ])('%s does not reference favicon.svg', (rel) => {
    expect(readText(rel)).not.toMatch(/favicon\.svg/);
  });
});

describe('official logo — no orphan WebP (the WebP decision: removed, not wired up)', () => {
  it('public/brand contains no .webp files', () => {
    const files = readdirSync(BRAND);
    const webps = files.filter((f) => f.endsWith('.webp'));
    expect(webps).toEqual([]);
  });
});

describe('official logo — the four original source images', () => {
  const sources = [
    'logo-icon-tile.png',
    'logo-vertical-bismillah.png',
    'logo-horizontal-bismillah.png',
    'logo-horizontal-compact.png',
  ];

  it.each(sources)('%s exists in the tracked source/archive folder', (file) => {
    expect(existsSync(path.join(SOURCE_DIR, file))).toBe(true);
  });

  it.each(sources)('%s is git-tracked (not just present on disk, untracked)', (file) => {
    const rel = path.relative(REPO_ROOT, path.join(SOURCE_DIR, file)).split(path.sep).join('/');
    const out = execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out.trim()).toBe(rel);
  });

  it.each(sources)('%s is not present anywhere under public/ (never shipped to site visitors)', (file) => {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (walk(full)) return true; }
        else if (entry.name === file) return true;
      }
      return false;
    };
    expect(walk(PUBLIC)).toBe(false);
  });
});

describe('official logo — public/brand contains exactly the documented file set (no drift, no leftovers)', () => {
  it('lists exactly the expected files, nothing extra and nothing missing', () => {
    const expected = [
      'icon.png',
      'icon-tile-16.png', 'icon-tile-32.png', 'icon-tile-48.png', 'icon-tile-64.png',
      'icon-tile-96.png', 'icon-tile-128.png', 'icon-tile-180.png', 'icon-tile-192.png',
      'icon-tile-512.png', 'icon-tile-512-maskable.png',
    ].sort();
    const actual = readdirSync(BRAND).sort();
    expect(actual).toEqual(expected);
  });
});
