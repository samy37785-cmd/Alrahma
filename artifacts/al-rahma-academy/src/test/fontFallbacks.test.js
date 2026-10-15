import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// #250 part 2: metric-matched fallback faces stop the Poppins/Playfair swap from
// re-wrapping text (CLS). They must never touch Arabic text or RTL.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = path.resolve(__dirname, '../styles');
const css = fs.readFileSync(path.join(styles, 'font-fallbacks.css'), 'utf8');
const tokens = fs.readFileSync(path.join(styles, 'tokens.css'), 'utf8');
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);

const ranges = (face) =>
  face.match(/unicode-range:\s*([^;]+);/)[1].split(',').map((r) => {
    const [a, b = a] = r.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(a, 16), parseInt(b, 16)];
  });
const covers = (face, cp) => ranges(face).some(([a, b]) => cp >= a && cp <= b);

describe('font-fallbacks.css', () => {
  it('declares the six fallback faces, each a local font with size-adjust', () => {
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      expect(face).toMatch(/src:\s*local\(/);
      expect(face).toMatch(/size-adjust:\s*\d+(\.\d+)?%/);
      expect(face).not.toMatch(/url\(/); // nothing is downloaded
    }
  });

  it('no face covers Arabic letters, Arabic digits or the direction/joining marks', () => {
    const forbidden = [
      0x0600, 0x0627, 0x0644, 0x0661, 0x06f0, 0x06ff, // Arabic block
      0x0750, 0x08a0, 0xfb50, 0xfdf2, 0xfe70, 0xfefc, // Arabic supplements and presentation forms
      0x200b, 0x200c, 0x200d, 0x200e, 0x200f, // ZWSP, ZWNJ, ZWJ, LRM, RLM
      0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // embedding/override marks
      0x2066, 0x2067, 0x2068, 0x2069, // isolates
    ];
    for (const face of faces) for (const cp of forbidden) expect(covers(face, cp), cp.toString(16)).toBe(false);
  });

  it('every face covers basic and accented Latin (é, à, ç, œ)', () => {
    for (const face of faces) for (const ch of 'Aaéàçœ') expect(covers(face, ch.codePointAt(0)), ch).toBe(true);
  });

  it('the font stacks put the fallbacks right after the web fonts', () => {
    expect(tokens).toMatch(/--font-sans:\s*"Poppins", "Poppins Fallback", "Poppins Fallback Android",/);
    expect(tokens).toMatch(/--font-serif-display:\s*"Playfair Display", "Playfair Fallback", "Playfair Fallback Android",/);
  });
});
