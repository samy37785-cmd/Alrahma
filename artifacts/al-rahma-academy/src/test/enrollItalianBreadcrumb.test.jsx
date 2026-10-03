import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Enroll from '../pages/Enroll';
import itl from '../i18n/it';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Enroll breadcrumb prerequisite: /it/enroll now renders the same
// visually-hidden breadcrumb as /fr/enroll, which also writes the BreadcrumbList
// JSON-LD that scripts/prerender.mjs's waitForHydratedSeo() requires on every
// non-Home route. en and ar are unchanged. Nothing is published here.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();

const submitEnrollment = vi.fn();
vi.mock('../api/enrollmentApi', () => ({ submitEnrollment: (...a) => submitEnrollment(...a) }));
const fetchMock = vi.fn(() => Promise.reject(new Error('network disabled in test')));

const sha = (s) => createHash('sha256').update(s).digest('hex');
function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true, writable: true });
}
const crumbScripts = () => [...document.querySelectorAll('script[data-seo="breadcrumb"]')];
const crumb = () => JSON.parse(crumbScripts()[0].textContent);
const visibleTrail = () => document.querySelectorAll('.sr-only nav, .sr-only .breadcrumbs, .sr-only [aria-label]');
async function snapshot(urlPath) {
  setWebdriver(true);
  await mountFullPage(urlPath, Enroll);
  const state = {
    body: document.body.innerHTML,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).sort(),
  };
  cleanup();
  return sha(JSON.stringify(state));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  submitEnrollment.mockClear();
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.navigator.webdriver;
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});

describe('/it/enroll writes an Italian BreadcrumbList', () => {
  it('has exactly one breadcrumb script, valid JSON, in order, with Italian names and Italian URLs', async () => {
    setWebdriver(true);
    await mountFullPage('/it/enroll', Enroll);
    expect(crumbScripts()).toHaveLength(1);
    const ld = crumb();
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    // The names come from the existing i18n, not from a hard-coded string.
    expect(ld.itemListElement.map((i) => i.name)).toEqual([itl.nav.home, itl.nav.trial]);
    expect(ld.itemListElement.map((i) => i.name)).toEqual(['Pagina iniziale', 'Prova gratuita']);
    expect(ld.itemListElement.map((i) => i.item)).toEqual(['https://al-rahmaacademy.com/it/', 'https://al-rahmaacademy.com/it/enroll']);
  });

  it('renders one visually-hidden Italian trail: Italian labels, a link home to /it/, no English fallback', async () => {
    setWebdriver(true);
    await mountFullPage('/it/enroll', Enroll);
    const hidden = document.querySelectorAll('.sr-only');
    expect(hidden).toHaveLength(1);
    const text = hidden[0].textContent;
    expect(text).toContain('Pagina iniziale');
    expect(text).toContain('Prova gratuita');
    expect(text).not.toMatch(/Home|Free Trial|Book/);
    expect(hidden[0].querySelector('a').getAttribute('href')).toBe('/it/');
    expect(visibleTrail().length).toBeGreaterThan(0);
  });

  it('never duplicates: StrictMode and rerender keep one script and one trail', async () => {
    setWebdriver(true);
    await mountFullPage('/it/enroll', () => (
      <StrictMode>
        <Enroll />
      </StrictMode>
    ));
    await act(async () => {});
    expect(crumbScripts()).toHaveLength(1);
    expect(document.querySelectorAll('.sr-only')).toHaveLength(1);
    expect(crumb().itemListElement).toHaveLength(2);
  });
});

describe('the form is untouched on /it/enroll', () => {
  it('prerender capture: every field empty, timezone empty, no network, no submit', async () => {
    setWebdriver(true);
    await mountFullPage('/it/enroll', Enroll);
    for (const el of document.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main textarea')) {
      expect(el.value, el.className || el.placeholder || el.id).toBe('');
    }
    expect(document.querySelector('input.field__readonly').value).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submitEnrollment).not.toHaveBeenCalled();
    expect(document.querySelector('h1').textContent).toBe('Iscriviti ad Al-Rahma Academy');
  });
});

describe('fr, en and ar are unchanged (SHA-256 of the rendered DOM and JSON-LD, from origin/main)', () => {
  it('/fr/enroll still writes its French breadcrumb exactly as before', async () => {
    setWebdriver(true);
    await mountFullPage('/fr/enroll', Enroll);
    expect(crumbScripts()).toHaveLength(1);
    expect(crumb().itemListElement.map((i) => i.name)).toEqual(['Accueil', 'Essai gratuit']);
    cleanup();
    expect(await snapshot('/fr/enroll')).toBe('a4d90cbf2a71a1dafa1b84ffc29b967570e35930a0c246239d7445c1333c6b0f');
  });

  it('/enroll (en) and /ar/enroll render no breadcrumb, and are byte-identical to before', async () => {
    for (const p of ['/enroll', '/ar/enroll']) {
      setWebdriver(true);
      await mountFullPage(p, Enroll);
      expect(crumbScripts(), p).toHaveLength(0);
      expect(document.querySelectorAll('.sr-only'), p).toHaveLength(0);
      cleanup();
    }
    expect(await snapshot('/enroll')).toBe('180e13b09a0617ebd9b9f4d0a3add0bfd6d36fc8c441b07eecf06df16e6d6373');
    expect(await snapshot('/ar/enroll')).toBe('c29703bb40048d6ed2c4141c3463cf79f9739b9b4113f7e34845c43ba46ea43a');
  });
});

describe('publication state', () => {
  it('/it/enroll is published (final SEO publication) with exactly one sitemap URL; the sitemap equals the published manifest', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(1);
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect((xml.match(/https:\/\/al-rahmaacademy\.com\/it\/enroll</g) || [])).toHaveLength(1);
    expect((xml.match(/<loc>/g) || []).length).toBe(PRERENDER_MANIFEST.filter((e) => e.status === 'published').length);
  });
});
