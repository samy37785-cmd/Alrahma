import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Multilingual llms.txt accuracy: public/llms.txt is a short hand-picked guide, and
// sitemap.xml is the exhaustive list. Every page link in llms.txt must be a page that is
// genuinely published (manifest status 'published') and listed in the sitemap, in the
// language its URL prefix says. Local files only: no network access.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://al-rahmaacademy.com';
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const txt = read('public', 'llms.txt');
const sitemapLocs = [...read('public', 'sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const published = PRERENDER_MANIFEST.filter((e) => e.status === 'published');
const LOCALES = ['en', 'ar', 'fr', 'it'];

const canonicalFor = (route, locale) => (locale === 'en' ? ORIGIN + route : `${ORIGIN}/${locale}${route === '/' ? '/' : route}`);
const publishedCanonicals = new Map(published.map((e) => [canonicalFor(e.route, e.locale), e]));

// Parse an absolute llms.txt URL back to {locale, route}.
function parse(url) {
  const p = new URL(url).pathname;
  const m = p.match(/^\/(ar|fr|it|es|de)(\/.*)?$/);
  return m ? { locale: m[1], route: m[2] || '/' } : { locale: 'en', route: p };
}

const allUrls = [...txt.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0]);
const linkUrls = [...txt.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
// Page links: every markdown link. The bare origin line and the sitemap URL are the only non-page URLs.
const pageUrls = linkUrls;

describe('public/llms.txt: published-route integrity', () => {
  it('exists and is not empty', () => {
    expect(txt.trim().length).toBeGreaterThan(200);
    expect(txt.startsWith('# Al-Rahma Academy')).toBe(true);
  });

  it('every URL is https on al-rahmaacademy.com, with no query, hash or doubled slash', () => {
    for (const u of allUrls) {
      const parsed = new URL(u);
      expect(parsed.protocol, u).toBe('https:');
      expect(parsed.host, u).toBe('al-rahmaacademy.com');
      expect(parsed.search, u).toBe('');
      expect(parsed.hash, u).toBe('');
      expect(parsed.pathname, u).not.toMatch(/\/\/|\s/);
    }
  });

  it('page links are unique', () => {
    expect(new Set(pageUrls).size).toBe(pageUrls.length);
  });

  it('the only URLs outside the markdown page links are the canonical origin line and the sitemap', () => {
    const outside = allUrls.filter((u) => !linkUrls.includes(u));
    expect(new Set(outside)).toEqual(new Set([ORIGIN, SITEMAP_URL]));
  });

  it('the sitemap link is present and points at the real sitemap file', () => {
    expect(txt).toContain(SITEMAP_URL);
    expect(sitemapLocs.length).toBeGreaterThan(0);
  });

  it('every page link is in sitemap.xml and is a published PRERENDER_MANIFEST route, with canonical, language and path in agreement', () => {
    expect(pageUrls.length).toBeGreaterThan(0);
    for (const u of pageUrls) {
      expect(sitemapLocs, `${u} must be in sitemap.xml`).toContain(u);
      const entry = publishedCanonicals.get(u);
      expect(entry, `${u} must be a published manifest route whose canonical is exactly this URL`).toBeTruthy();
      const { locale, route } = parse(u);
      expect(entry.locale).toBe(locale);
      expect(entry.route).toBe(route);
      expect(entry.indexable).not.toBe(false);
    }
  });

  it('links one landing page per published language: en, ar, fr, it', () => {
    for (const u of [`${ORIGIN}/`, `${ORIGIN}/ar/`, `${ORIGIN}/fr/`, `${ORIGIN}/it/`]) {
      expect(pageUrls, u).toContain(u);
    }
    const localesLinked = new Set(pageUrls.map((u) => parse(u).locale));
    expect([...localesLinked].sort()).toEqual([...LOCALES].sort());
  });

  it('the published-language set in the manifest is exactly en, ar, fr, it (so the text stays truthful)', () => {
    expect(new Set(published.map((e) => e.locale))).toEqual(new Set(LOCALES));
    for (const l of ['English', 'Arabic', 'French', 'Italian']) expect(txt).toContain(l);
  });

  it('never links an unpublished English route, es, de, or a private area', () => {
    const enPublished = new Set(published.filter((e) => e.locale === 'en').map((e) => e.route));
    for (const u of pageUrls) {
      const { locale, route } = parse(u);
      expect(['es', 'de'], u).not.toContain(locale);
      if (locale === 'en') expect(enPublished.has(route), `${u} is not a published English route`).toBe(true);
    }
    for (const r of ['/enroll', '/tools/quran-reader', '/tools/hadith', '/tools/prayer-times', '/tools/verse-of-the-day', '/resources/blog']) {
      expect(pageUrls, r).not.toContain(ORIGIN + r);
    }
    expect(txt).not.toMatch(/\/(es|de)\//);
    expect(txt).not.toMatch(/(Spanish|German)/i);
    const disallowed = [...read('public', 'robots.txt').matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
    expect(disallowed.length).toBeGreaterThan(0);
    for (const u of pageUrls) {
      const { route } = parse(u);
      for (const d of disallowed) expect(route.startsWith(d), `${u} is under robots Disallow ${d}`).toBe(false);
    }
    expect(txt).not.toMatch(/\/(admin|dashboard|billing|profile|messages|login|register|payment)\b/);
  });

  it('every link under a language section carries that language prefix', () => {
    const sections = txt.split(/^## /m).slice(1);
    const want = { 'Arabic (': 'ar', 'French (': 'fr', 'Italian (': 'it' };
    for (const sec of sections) {
      const hit = Object.entries(want).find(([k]) => sec.startsWith(k));
      if (!hit) continue;
      const urls = [...sec.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
      expect(urls.length).toBeGreaterThan(0);
      for (const u of urls) expect(parse(u).locale, u).toBe(hit[1]);
    }
    for (const sec of sections.filter((s) => /\(English\)/.test(s.split('\n')[0]))) {
      for (const m of sec.matchAll(/\]\(([^)]+)\)/g)) expect(parse(m[1]).locale, m[1]).toBe('en');
    }
  });

  it('no stale or hardcoded page counts', () => {
    expect(txt).not.toMatch(/29 pages/i);
    expect(txt).not.toMatch(/one of \d+/i);
    expect(txt).not.toMatch(/\b\d{2,3}\s+(pages?|URLs?|routes?)\b/i);
    expect(txt).not.toMatch(/\b(pages?|URLs?)\s*[:=]\s*\d+/i);
    expect(txt).not.toMatch(/pre-?rendered/i);
  });

  it('makes no AI-visibility, ranking, accreditation or guarantee claims', () => {
    expect(txt).not.toMatch(/ChatGPT|OpenAI|Gemini|Copilot|Perplexity|Bard|AI search|AI engines?|appears? in|featured in|cited by|recommended by|visible in/i);
    expect(txt).not.toMatch(/\bbest\b|#1|number one|leading|accredited|guarantee|\d[\d,]*\+?\s+(students|countries)/i);
  });

  it('keeps the existing trial, contact and canonical facts', () => {
    expect(txt).toMatch(/one free 60-minute trial lesson/i);
    expect(txt).toContain('WhatsApp: +20 103 955 3264');
    expect(txt).toContain('Email: alrahmaacademy038@gmail.com');
    expect(txt).toContain('Canonical domain: https://al-rahmaacademy.com');
  });

  it('sitemap.xml and the manifest agree with each other (llms.txt did not change either)', () => {
    expect(new Set(sitemapLocs)).toEqual(new Set(publishedCanonicals.keys()));
    expect(sitemapLocs.length).toBe(published.length);
    expect(new Set(sitemapLocs).size).toBe(sitemapLocs.length);
  });
});
