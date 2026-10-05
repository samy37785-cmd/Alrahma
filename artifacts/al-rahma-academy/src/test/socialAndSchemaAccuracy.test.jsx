import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import FAQ from '../pages/FAQ';
import { PRERENDER_MANIFEST, canonicalUrlFor } from '../../scripts/prerender-routes.mjs';

// Social image and structured-data accuracy.
//  - og:image / twitter:image must be a raster PNG (Facebook, LinkedIn, WhatsApp and X do not render SVG).
//  - WebSite.inLanguage lists only the languages the site is published in (en, ar, it, fr); Spanish and German
//    have no published interface. Organization.availableLanguage is a teaching-language fact (the Italian hero
//    and the Islamic Studies data both list Spanish and German) and is intentionally left as it was.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist/public');
const distExists = fs.existsSync(DIST);
useFullPageEnvironment();

const PNG_URL = 'https://al-rahmaacademy.com/og-cover.png';
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (html) => jsonLd(html).flatMap((j) => (Array.isArray(j['@graph']) ? j['@graph'] : [j]));

describe('og-cover.png', () => {
  const file = path.join(ROOT, 'public/og-cover.png');
  it('is a real 1200x630 PNG, not huge', () => {
    const b = fs.readFileSync(file);
    expect([...b.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(b.readUInt32BE(16)).toBe(1200);
    expect(b.readUInt32BE(20)).toBe(630);
    expect(b.length).toBeGreaterThan(20_000);
    expect(b.length).toBeLessThan(300_000);
  });
  it('the SVG source stays for internal use', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/og-cover.svg'))).toBe(true);
  });
});

describe('index.html (shared by every prerendered page)', () => {
  it('og:image, twitter:image and the organisation image are the PNG; declared as image/png 1200x630', () => {
    expect(indexHtml).toContain(`<meta property="og:image"        content="${PNG_URL}" />`);
    expect(indexHtml).toContain(`<meta property="og:image:type"   content="image/png" />`);
    expect(indexHtml).toContain('<meta property="og:image:width"  content="1200" />');
    expect(indexHtml).toContain('<meta property="og:image:height" content="630" />');
    expect(indexHtml).toContain(`<meta name="twitter:image"       content="${PNG_URL}" />`);
    expect(indexHtml).not.toMatch(/og-cover\.svg/);
    const org = nodes(indexHtml).find((n) => n['@type']?.includes?.('EducationalOrganization') || n['@type'] === 'EducationalOrganization');
    expect(org.image).toBe(PNG_URL);
  });

  it('WebSite.inLanguage lists only the published interface languages', () => {
    const site = nodes(indexHtml).find((n) => n['@type'] === 'WebSite');
    expect(site.inLanguage).toEqual(['en', 'ar', 'it', 'fr']);
  });

  it('Organization.availableLanguage (teaching languages) is untouched, Spanish and German included', () => {
    const org = nodes(indexHtml).find((n) => n.availableLanguage);
    expect(org.availableLanguage).toEqual(['English', 'Arabic', 'Italian', 'Spanish', 'German', 'French']);
  });

  it('the published languages in the manifest are exactly en, ar, fr, it (so es/de really are unpublished)', () => {
    expect([...new Set(PRERENDER_MANIFEST.filter((e) => e.status === 'published').map((e) => e.locale))].sort()).toEqual(['ar', 'en', 'fr', 'it']);
  });
});

describe('runtime head tags (hydration)', () => {
  it('a page that sets no image gets the PNG for og:image and twitter:image', async () => {
    await mountFullPage('/it/resources/faq', FAQ);
    expect(headMeta('meta[property="og:image"]')).toBe(PNG_URL);
    expect(headMeta('meta[name="twitter:image"]')).toBe(PNG_URL);
  });
});

describe.skipIf(!distExists)('prerendered output (dist/public), every published page', () => {
  const pages = PRERENDER_MANIFEST.filter((e) => e.status === 'published');
  const file = (e) => path.join(DIST, new URL(canonicalUrlFor(e)).pathname, 'index.html');

  it('the PNG is copied to the site root', () => {
    expect(fs.existsSync(path.join(DIST, 'og-cover.png'))).toBe(true);
  });

  it('all 134 pages: PNG social image, no SVG social image, WebSite languages en/ar/it/fr', () => {
    expect(pages).toHaveLength(134);
    const bad = [];
    for (const e of pages) {
      const html = fs.readFileSync(file(e), 'utf8');
      const og = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
      const tw = html.match(/<meta name="twitter:image" content="([^"]*)"/)?.[1];
      if (og !== PNG_URL || tw !== PNG_URL) bad.push(`${e.locale}${e.route} image ${og} ${tw}`);
      if (/og-cover\.svg/.test(html)) bad.push(`${e.locale}${e.route} still references the svg`);
      const site = nodes(html).find((n) => n['@type'] === 'WebSite');
      if (JSON.stringify(site?.inLanguage) !== JSON.stringify(['en', 'ar', 'it', 'fr'])) bad.push(`${e.locale}${e.route} WebSite.inLanguage ${JSON.stringify(site?.inLanguage)}`);
      const org = nodes(html).find((n) => n.availableLanguage);
      if (JSON.stringify(org?.availableLanguage) !== JSON.stringify(['English', 'Arabic', 'Italian', 'Spanish', 'German', 'French'])) bad.push(`${e.locale}${e.route} availableLanguage changed`);
    }
    expect(bad).toEqual([]);
  });
});
