// Minimal pure-Node PNG decoder (no dependency — `sharp` is deliberately not
// a project dependency; see docs/official-logo-integration.md §4). Supports
// exactly what the brand assets actually need to be verified: 8-bit-depth,
// non-interlaced, color type 2 (RGB) or 6 (RGBA). Not a general-purpose
// decoder — anything else throws rather than silently producing wrong pixels.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(filePath) {
  const buf = readFileSync(filePath);
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${filePath}: not a PNG (bad signature)`);

  let offset = 8;
  let width, height, bitDepth, colorType;
  const idatChunks = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf.readUInt8(dataStart + 8);
      colorType = buf.readUInt8(dataStart + 9);
      const interlace = buf.readUInt8(dataStart + 12);
      if (bitDepth !== 8) throw new Error(`${filePath}: unsupported bit depth ${bitDepth} (only 8 supported)`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`${filePath}: unsupported color type ${colorType} (only RGB=2/RGBA=6 supported)`);
      if (interlace !== 0) throw new Error(`${filePath}: interlaced PNGs not supported`);
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip CRC
  }
  if (width === undefined) throw new Error(`${filePath}: no IHDR chunk found`);

  const srcChannels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * srcChannels;
  const out = Buffer.alloc(width * height * 4); // always normalize to RGBA output

  const prevRow = Buffer.alloc(stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]; rawOffset++;
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const curRow = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = row[x];
      const a = x >= srcChannels ? curRow[x - srcChannels] : 0;
      const b = prevRow[x];
      const c = x >= srcChannels ? prevRow[x - srcChannels] : 0;
      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = (rawByte + a) & 0xff; break;
        case 2: value = (rawByte + b) & 0xff; break;
        case 3: value = (rawByte + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: value = (rawByte + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`${filePath}: unsupported filter type ${filterType}`);
      }
      curRow[x] = value;
    }
    for (let x = 0; x < width; x++) {
      const si = x * srcChannels;
      const oi = (y * width + x) * 4;
      out[oi] = curRow[si];
      out[oi + 1] = curRow[si + 1];
      out[oi + 2] = curRow[si + 2];
      out[oi + 3] = srcChannels === 4 ? curRow[si + 3] : 255;
    }
    curRow.copy(prevRow);
  }

  return { width, height, data: out, channels: 4 };
}
