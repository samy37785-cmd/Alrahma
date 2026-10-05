import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Quran from '../pages/Quran';

// Accessibility Wave 4 (jsdom half): the Quran Reader contrast fix is CSS only.
// This file proves what must NOT change, and that the new reader tokens are
// wired to the right selectors and themes. The ratios themselves are measured
// in a real browser by accessibilityWave4.layout.test.js.
//
//   - every protected file (Quran API / cache, page, hooks, reader components,
//     share card, reader i18n and data, SEO hook, prerender / sitemap scripts,
//     public sitemap / manifest / llms.txt / robots.txt, global stylesheets) is
//     byte-identical to origin/main (SHA-256 baselines taken at 3b44029);
//   - EN / AR / FR / IT render the reader in light / dark / sepia with the right
//     theme class and the verse text, translation and surah names exactly as
//     received, with no network, audio or microphone use;
//   - quran.css defines --qlc-label / --qlc-muted on .qlc and .qlc--dark only,
//     and the fixed selectors read them.

const mocks = vi.hoisted(() => ({
  getChapters: vi.fn(), getVerses: vi.fn(), getVersesByPage: vi.fn(), getVersesByJuz: vi.fn(),
  getVersesByHizb: vi.fn(), getChapterAudio: vi.fn(), getVerseAudios: vi.fn(),
  getVerseTafsir: vi.fn(), getVerseTafsirCloud: vi.fn(),
}));
vi.mock('../api/quran', async (orig) => ({ ...(await orig()), ...mocks }));

useFullPageEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const sha = (rel) => createHash('sha256').update(read(rel)).digest('hex');

// Synthetic fixtures (placeholder strings; not Quran text and not an API copy).
const CH = [1, 2].map((id) => ({ id, name_simple: `Fixture Surah ${id}`, name_arabic: `سورة ${id}`, translated_name: { name: `Fixture ${id}` }, verses_count: 2, revelation_place: 'makkah', pages: [1, 1], bismillah_pre: id !== 1 }));
const V = [1, 2].map((n) => ({ id: n, verse_key: `1:${n}`, verse_number: n, text_uthmani: `نص تجريبي ${n}`, page_number: 1, juz_number: 1, hizb_number: 1, translations: [{ text: `Fixture translation line ${n}` }] }));

const setWebdriver = (value) => Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
let playSpy; let fetchSpy; let micSpy;

beforeEach(() => {
  mocks.getChapters.mockReset().mockResolvedValue(CH);
  for (const k of ['getVerses', 'getVersesByPage', 'getVersesByJuz', 'getVersesByHizb']) mocks[k].mockReset().mockResolvedValue(V);
  mocks.getChapterAudio.mockReset().mockResolvedValue('');
  mocks.getVerseAudios.mockReset().mockResolvedValue([]);
  mocks.getVerseTafsir.mockReset().mockRejectedValue(new Error('offline'));
  mocks.getVerseTafsirCloud.mockReset().mockRejectedValue(new Error('offline'));
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  fetchSpy = vi.fn(() => Promise.reject(new Error('network is not allowed in this test')));
  vi.stubGlobal('fetch', fetchSpy);
  micSpy = vi.fn(() => Promise.reject(new Error('microphone is not allowed in this test')));
  Object.defineProperty(window.navigator, 'mediaDevices', { value: { getUserMedia: micSpy }, configurable: true });
  setWebdriver(false);
});
afterEach(() => {
  cleanup();
  playSpy.mockRestore();
  vi.unstubAllGlobals();
  delete window.navigator.webdriver;
  delete window.navigator.mediaDevices;
  localStorage.clear();
});

describe('protected files are byte-identical to origin/main (3b44029)', () => {
  it('Quran API / cache, page, hooks, reader components, share card, reader i18n + data, SEO, sitemap, manifest, llms.txt, robots, prerender scripts, global stylesheets', () => {
    const BASELINE = {
      'public/llms.txt': 'b801d49380a0e5e6694f497e013c38096d47fd33a3de4ec95305136c21ebdd02',
      'public/manifest.json': 'eb1abafcd12b91b890a6e7f6c9ce69da6641ce80c95c31fa3f51ee792897cfc0',
      'public/robots.txt': 'b2bd76ccef97000cdc5d352d2503b101be782545e8168bd8ed35c4d2fa74e8d4',
      'public/sitemap.xml': 'e4de2e4d08cfe7c5ee11d8ee28eb4768ae4f079a57b89b1ef6e28d55e4ebdf9d',
      'scripts/gen-sitemap.mjs': '83b8022647b09534b25ba66198848574abda88c8d0f211865f0ee6b306edc7ab',
      'scripts/prerender-routes.mjs': '662229f26e0282460e6463db0758175f09e4783b5c8c2e9ff0fa21614e3ec70c',
      'scripts/prerender.mjs': '6d38afed3468e907b99bb6df9e39e5515fdf59bea11fa5bd1a3228e005a629e2',
      'src/api/cache.js': '90177f0efbcb4469686bb4cd3e45cc61571c0ca7d463a2a8e57f0091c43694e8',
      'src/api/quran.js': '84ad13d403c5ee7f879365971a2140044c85c8c32db2d7c62c702692fd8d1c88',
      'src/components/features/quran/QuranChapterHeader.jsx': 'afe3fe96e360b4778462370ccc9917204c7689188444a047667d2f0ec6b674fe',
      'src/components/features/quran/QuranControls.jsx': '632d50383d2320b936db51acd65d12f8a16347db711e73d6b66a6677aa724add',
      'src/components/features/quran/QuranFloatingBar.jsx': '4ca9988c516af36a7268cebbb1f981feae937003955d315f47e4d050ca03ce0a',
      'src/components/features/quran/QuranHifzControls.jsx': 'e45729fa182822ac545e73ac48fb5c8d71f3ff33ed3b3a85f773fc0cf3ca367b',
      // Wave 5 (a11y): role="button" -> role="group" on the viewport, plus its comment. Nothing else;
      // accessibilityWave5.test.jsx proves the file equals the old bbf4e79f... once that one change is undone.
      'src/components/features/quran/QuranMushafPage.jsx': '0e74a994605cfa0a89e502d8e08b98706669048dfee3910ea53cc4ed1f0e6243',
      'src/components/features/quran/QuranPlayer.jsx': '68b95ebc8b5d04fdd35869a5af94182cedaef4e62365b73b6094e91dd9a07f7b',
      'src/components/features/quran/QuranQuickNav.jsx': '0f90851769995c31838f36c58696035601d458c78a35ba83f99561ae3b22fbd8',
      'src/components/features/quran/QuranReadingControls.jsx': 'a5aa5c582983131ad09a6811477a627074ea2f845bace0f7dea9c3835594aab2',
      'src/components/features/quran/QuranRecordingStudio.jsx': '64b391f78b44f43bee71bd9d05ab1fbd6b6b95af37f42ef0f1f1135e3dfe2dae',
      'src/components/features/quran/QuranSidebar.jsx': 'ad92be68c3029caa57c677e97fd218a4e5f074bbbc7f81a4124025e023c20855',
      'src/components/features/quran/QuranSyncPlayer.jsx': 'fee945ca559d9982274a29a73cdade9ff293dc49377a0a9f6dc6f20df5146e90',
      'src/components/features/quran/QuranTopBar.jsx': '5b373ad4e5658fe48e8b808f60786db8e9c873098649710e4d2fe3c1aeddb5de',
      'src/components/features/quran/QuranVerseList.jsx': '703d33e404fd64529e576eeb646de6cca1af92a4a427dda2e63c176967a1e69d',
      'src/components/features/quran/ReadingModeSwitch.jsx': 'bb24d879da4f6a10043cb3af79de48fef6bf5e37745568ab0f0e7f36210438d6',
      'src/components/features/quran/TafsirPanel.jsx': '484e1b56ef53346c0795616832a0415021f6622d80ceebb4fa183739eff8083b',
      'src/components/features/quran/TafsirPicker.jsx': '510811214d452679df98550040b830cf80cf76e51e2b0000542a142855237e6a',
      'src/components/ui/VerseCardModal.jsx': '8bbf6f558ffb6d3394a67e1d83209588508d298e88a84ffdf2899a38b25e1ce4',
      'src/data/quranLangs.js': '92b6cffe0b6f1d777776acddc52c37e1876e0564cfcf6f994a0c2217247792ad',
      'src/hooks/useQuranAudioEngine.js': '772b1a0ec5598dd5c8eb9a646a985f4b80828af57015dbca08301654660aefb6',
      'src/hooks/useQuranBookmarks.js': '99b39b71e7c3e56415a72c36feeb81f4fec150212c19f1629c7f141b65c3b46a',
      'src/hooks/useQuranHifz.js': 'ebe302da6774384cf7e60a18e27d60a64355caa7bb308175978f7138f7f73465',
      'src/hooks/useQuranKeyboard.js': 'fa801ef69dec3cf88795f7a68560259a852a2b366175ebf7b4f1ba3fe2f8513e',
      'src/hooks/useQuranMemoStats.js': 'b850f93428b0edab84c4ed1b5bb95e275135965e74682682b2d2458cc580f0a3',
      'src/hooks/useQuranProgress.js': 'a70c2f2c0752682a6d1c8f32c2eb4ad25d4852e1d31b1cbe0cb696adf43d32c9',
      'src/hooks/useQuranRecorder.js': '67313e3e6f0901a0e7f3dce93d188930070548c56ff52247fe6958da1e6161fe',
      'src/hooks/useQuranVerseActions.js': '62db82585fc6e1916d1141da0e8d4a8e43dbe137fa02cceb93ba9de726a54316',
      // Social/schema PR: the only change is DEFAULT_IMAGE (/og-cover.svg -> /og-cover.png); nothing else in the hook moved.
      'src/hooks/useSEO.js': '64590f68293e825bb190a37d99c9dd5eea036552bc74e84c554571d43c8d382d',
      'src/i18n/quran/a11yLabels.js': 'f6508c7e1f7249ac06a07269efcf2a2358c42004ac8e5ea5751d45fd5091926c',
      'src/i18n/quran/arabicNavigationLabels.js': '16b9a08d86930bc1bbf4f7794516d5db23fb226036421ea77b6ab837fc139015',
      'src/i18n/quran/controlsPanels.js': '3f9c11e87de7b32d0e685580882a489c0bf7f10afa639f6641fac10891680654',
      'src/i18n/quran/kbdSidePanel.js': 'd2a2d708f85d4141ccfeb5736118dd96a38f67da7bc59640a1f18dd5750680f3',
      'src/i18n/quran/verseCardModal.js': 'b389bf8d90b0f61d8593c2703da2433f148dd2528df4bd34b5ed182a4dc40146',
      'src/pages/Quran.jsx': '750cd8ad52d28e28d461780b4d82ab9612fb454a4886e4b06153965aa9c9b80d',
      'src/styles/tokens.css': '042749b20028ad361fb7570c4ecc3d45c584ddab30919d97c11d302c53eccfb8',
      'src/styles/global.css': '0e5681ec63222eedac4354b9210543ed13160722c74d781bb69dc739417d52fe',
      'src/styles/components.css': '3a8d83364b5362adf3ac755dc5e46532d805e8449e68d26e25a34ec904224041',
      'src/styles/dark.css': 'b17af28318fa64a0025d5195210996bda1173ad202b56ecc86faad9c871f2a41',
      'src/styles/pages.css': '39ae385296ca78854c3dd36c3ef7b8390cd667e49239ef706a8456ae50f2d6c6',
      'src/styles/layout/home.css': '60fca53b34ce2e8c7c1101125558944c2c97359d673e40e4786635d1a3c864c5',
      'src/styles/layout/header.css': 'b5aa83faa8979d0e803643cb796c2df4eb734aae295a4213bee4e2ccd84008e6',
    };
    expect(Object.fromEntries(Object.keys(BASELINE).map((f) => [f, sha(f)]))).toEqual(BASELINE);
  });
});

const LOCALES = [
  { lang: 'en', url: '/tools/quran-reader', dir: 'ltr' },
  { lang: 'ar', url: '/ar/tools/quran-reader', dir: 'rtl' },
  { lang: 'fr', url: '/fr/tools/quran-reader', dir: 'ltr' },
  { lang: 'it', url: '/it/tools/quran-reader', dir: 'ltr' },
];
const THEMES = {
  light: { store: { 'al-rahma-theme': 'light', 'qlc-sepia': '0' }, has: [], not: ['qlc--dark', 'qlc--sepia'] },
  dark: { store: { 'al-rahma-theme': 'dark', 'qlc-sepia': '0' }, has: ['qlc--dark'], not: ['qlc--sepia'] },
  sepia: { store: { 'al-rahma-theme': 'light', 'qlc-sepia': '1' }, has: ['qlc--sepia'], not: ['qlc--dark'] },
};

describe('the reader renders unchanged content in every theme and language, offline and silent', () => {
  for (const { lang, url, dir } of LOCALES) {
    for (const [theme, t] of Object.entries(THEMES)) {
      it(`${lang} ${theme}: theme class, verse text / translation / surah names as received, no fetch / play / microphone`, async () => {
        for (const [k, v] of Object.entries(t.store)) localStorage.setItem(k, v);
        await mountFullPage(url, Quran);
        const qlc = document.querySelector('.qlc');
        expect(qlc).not.toBeNull();
        for (const c of t.has) expect(qlc.classList.contains(c)).toBe(true);
        for (const c of t.not) expect(qlc.classList.contains(c)).toBe(false);
        expect(document.documentElement.getAttribute('dir') || 'ltr').toBe(dir);
        // Default Mushaf view: each verse's text is rendered exactly as received.
        const flow = document.querySelector('.mushaf-flow');
        expect(flow).not.toBeNull();
        for (const v of V) expect(flow.textContent).toContain(v.text_uthmani);
        for (const v of V) expect(document.body.textContent).toContain(v.translations[0].text);
        for (const c of CH) expect(document.body.textContent).toContain(c.name_simple);
        expect(mocks.getVerses).toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(playSpy).not.toHaveBeenCalled();
        expect(micSpy).not.toHaveBeenCalled();
      });
    }
  }
});

// ── Stylesheet wiring ─────────────────────────────────────────────────────
// Declarations only: comments (which may name the old colours) are stripped.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const QURAN_CSS = stripComments(read('src/styles/quran.css'));
const MUSHAF_CSS = stripComments(read('src/styles/quran-mushaf.css'));
// Declaration blocks of every rule whose selector list is exactly `selector`.
const blocks = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return [...css.matchAll(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]);
};
const block = (css, selector) => blocks(css, selector)[0] ?? null;
const tokenBlock = (selector) => blocks(QURAN_CSS, selector).find((b) => /--qlc-label/.test(b)) ?? null;

describe('quran.css: reader-scoped tokens, consumed by the fixed selectors', () => {
  it('defines --qlc-label / --qlc-muted on .qlc and redefines them on .qlc--dark; sepia inherits the light values', () => {
    expect(tokenBlock('.qlc')).toMatch(/--qlc-label:\s*#[0-9a-f]{6};\s*--qlc-muted:\s*#[0-9a-f]{6};/);
    expect(tokenBlock('.qlc--dark')).toMatch(/--qlc-label:\s*#[0-9a-f]{6};\s*--qlc-muted:\s*#[0-9a-f]{6};/);
    expect(tokenBlock('.qlc--dark')).not.toBe(tokenBlock('.qlc'));
    // Light values first, dark override after them (same specificity, so order decides).
    expect(QURAN_CSS.indexOf(tokenBlock('.qlc--dark'))).toBeGreaterThan(QURAN_CSS.indexOf(tokenBlock('.qlc')));
    expect(QURAN_CSS).not.toMatch(/\.qlc--sepia\s*\{[^}]*--qlc-/);
  });

  it('nothing outside the reader stylesheets reads the new tokens', () => {
    const stylesDir = path.join(ROOT, 'src/styles');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const users = walk(stylesDir).filter((f) => f.endsWith('.css') && /--qlc-(label|muted)/.test(fs.readFileSync(f, 'utf8')));
    expect(users.map((f) => path.basename(f))).toEqual(['quran.css']);
  });

  it.each([
    ['.qlc__cbar-label', 'var(--qlc-label)'],
    ['.qlc__mode-switch-btn', 'var(--qlc-label)'],
    ['.qlc__tafsir-picker-cat', 'var(--qlc-label)'],
    ['.qlc__shortcuts-cat', 'var(--qlc-label)'],
    ['.qlc__settings-label', 'var(--qlc-label)'],
    ['.qlc__chapter-en', 'var(--qlc-muted)'],
    ['.qlc__vbadge', 'var(--qlc-muted)'],
    ['.qlc--dark .qlc__vbadge', 'var(--qlc-label)'],
    ['.qlc__snames small', 'var(--qlc-muted)'],
    ['.qlc--dark .qlc__snames small', 'var(--qlc-muted)'],
    ['.qlc--dark .qlc__chapter-en', 'var(--qlc-muted)'],
    ['.qlc--dark .qlc__jump-of', 'var(--qlc-muted)'],
    ['.qlc--dark .qlc__tafsir-picker-en', 'var(--qlc-muted)'],
    ['.qlc__sar', 'var(--p-amber-700)'],
    ['.qlc__bookmark-btn', 'var(--qlc-muted)'],
    ['.qlc--dark .btn--ghost', 'var(--qlc-label)'],
    ['.qlc__syncplayer .qplayer__speed', 'var(--qlc-label)'],
  ])('%s uses %s', (selector, value) => {
    const b = block(QURAN_CSS, selector);
    expect(b, selector).not.toBeNull();
    expect(b).toMatch(new RegExp(`(^|[;\\s])color:\\s*${value.replace(/[()]/g, '\\$&')}`));
  });

  it('single-line rules (jump label / count, font value, settings hint) use the tokens', () => {
    expect(QURAN_CSS).toMatch(/\.qlc__jump-label\s*\{[^}]*color:\s*var\(--qlc-label\)/);
    expect(QURAN_CSS).toMatch(/\.qlc__jump-of\s*\{[^}]*color:\s*var\(--qlc-muted\)/);
    expect(QURAN_CSS).toMatch(/\.qlc__cbar-font-val\s*\{[^}]*color:\s*var\(--qlc-muted\)/);
    expect(QURAN_CSS).toMatch(/\.qlc__settings-hint\s*\{[^}]*color:\s*var\(--qlc-muted\)/);
  });

  it('the dark top bar and sidebar tabs scope a ring colour that is visible on them; nothing else re-sets --ring-color', () => {
    expect(block(QURAN_CSS, '.qlc__bar')).toMatch(/--ring-color:\s*#[0-9a-f]{6}/);
    expect(block(QURAN_CSS, '.qlc__nav-tabs')).toMatch(/--ring-color:\s*#[0-9a-f]{6}/);
    expect(QURAN_CSS.match(/--ring-color:/g)).toHaveLength(2);
  });

  it('selected / hover states that used to fail now read the new values', () => {
    expect(block(QURAN_CSS, '.qlc--sepia .qlc__mode-switch-btn.active')).toMatch(/color:\s*#fff/);
    expect(block(QURAN_CSS, '.qlc--sepia .qlc__mode-switch-btn')).toMatch(/color:\s*#6a5620/);
    expect(block(QURAN_CSS, '.qlc__theme-btn--sepia.active')).toMatch(/background:\s*#8a6d1a/);
    expect(block(QURAN_CSS, '.qlc__tafsirbtn.active,\n.qlc__tafsirbtn:hover')).toMatch(/background:\s*#8a6a00/);
    expect(block(QURAN_CSS, '.qlc--dark .qlc__nav-tab.active')).toMatch(/color:\s*var\(--qlc-label\)/);
    expect(block(QURAN_CSS, '.qlc .qlc__bar .qlc__back')).toMatch(/color:\s*rgba\(255,\s*255,\s*255,\s*\.9\)/);
  });

  it('share card: opaque gold inks and a gold button gradient that ends on amber-500, scoped to .qlc', () => {
    expect(block(QURAN_CSS, '.qlc .vcard__brand,\n.qlc .vcard__ref')).toMatch(/color:\s*var\(--p-gold-500\)/);
    expect(block(QURAN_CSS, '.qlc .vcard-modal__actions .btn--gold')).toMatch(/var\(--p-amber-400\)[^;]*var\(--p-amber-500\)/);
  });

  it('quran-mushaf.css: the light secondary ink is #6a5620 everywhere it was #8a7440 / #8a6d1a', () => {
    expect(MUSHAF_CSS).not.toMatch(/#8a7440|#8a6d1a/i);
    for (const sel of ['.mushaf-surah-banner__meta', '.mushaf-translation b']) expect(block(MUSHAF_CSS, sel)).toMatch(/color:\s*#6a5620/);
    expect((MUSHAF_CSS.match(/#6a5620/g) || []).length).toBeGreaterThanOrEqual(7);
  });
});
