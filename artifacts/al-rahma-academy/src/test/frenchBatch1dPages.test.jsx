import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import { BATCH_1D, collect } from './utils/frenchBatch1dStates';
import ResourcesHub from '../pages/hubs/ResourcesHub';
import ToolsHub from '../pages/hubs/ToolsHub';
import Blog from '../pages/Blog';
import { RESOURCES_SEO_TEXT, RESOURCES_BLOG_TEXT } from '../i18n/resources/content';

// French Localization Batch 1D: /fr/resources, /fr/tools, /fr/tools/prayer
// and /fr/resources/blog render French metadata and French visible/
// accessible text in every state the shared driver reaches, translated from
// the English source only, with the tajwid/ijaza glossary. Nothing leaves
// the browser: the blog API and the free-trial request are mocked. EN/AR
// stay byte-identical: see frenchBatch1dEnArRegression.

vi.mock('../api/blogApi', () => ({ getBlogPosts: vi.fn(), getBlogPost: vi.fn() }));
vi.mock('../api/contentApi', async (orig) => ({ ...(await orig()), submitTrial: vi.fn() }));

useFullPageEnvironment();

let mocks;
beforeEach(async () => {
  const { getBlogPosts } = await import('../api/blogApi');
  const { submitTrial } = await import('../api/contentApi');
  getBlogPosts.mockReset();
  submitTrial.mockReset();
  mocks = { getBlogPosts, submitTrial };
});

// Identical in English and French by nature: the brand, "Qibla" (kept as a
// loanword throughout the French site, including inside French sentences),
// operational e-mail/phone placeholders, and the shared header/footer.
const SAME_IN_FRENCH = new Set([
  'AL-RAHMA', 'ACADEMY', 'AL-Rahma', 'Academy.', 'Copyright ©', 'Adhkar', 'FAQ', 'Blog', 'Contact', 'Ctrl K',
  'Facebook', 'Instagram', 'YouTube', 'TikTok', 'Snapchat', 'WhatsApp',
  'alrahmaacademy038@gmail.com', '+20 103 955 3264', 'you@email.com', '+44 7700 900000',
  'EN', 'AR', 'IT', 'ES', 'DE', 'FR', 'Blog & Articles', 'Qibla',
]);

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  if (SAME_IN_FRENCH.has(value)) return true;
  if (/[؀-ۿ]/.test(value) || !/[A-Za-z]{2}/.test(value)) return true;
  return false;
}

describe('French Batch 1D pages', () => {
  for (const page of BATCH_1D) {
    it(`${page.path}: French metadata in every state; no English left in text or accessibility labels`, async () => {
      const en = await collect(page, '', mocks);
      const fr = await collect(page, '/fr', mocks);
      expect(Object.keys(fr.states)).toEqual(Object.keys(en.states));
      for (const [state, meta] of Object.entries(fr.states)) {
        const where = `${page.key} ${state}`;
        expect(meta.htmlLang, where).toBe('fr');
        expect(meta.htmlDir, where).toBe('ltr');
      }
      // Title/description are set once per page (not per interactive
      // state); check them against the initial state's English values.
      const initial = Object.keys(fr.states)[0];
      const frMeta = fr.states[initial];
      const enMeta = en.states[initial];
      expect(frMeta.title, page.key).not.toBe(enMeta.title);
      expect(frMeta.ogTitle, page.key).toBe(frMeta.title);
      expect(frMeta.twitterTitle, page.key).toBe(frMeta.title);
      if (enMeta.description) {
        expect(frMeta.description, page.key).not.toBe(enMeta.description);
        expect(frMeta.ogDescription, page.key).toBe(frMeta.description);
      }
      const leaks = [...fr.strings].filter((s) => en.strings.has(s) && !isAllowed(s));
      expect(leaks).toEqual([]);
    }, 60000);

    it(`${page.path}: French glossary — no "Tajweed", "Ijazah", "Seerah" or "Aqeedah" in text or metadata`, async () => {
      const fr = await collect(page, '/fr', mocks);
      const meta = Object.values(fr.states).flatMap((m) => [m.title, m.description]);
      const found = [...fr.strings, ...meta].filter((s) => /tajweed|ijazah|seerah|aqeedah/i.test(s));
      expect(found).toEqual([]);
    }, 60000);
  }

  it('/fr/resources: card links keep their English routes (no route/slug change)', async () => {
    await mountFullPage('/fr/resources', ResourcesHub);
    const hrefs = [...document.querySelectorAll('.hub-card')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/fr/resources/blog', '/fr/resources/faq', '/fr/academy/about', '/fr/academy/teachers']);
  });

  it('/fr/tools: the free-trial modal never sends the request; the payload matches English when it does', async () => {
    const payloads = { en: [], fr: [] };
    for (const prefix of ['', '/fr']) {
      mocks.submitTrial.mockReset();
      await mountFullPage(`${prefix}/tools`, ToolsHub);
      fireEvent.click(document.querySelector('.tools-enroll-cta .btn--gold'));
      await act(async () => {});
      const inputs = () => [...document.querySelectorAll('.qtm__form input')];
      fireEvent.change(inputs()[0], { target: { value: 'Test' } });
      fireEvent.change(inputs()[1], { target: { value: 'student@example.com' } });
      fireEvent.change(inputs()[2], { target: { value: '+44 7700 900000' } });
      await act(async () => {});
      mocks.submitTrial.mockResolvedValueOnce({});
      fireEvent.click(document.querySelector('.qtm__form button[type="submit"]'));
      await act(async () => {});
      payloads[prefix || 'en'] = mocks.submitTrial.mock.calls.map(([body]) => body);
      cleanup();
    }
    expect(payloads['/fr']).toHaveLength(1);
    expect(payloads['/fr']).toEqual(payloads.en);
    expect(payloads['/fr'][0].source).toBe('hero-quick-trial');
  }, 60000);

  it('/fr/tools/prayer: card links point to the (deferred) tool routes, unchanged', async () => {
    await mountFullPage('/fr/tools/prayer', (await import('../pages/IslamicTools')).default);
    const hrefs = [...document.querySelectorAll('.hub-card')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/fr/tools/prayer-times', '/fr/tools/qibla', '/fr/tools/islamic-calendar', '/fr/tools/verse-of-the-day']);
  });

  it('/fr/resources/blog: category "All" stays the filter sentinel value while its label is French', async () => {
    mocks.getBlogPosts.mockResolvedValueOnce({
      posts: [
        { slug: 'a', title: 'A', excerpt: 'a', date: '2026-01-01', category: 'Tajwid' },
        { slug: 'b', title: 'B', excerpt: 'b', date: '2026-01-02', category: 'Tajwid' },
      ],
    });
    await mountFullPage('/fr/resources/blog', Blog);
    await act(async () => {});
    const allBtn = document.querySelector('.blog-filter-btn');
    expect(allBtn.textContent).toBe(RESOURCES_BLOG_TEXT.fr.categoryAll);
    fireEvent.click(allBtn);
    await act(async () => {});
    expect(document.querySelectorAll('.blog-card')).toHaveLength(2);
  });

  // Italian SEO Publication Gate (2026-09-30) added a real `it` entry to
  // RESOURCES_SEO_TEXT (see resourcesArabicCopy.test.jsx and
  // prerenderOutput.test.js's Italian describe block); /it/resources now
  // renders its own real Italian description, not an English fallback.
  it('/it/resources renders the real Italian resources description, not an English fallback', async () => {
    await mountFullPage('/it/resources', ResourcesHub);
    expect(document.querySelector('meta[name="description"]').content).toBe(RESOURCES_SEO_TEXT.it.description);
    expect(document.querySelector('meta[name="description"]').content).not.toBe(RESOURCES_SEO_TEXT.en.description);
  });
});
