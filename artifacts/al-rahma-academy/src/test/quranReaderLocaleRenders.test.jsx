import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cleanup, act, fireEvent } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Quran from '../pages/Quran';

// The EN/AR/FR/ES/DE Quran Reader renders (prerender capture and every real-visitor
// panel) must still match origin/main. Moved here from italianQuranReaderContent.test.jsx
// (#249) with the same hashes:
// - It was ONE test rendering all five languages (10 full mounts, ~30 key presses).
//   Under full-suite load it ran past the 5 s timeout (2.8-5.0 s measured, 0.9 s alone).
// - The timed-out body kept running after Vitest moved on. It set navigator.webdriver
//   back to true and mounted/cleaned pages during the next tests, which then rendered
//   the prerender view (no panels): ~11 Italian tests failed after it.
// Now each language is its own test (two mounts, ~100-300 ms), every step checks the
// test's AbortSignal so a timed-out test stops and removes the page it rendered, and
// the file is separate from the Italian tests, so nothing it does can reach them.

const mocks = vi.hoisted(() => ({
  getChapters: vi.fn(), getVerses: vi.fn(), getVersesByPage: vi.fn(), getVersesByJuz: vi.fn(),
  getVersesByHizb: vi.fn(), getChapterAudio: vi.fn(), getVerseAudios: vi.fn(),
  getVerseTafsir: vi.fn(), getVerseTafsirCloud: vi.fn(),
}));
vi.mock('../api/quran', async (orig) => ({ ...(await orig()), ...mocks }));

useFullPageEnvironment();

const CH = [1, 2, 3].map((id) => ({ id, name_simple: `Surah${id}`, name_arabic: 'س', translated_name: { name: `T${id}` }, verses_count: 7, revelation_place: 'makkah', pages: [1, 2], bismillah_pre: true }));
const V = [1, 2].map((n) => ({ id: n, verse_key: `1:${n}`, verse_number: n, text_uthmani: 'نص', page_number: 1, juz_number: 1, hizb_number: 1, translations: [{ text: 'trans' }] }));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });
const press = async (key) => { await act(async () => { fireEvent.keyDown(window, { key }); }); await settle(); };
const click = async (el) => { await act(async () => { fireEvent.click(el); }); await settle(); };
const setWebdriver = (value) => Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });

// The Mushaf viewport's role (Accessibility Wave 5) is normalised back: it is the only
// rendered difference from origin/main (role attribute serialised inside JSON).
const normaliseMushafRole = (json) => json.replace(/(class=\\"mushaf-viewport[^"\\]*\\" )role=\\"group\\"/g, '$1role=\\"button\\"');
// The hidden breadcrumb wrapper Quran.jsx renders for its published languages.
const stripHiddenBreadcrumb = (html) => {
  const out = html.replace(/<div class="sr-only"><nav[\s\S]*?<\/nav><\/div>/, '');
  expect(out.length, 'one hidden breadcrumb removed').toBeLessThan(html.length);
  return out;
};

let playSpy;
beforeEach(() => {
  cleanup();
  mocks.getChapters.mockReset().mockResolvedValue(CH);
  mocks.getVerses.mockReset().mockResolvedValue(V);
  mocks.getVersesByPage.mockReset().mockResolvedValue(V);
  mocks.getVersesByJuz.mockReset().mockResolvedValue(V);
  mocks.getVersesByHizb.mockReset().mockResolvedValue(V);
  mocks.getChapterAudio.mockReset().mockResolvedValue('');
  mocks.getVerseAudios.mockReset().mockResolvedValue([]);
  mocks.getVerseTafsir.mockReset().mockRejectedValue(new Error('offline'));
  mocks.getVerseTafsirCloud.mockReset().mockRejectedValue(new Error('offline'));
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  setWebdriver(false);
});
afterEach(() => {
  cleanup();
  playSpy.mockRestore();
  delete window.navigator.webdriver;
});

const READER_HASHES = {
  en: { prerender: '4132f9c7a1656807ded1947e0597605deab4ced4ad07ebd770dd846392d5b3f9', visitor: 'f3bce705fcd3921485a17728153c92b3dc44d47dbf47449a94016e0fd59ae939' },
  ar: { prerender: 'dc4eeb3ab04987e1233d60ea3081353a2af822f8c09ac30531a021df52b84fd1', visitor: 'af12b5440e97f5d4cc5c96110312897fbc3ed671bdc00f8521531734352df45f' },
  fr: { prerender: '7dc5207971e4ff8537c420e34e4359917cc4a43572f0907ab3d0c67e3a02eaed', visitor: 'bb39190f455ffb30dbb50b99557228ca025a91a13d49f695dd6bd55422220191' },
  es: { prerender: '0302fdbf11c4ce87822489cad77e4b1cc928d4c4a630f76c7a1d68340c1adfee', visitor: '391f90794e1beb5747f37a5b6031d249dff4c202a0a75ad8b9d7f91c10479177' },
  de: { prerender: '0ff77fec5ea0e2d291f8c191e814425a4f70e40d60ea34b95b7b9e7931976528', visitor: '5c1010c08b742a59e042b131343c97c48e019e5d6510311b64ccc0bc7d40dfe9' },
};

// A timed-out body is still inside a React act() when Vitest starts the next test, and
// overlapping act() scopes corrupt the next render. So each test first waits until the
// previous body has really finished (it stops at its next step once aborted).
let previousBody = Promise.resolve();

describe('EN/AR/FR/ES/DE Quran Reader renders match origin/main', () => {
  it.for(Object.keys(READER_HASHES))('%s: prerender capture and every real-visitor panel', async (loc, { signal }) => {
    await previousBody;
    cleanup(); // whatever a cut-short previous body left behind
    let finished;
    previousBody = new Promise((resolve) => { finished = resolve; });
    try {
      await renderAndCompare(loc, signal);
    } finally {
      finished();
    }
  });
});

async function renderAndCompare(loc, signal) {
  // Every step runs only while the test is live. If the test timed out meanwhile, the
  // page this step rendered is removed and nothing further runs.
  const views = [];
  const step = async (fn) => {
    signal.throwIfAborted();
    const result = await fn();
    if (signal.aborted) {
      for (const v of views) { v.unmount(); v.container.remove(); }
      signal.throwIfAborted();
    }
    return result;
  };
  const mount = (p) => step(async () => { views.push(await mountFullPage(p, Quran)); });
  const p = loc === 'en' ? '/tools/quran-reader' : `/${loc}/tools/quran-reader`;

  setWebdriver(true);
  await mount(p);
  const prerender = sha(JSON.stringify({ t: document.title, b: document.querySelector('#main-content')?.innerHTML ?? document.body.innerHTML }));
  cleanup();
  setWebdriver(false);
  await mount(p);
  await step(settle);
  const states = [document.body.innerHTML];
  for (const key of ['?', 'g', 'k']) {
    await step(() => press(key)); states.push(document.body.innerHTML); await step(() => press(key));
  }
  await step(() => press('/')); states.push(document.body.innerHTML); await step(() => press('Escape'));
  const hifz = [...document.querySelectorAll('.qlc__tab, button')].find((b) => /Hifz|Memoriz|Mémoris|حفظ|Auswendig|Memoriz/i.test(b.textContent));
  if (hifz) { await step(() => click(hifz)); states.push(document.body.innerHTML); }
  // The Arabic page races its first load: some buttons are `disabled` for a moment.
  // That is unrelated, so it is normalised away. en/ar (2026-10-13) render the same
  // hidden (.sr-only) breadcrumb fr/it already had; it is stripped back out so the rest
  // of the reader must still match origin/main exactly.
  const visible = ['en', 'ar'].includes(loc) ? states.map(stripHiddenBreadcrumb) : states;
  const visitor = sha(normaliseMushafRole(JSON.stringify(visible)).replace(/ disabled=\\"\\"/g, ''));
  expect({ prerender, visitor }).toEqual(READER_HASHES[loc]);
}
