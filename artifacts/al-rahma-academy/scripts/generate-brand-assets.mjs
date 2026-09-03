// Official logo asset pipeline. See docs/official-logo-integration.md for
// the full rationale (why this matte algorithm, why this canonical source,
// what was tried and rejected). Not wired into `pnpm build` — a manual,
// one-off tool, run only when the source art in attached_assets/logo-src/
// changes.
//
// Requires `sharp`, installed in an isolated scratch dir — NOT a project
// dependency (this is a rarely-run offline tool, not a runtime/build one).
// Node's ESM resolver won't find a scratch-dir install from this file's own
// location, so copy the script alongside the scratch install and point it
// at the real repo root explicitly (tested, working sequence):
//
//   mkdir /tmp/brand-tools && cd /tmp/brand-tools
//   npm init -y && npm install sharp --no-save
//   cp /path/to/artifacts/al-rahma-academy/scripts/generate-brand-assets.mjs .
//   BRAND_REPO_ROOT=/path/to/artifacts/al-rahma-academy node generate-brand-assets.mjs
//
// Reads from $BRAND_REPO_ROOT/attached_assets/../attached_assets/logo-src/
// (i.e. the repo's attached_assets/logo-src/, two levels above
// artifacts/al-rahma-academy), writes into $BRAND_REPO_ROOT/public/brand/
// and $BRAND_REPO_ROOT/public/favicon.ico, overwriting what's there.
// BRAND_REPO_ROOT defaults to this file's own ../.. if unset (works when
// run in place, e.g. if sharp is ever made resolvable from the repo itself).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.BRAND_REPO_ROOT
  ? path.resolve(process.env.BRAND_REPO_ROOT)
  : path.resolve(__dirname, '..'); // artifacts/al-rahma-academy
const SRC = path.join(ROOT, '..', '..', 'attached_assets', 'logo-src');
const OUT = path.join(ROOT, 'public', 'brand');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is not installed. Install it in an isolated scratch dir first — see this file\'s header comment.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

function dist(a, b, c, x, y, z) {
  return Math.sqrt((a - x) ** 2 + (b - y) ** 2 + (c - z) ** 2);
}

/**
 * Flood-fill matte: a pixel is classified "background" only if it is
 * color-close to the sampled background AND reachable from the crop's own
 * border through other background-candidate pixels (4-connected BFS).
 *
 * Why not a plain global color-distance threshold: the source renders carry
 * a soft drop-shadow baked into the flat background around the glyph. A
 * global per-pixel distance threshold can't tell that gradual shadow apart
 * from the glyph's own dark gradient shading/outline strokes (both are
 * "somewhat dark, somewhat close to the background color") — it either
 * leaves a muddy translucent shadow halo outside the glyph (threshold too
 * loose) or eats holes into the glyph's own dark shading (threshold too
 * tight). Flood-filling from the border fixes this: the shadow is spatially
 * CONNECTED to the true background, so it gets swept up in the fill; dark
 * shading fully enclosed inside the glyph's own silhouette is never reached
 * by the fill (it can't cross the brighter art around it), so it stays
 * opaque regardless of how dark it is.
 */
async function floodMatte(srcPath, crop, candidateT, featherPx) {
  const img = sharp(srcPath).extract(crop).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const sampleAt = (x, y) => {
    const idx = (y * width + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };
  const corners = [sampleAt(1, 1), sampleAt(width - 2, 1), sampleAt(1, height - 2), sampleAt(width - 2, height - 2)];
  const bg = [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
  ];

  const isCandidate = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const si = i * channels;
    isCandidate[i] = dist(data[si], data[si + 1], data[si + 2], bg[0], bg[1], bg[2]) <= candidateT ? 1 : 0;
  }

  const isBackground = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0, qTail = 0;
  const pushIfCandidate = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (isBackground[idx] || !isCandidate[idx]) return;
    isBackground[idx] = 1;
    queue[qTail++] = idx;
  };
  for (let x = 0; x < width; x++) { pushIfCandidate(x, 0); pushIfCandidate(x, height - 1); }
  for (let y = 0; y < height; y++) { pushIfCandidate(0, y); pushIfCandidate(width - 1, y); }
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % width, y = (idx / width) | 0;
    pushIfCandidate(x + 1, y); pushIfCandidate(x - 1, y);
    pushIfCandidate(x, y + 1); pushIfCandidate(x, y - 1);
  }

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = isBackground[i] ? 0 : 255;

  let maskImg = sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } });
  if (featherPx > 0) maskImg = maskImg.blur(featherPx);
  const { data: featheredRaw, info: maskInfo } = await maskImg.raw().toBuffer({ resolveWithObject: true });
  const mc = maskInfo.channels;
  const feathered = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) feathered[i] = featheredRaw[i * mc];

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const si = i * channels;
    const a = feathered[i] / 255;
    let r = data[si], g = data[si + 1], b = data[si + 2];
    if (a > 0.02 && a < 0.98) {
      r = bg[0] + (r - bg[0]) / a;
      g = bg[1] + (g - bg[1]) / a;
      b = bg[2] + (b - bg[2]) / a;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
    }
    const oi = i * 4;
    out[oi] = Math.round(r);
    out[oi + 1] = Math.round(g);
    out[oi + 2] = Math.round(b);
    out[oi + 3] = feathered[i];
  }
  return { buf: out, width, height };
}

async function trimAlphaBuf(buf, width, height, paddingPct) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = buf[(y * width + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const padX = Math.round((maxX - minX) * paddingPct);
  const padY = Math.round((maxY - minY) * paddingPct);
  const left = Math.max(0, minX - padX), top = Math.max(0, minY - padY);
  const right = Math.min(width, maxX + padX + 1), bottom = Math.min(height, maxY + padY + 1);
  return sharp(buf, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: right - left, height: bottom - top });
}

async function main() {
  // Step 1 — transparent icon-only. Canonical source: logo-vertical-bismillah.png's
  // icon region (highest-resolution icon render among the 3 lockups — see doc §2).
  // candidateT=25 / feather=1.0px chosen empirically — the lowest threshold that
  // fully removes the drop-shadow halo while a border-flood fill keeps zero
  // interior holes in the glyph's own dark shading (see doc §4-6).
  const { buf, width, height } = await floodMatte(
    path.join(SRC, 'logo-vertical-bismillah.png'),
    { left: 316, top: 162, width: 484, height: 560 },
    25, 1.0,
  );
  const iconTrimmed = await trimAlphaBuf(buf, width, height, 0.03);
  const iconMeta = await iconTrimmed.clone().metadata();
  console.log('icon.png final size:', iconMeta.width, 'x', iconMeta.height, '— update BrandIcon.jsx ICON_ASPECT + docs/official-logo-integration.md if this changed');
  await iconTrimmed.clone().png({ compressionLevel: 9 }).toFile(path.join(OUT, 'icon.png'));

  // Step 2 — self-contained tile icon: the same clean glyph composited onto a
  // designer-controlled rounded-square background (color sampled from
  // logo-icon-tile.png's own plate — see doc §2), sized per tier.
  const TILE_BG = { r: 15, g: 58, b: 52 };
  const glyphAspect = iconMeta.width / iconMeta.height;

  async function makeTile(canvas, fillRatio, cornerRatio) {
    const glyphHeight = Math.round(canvas * fillRatio);
    const glyphWidth = Math.round(glyphHeight * glyphAspect);
    const glyphBuf = await iconTrimmed.clone().resize({ width: glyphWidth, height: glyphHeight }).png().toBuffer();
    const r = Math.round(canvas * cornerRatio);
    const maskSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}"><rect width="${canvas}" height="${canvas}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
    );
    const flatBuf = await sharp({ create: { width: canvas, height: canvas, channels: 3, background: TILE_BG } })
      .composite([{ input: glyphBuf, left: Math.round((canvas - glyphWidth) / 2), top: Math.round((canvas - glyphHeight) / 2) }])
      .png().toBuffer();
    const maskBuf = await sharp(maskSvg).resize(canvas, canvas).png().toBuffer();
    return sharp(flatBuf).composite([{ input: maskBuf, blend: 'dest-in' }]).png().toBuffer();
  }

  const BASE = 1024;
  const tileTinyBuf = await makeTile(BASE, 0.86, 0.22); // 16-64px: glyph dominates for legibility
  for (const size of [16, 32, 48, 64]) {
    await sharp(tileTinyBuf).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, `icon-tile-${size}.png`));
  }
  const tileAppBuf = await makeTile(BASE, 0.68, 0.22); // 96-512px: generous app-icon padding
  for (const size of [96, 128, 180, 192, 512]) {
    await sharp(tileAppBuf).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, `icon-tile-${size}.png`));
  }

  // Maskable 512: full-bleed background (no rounded corner baked in — would
  // double up with the OS's own shape mask), glyph inside the ~80% safe zone.
  const maskableCanvas = 640;
  const glyphHeightM = Math.round(maskableCanvas * 0.62);
  const glyphWidthM = Math.round(glyphHeightM * glyphAspect);
  const glyphBufM = await iconTrimmed.clone().resize({ width: glyphWidthM, height: glyphHeightM }).png().toBuffer();
  const maskableBuf = await sharp({ create: { width: maskableCanvas, height: maskableCanvas, channels: 3, background: TILE_BG } })
    .composite([{ input: glyphBufM, left: Math.round((maskableCanvas - glyphWidthM) / 2), top: Math.round((maskableCanvas - glyphHeightM) / 2) }])
    .png().toBuffer();
  await sharp(maskableBuf).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'icon-tile-512-maskable.png'));

  // favicon.ico (16/32/48 multi-res, PNG-in-ICO — supported by all modern
  // browsers/OSes; ICO isn't a sharp output format, so it's written by hand).
  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(icoSizes.map((s) => sharp(tileTinyBuf).resize(s, s).png().toBuffer()));
  writeIco(icoSizes, icoPngs, path.join(ROOT, 'public', 'favicon.ico'));

  console.log('\nDone. Files written to', OUT, 'and', path.join(ROOT, 'public', 'favicon.ico'));
  for (const f of fs.readdirSync(OUT).sort()) {
    const st = fs.statSync(path.join(OUT, f));
    console.log(' ', f, (st.size / 1024).toFixed(1) + 'KB');
  }
}

function writeIco(sizes, pngBuffers, outPath) {
  const count = sizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dirEntries = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += buf.length;
  }
  fs.writeFileSync(outPath, Buffer.concat([header, ...dirEntries, ...pngBuffers]));
}

await main();
