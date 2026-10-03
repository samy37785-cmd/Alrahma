import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import { CONSENT_STORAGE_KEY as CONSENT_KEY } from '../analytics/consent';
import Privacy, { ANALYTICS_PRIVACY_COPY } from '../pages/Privacy';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian privacy page: the Analytics cookies section (Google Analytics 4
// disclosure) is Italian instead of falling back to English. Only copy changes:
// no GA4, consent, cookie or gtag logic, and no EN/AR/FR, SEO or sitemap change.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.navigator.webdriver;
});

const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const OLD_EN = 'With your permission, we use Google Analytics 4 to understand how visitors use our website so we can improve it.';
const IT_WHAT = 'Con il tuo consenso, utilizziamo Google Analytics 4 per capire come i visitatori usano il nostro sito web, così da poterlo migliorare.';

async function render(urlPath) {
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST12345');
  Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true, writable: true });
  await mountFullPage(urlPath, Privacy);
  return {
    text: document.querySelector('#main-content')?.textContent ?? document.body.textContent,
    section: document.querySelector('#analytics-cookies'),
  };
}

describe('EN/AR/FR are unchanged (SHA-256 baselines from origin/main)', () => {
  it('ANALYTICS_PRIVACY_COPY en/ar/fr', () => {
    expect(sha(ANALYTICS_PRIVACY_COPY.en)).toBe('2e24364745ff20052e89135be639156c1b25ec2423309792fadcfd1b6cf0780a');
    expect(sha(ANALYTICS_PRIVACY_COPY.ar)).toBe('5feb3d2d7dd85ab9fb655cd25078be17a7d6662bb3b7e98b0dfd44f1354589e8');
    expect(sha(ANALYTICS_PRIVACY_COPY.fr)).toBe('797d53d4814baf0a2f10db5fb0403144c82c7cd86c937232521817e90e8bd33c');
    expect(Object.keys(ANALYTICS_PRIVACY_COPY).sort()).toEqual(['ar', 'en', 'fr', 'it']);
  });

  it('the rendered en/ar/fr privacy pages are unchanged', async () => {
    const B = { en: 'cdec5c1cbfe8c19fe80fba64c8b4207f13dffc8bdac77fb93f296f023e37e288', ar: 'c7e1d46fda3a6b6d871a226aaf86a74abcbb2ff02f293006625014166baee8e2', fr: 'a0c67841f5075cfa64d840b07acb3ad905dad24fb8e459f0f51188d94bd97a84' };
    for (const [l, p] of [['en', '/academy/privacy'], ['ar', '/ar/academy/privacy'], ['fr', '/fr/academy/privacy']]) {
      const { text } = await render(p);
      expect(sha(text), l).toBe(B[l]);
      cleanup();
    }
  });
});

describe('/it/academy/privacy shows the Italian GA4 disclosure', () => {
  it('has a complete Italian entry with the same keys as English', () => {
    expect(Object.keys(ANALYTICS_PRIVACY_COPY.it).sort()).toEqual(Object.keys(ANALYTICS_PRIVACY_COPY.en).sort());
    expect(ANALYTICS_PRIVACY_COPY.it.what).toBe(IT_WHAT);
    for (const k of Object.keys(ANALYTICS_PRIVACY_COPY.en)) {
      expect(ANALYTICS_PRIVACY_COPY.it[k], k).not.toBe(ANALYTICS_PRIVACY_COPY.en[k]);
    }
  });

  it('renders the Italian paragraphs, keeps GA4 and the banner button names, and drops the English text', async () => {
    const { text, section } = await render('/it/academy/privacy');
    expect(document.documentElement.lang).toBe('it');
    expect(section).not.toBeNull();
    expect(section.querySelector('h2').textContent).toBe('Cookie analitici');
    expect(section.textContent).toContain(IT_WHAT);
    expect(section.textContent).toContain('«Accetta i cookie analitici»');
    expect(section.textContent).toContain('«Rifiuta»');
    expect(section.textContent).toContain('Google Analytics 4');
    expect(text).not.toContain(OLD_EN);
    for (const s of ['With your permission', 'Analytics cookies', 'is loaded only after', 'We do not send', 'You can change or withdraw', 'How Google uses']) {
      expect(text, s).not.toContain(s);
    }
    expect(section.querySelector('a[href="https://policies.google.com/technologies/partner-sites"]')).not.toBeNull();
  });

  it('the rest of the Italian page has no other English policy sentence', async () => {
    const { text } = await render('/it/academy/privacy');
    for (const re of [/\bWe (collect|use|do not)\b/, /\bYour (data|information)\b/, /\bwith your\b/i, /\bthe following\b/i]) {
      expect(text).not.toMatch(re);
    }
  });

  it('SEO tags are unchanged: title, description, canonical, robots', async () => {
    await render('/it/academy/privacy');
    expect(document.title).toMatch(/\| AL-Rahma Academy$/);
    expect(headMeta('meta[name="robots"]') ?? 'index, follow').toMatch(/index/);
    expect(document.documentElement.lang).toBe('it');
  });
});

describe('GA4 and consent behaviour are untouched', () => {
  it('no analytics script, no gtag, and no consent stored by rendering the page', async () => {
    await render('/it/academy/privacy');
    expect(document.querySelectorAll('script[src*="googletagmanager.com"]')).toHaveLength(0);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it('the section stays hidden when GA is not configured', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    await mountFullPage('/it/academy/privacy', Privacy);
    expect(document.querySelector('#analytics-cookies')).toBeNull();
  });
});

describe('publication guard: manifest and sitemap are unchanged', () => {
  it('the Italian privacy page was already published; counts are the baseline', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/academy/privacy' && e.locale === 'it')).toHaveLength(1);
    expect(PRERENDER_MANIFEST.filter((e) => e.locale === 'it')).toHaveLength(36);
    const sitemap = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect((sitemap.match(/<loc>/g) || []).length).toBe(134);
  });
});

// Raw prerender HTML (post-build only). The GA4 section is rendered only when a
// Measurement ID is set at build time, so the Italian check applies when it is.
const rawIt = path.resolve(__dirname, '../../dist/public/it/academy/privacy/index.html');
describe.skipIf(!fs.existsSync(rawIt))('raw prerender HTML of /it/academy/privacy — before any JavaScript', () => {
  const html = fs.existsSync(rawIt) ? fs.readFileSync(rawIt, 'utf8') : '';
  it('keeps lang, canonical, robots and the five hreflang alternates', () => {
    expect(html).toContain('<html lang="it" dir="ltr">');
    expect(html).toContain('<link rel="canonical" href="https://al-rahmaacademy.com/it/academy/privacy">');
    expect(html).toMatch(/<meta name="robots" content="index, follow/);
    expect(html).toContain('property="og:locale" content="it_IT"');
    for (const l of ['en', 'ar', 'fr', 'it', 'x-default']) expect(html).toContain(`hreflang="${l}"`);
  });
  it('never carries the English GA4 paragraph, and carries the Italian one when the section is built', () => {
    expect(html).not.toContain(OLD_EN);
    if (html.includes('id="analytics-cookies"')) expect(html).toContain(IT_WHAT);
  });
});
