import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BrandIcon from '../components/ui/BrandIcon';

// Official Logo Final Corrective: covers the two accessibility/rendering
// bugs found in review — alt text hard-coded to "Al-Rahma Academy" even
// when nested beside visible text saying the same thing (a screen reader
// announcing the name twice), and a fixed square width/height on the
// non-square (484x560) transparent icon that would have stretched it.

describe('BrandIcon — tile vs transparent asset selection', () => {
  it('tile=true (default) picks a self-contained square icon-tile-*.png, sized >=2x the requested size', () => {
    const { container } = render(<BrandIcon size={34} />);
    const img = container.querySelector('img');
    expect(img.src).toMatch(/\/brand\/icon-tile-\d+\.png$/);
    const pickedSize = Number(img.src.match(/icon-tile-(\d+)\.png$/)[1]);
    expect(pickedSize).toBeGreaterThanOrEqual(34 * 2);
  });

  it('tile=false renders the transparent icon.png', () => {
    const { container } = render(<BrandIcon size={40} tile={false} />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('/brand/icon.png');
  });

  it('never picks a tile size smaller than 2x the requested display size, even for a large size prop', () => {
    const { container } = render(<BrandIcon size={200} />);
    const img = container.querySelector('img');
    // largest available tile is 512 — 200*2=400, so 512 is the correct pick
    expect(img.getAttribute('src')).toBe('/brand/icon-tile-512.png');
  });
});

describe('BrandIcon — no forced-square distortion on the non-square transparent icon', () => {
  it('tile=false sets width/height from the real 484x560 aspect ratio, not a forced square', () => {
    const { container } = render(<BrandIcon size={100} tile={false} />);
    const img = container.querySelector('img');
    const width = Number(img.getAttribute('width'));
    const height = Number(img.getAttribute('height'));
    expect(height).toBe(100);
    expect(width).not.toBe(height); // a square box would silently stretch the 484x560 art
    expect(width).toBe(Math.round(100 * (484 / 560)));
  });

  it('tile=true sets width === height (the tile asset really is square)', () => {
    const { container } = render(<BrandIcon size={48} tile />);
    const img = container.querySelector('img');
    expect(img.getAttribute('width')).toBe(img.getAttribute('height'));
  });
});

describe('BrandIcon — accessible name defaults to meaningful, opts into decorative', () => {
  it('defaults to a meaningful alt when no adjacent text names the brand', () => {
    const { container } = render(<BrandIcon />);
    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('Al-Rahma Academy');
    expect(img.hasAttribute('aria-hidden')).toBe(false);
  });

  it('alt="" makes it decorative (aria-hidden) for use beside visible equivalent text', () => {
    const { container } = render(<BrandIcon alt="" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  });

  it('every real consumer in this app (BrandLockup, DashboardLayout sidebar, InvoiceModal, Brand.jsx) passes alt="" since each renders the name as adjacent visible text — verified by grepping their source, not just this component in isolation', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '..', 'components');
    const files = [
      ['ui/BrandLockup.jsx', /<BrandIcon[^>]*\balt=""/],
      ['layout/DashboardLayout.jsx', /<BrandIcon[^>]*\balt=""/],
      ['ui/InvoiceModal.jsx', /<BrandIcon[^>]*\balt=""/],
      ['layout/Brand.jsx', /<BrandIcon[^>]*\balt=""/],
    ];
    for (const [rel, pattern] of files) {
      const src = readFileSync(path.join(root, rel), 'utf8');
      expect(src, `${rel} should render <BrandIcon alt="" ...>`).toMatch(pattern);
    }
  });
});
