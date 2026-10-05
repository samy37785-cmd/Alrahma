import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Quran from '../pages/Quran';
import QuranMushafPage from '../components/features/quran/QuranMushafPage';
import { getUI } from '../data/quranLangs';

// Accessibility Wave 5 (jsdom half): Quran Reader focus, mobile drawer overlap and the
// Mushaf accessible name. The fix is CSS plus one attribute (role="button" -> role="group"
// on the Mushaf viewport). This file proves what must NOT change and how the four items
// are wired; the pixels (overlap, focus rings, clipping) are measured in a real browser by
// accessibilityWave5.layout.test.js.
//
//   1. .qlc__sidebar-close no longer overlaps the end nav tab: the drawer gets a head strip
//      that is exactly the close button's box (top + height + top); tab order, tab labels and
//      the close button's own name are untouched (QuranSidebar.jsx is byte-identical).
//   2. .mushaf-navbtn shows, fully opaque and with a ring, on keyboard focus only; disabled
//      buttons stay out of the tab order and hidden.
//   3. .qlc__cbar-select gets a real :focus-visible outline, not just a border colour.
//   4. The Mushaf viewport is a labelled focusable group, so axe's label-content-name-mismatch
//      and nested-interactive no longer apply to it, with the same label text and key handler.
//   Everything else (Quran text, translations, tafsir, surah names, reciters, API / cache /
//   hooks, audio, recording, share, SEO, manifest, sitemap) is byte-identical to origin/main.

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

describe('protected files are byte-identical to origin/main (949b6b7)', () => {
  it('Quran API / cache, page, hooks, reader components except the Mushaf page, share card, reader i18n + data, SEO, sitemap, manifest, llms.txt, robots, prerender scripts, global stylesheets', () => {
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

  it('QuranMushafPage.jsx differs from origin/main by role="button" -> role="group" and its explanatory comment, and by nothing else', () => {
    const src = read('src/components/features/quran/QuranMushafPage.jsx');
    expect(src).toContain('role="group"');
    expect(src).not.toContain('role="button"');
    const restored = src
      .replace(/  \/\/ role="group", not "button"[\s\S]*?exposes the inner buttons and the text\.\n/, '')
      .replace('role="group"', 'role="button"');
    expect(createHash('sha256').update(restored).digest('hex')).toBe('bbf4e79f624571929126fc14e58f51782189a15bbc1d74f8c26edfdf10c4a3a1');
  });
});

const LOCALES = [
  { lang: 'en', url: '/tools/quran-reader', dir: 'ltr', label: 'Toggle reading view controls' },
  { lang: 'ar', url: '/ar/tools/quran-reader', dir: 'rtl', label: 'Toggle reading view controls' }, // no AR string exists: the English fallback is unchanged (out of scope)
  { lang: 'fr', url: '/fr/tools/quran-reader', dir: 'ltr', label: 'Afficher/masquer les commandes de lecture' },
  { lang: 'it', url: '/it/tools/quran-reader', dir: 'ltr', label: 'Mostra o nascondi i controlli di lettura' },
];
const THEMES = {
  light: { store: { 'al-rahma-theme': 'light', 'qlc-sepia': '0' }, has: [], not: ['qlc--dark', 'qlc--sepia'] },
  dark: { store: { 'al-rahma-theme': 'dark', 'qlc-sepia': '0' }, has: ['qlc--dark'], not: ['qlc--sepia'] },
  sepia: { store: { 'al-rahma-theme': 'light', 'qlc-sepia': '1' }, has: ['qlc--sepia'], not: ['qlc--dark'] },
};

// axe schedules work with timers, so it runs on the real clock; the fake clock (fixed Date for the
// TrustBar / footer) is put back afterwards for the next test.
const axeOn = async (el, rules) => {
  vi.useRealTimers();
  try {
    const res = await axe.run(el, { runOnly: rules, rules: { 'label-content-name-mismatch': { enabled: true } }, resultTypes: ['violations', 'incomplete'] });
    return { violations: res.violations.map((v) => v.id), incomplete: res.incomplete.map((v) => v.id), detail: res.incomplete.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`)) };
  } finally {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  }
};
const newUser = () => userEvent.setup({ delay: null });

describe('the reader renders unchanged content in every theme and language, offline and silent; the Mushaf name is a group name', () => {
  for (const { lang, url, dir, label } of LOCALES) {
    for (const [theme, t] of Object.entries(THEMES)) {
      it(`${lang} ${theme}: group name "${label}", no label-content-name-mismatch / nested-interactive, content as received, no fetch / play / microphone`, async () => {
        for (const [k, v] of Object.entries(t.store)) localStorage.setItem(k, v);
        await mountFullPage(url, Quran);
        const qlc = document.querySelector('.qlc');
        for (const c of t.has) expect(qlc.classList.contains(c)).toBe(true);
        for (const c of t.not) expect(qlc.classList.contains(c)).toBe(false);
        expect(document.documentElement.getAttribute('dir') || 'ltr').toBe(dir);

        // Computed accessible name of the Mushaf element: the existing label, on a group.
        const viewport = document.querySelector('.mushaf-viewport');
        expect(viewport).not.toBeNull();
        expect(screen.getByRole('group', { name: label })).toBe(viewport);
        expect(screen.queryByRole('button', { name: label })).toBeNull();
        expect(viewport.getAttribute('aria-label')).toBe(getUI(lang).toggleReadingControls || 'Toggle reading view controls');
        expect(viewport.tabIndex).toBe(0);
        expect(viewport.hasAttribute('title')).toBe(false);

        // The rules from the audit report nothing on the Mushaf element.
        const found = await axeOn(viewport, ['label-content-name-mismatch', 'nested-interactive', 'aria-prohibited-attr', 'aria-allowed-role', 'button-name']);
        expect(found.violations).toEqual([]);
        expect(found.detail, "axe needs-review nodes").toEqual([]);

        // Its inner controls are now exposed, with their existing names.
        const ui = getUI(lang);
        expect(screen.getByRole('button', { name: ui.nextPage || 'Next' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: ui.prevPage || 'Previous' })).toBeDisabled();
        expect(viewport.querySelectorAll('.mushaf-ayah-num').length).toBe(V.length);

        // Religious content exactly as received.
        const flow = document.querySelector('.mushaf-flow');
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

  it.each(LOCALES.map((l) => [l.lang, l.url]))('%s: drawer markup unchanged: close button first, then the five nav tabs in order with their own labels; selects keep options and values', async (lang, url) => {
    await mountFullPage(url, Quran);
    const ui = getUI(lang);
    const aside = document.querySelector('.qlc__sidebar');
    const kids = [...aside.children].map((e) => e.className.split(' ')[0]);
    expect(kids.slice(0, 2)).toEqual(['qlc__sidebar-close', 'qlc__nav-tabs']);
    expect(aside.querySelector('.qlc__sidebar-close').getAttribute('aria-label')).toBe(ui.close || 'Close');
    const labels = [...aside.querySelectorAll('.qlc__nav-tab')].map((b) => b.textContent);
    expect(labels).toHaveLength(5);
    expect(labels.slice(0, 3)).toEqual([ui.navSurah || 'Surah', ui.navPage || 'Page', ui.navJuz || 'Juz']);
    expect(labels[4]).toBe(ui.khatm || 'ختمة');
    const selects = [...document.querySelectorAll('.qlc__cbar-select')];
    expect(selects.length).toBeGreaterThanOrEqual(3);
    for (const s of selects) { expect(s.options.length).toBeGreaterThan(0); expect(s.disabled).toBe(false); }
  });
});

// ── Mushaf page: tab order and behaviour ──────────────────────────────────
const verse = (n) => ({ verse_key: `1:${n}`, juz_number: 1, hizb_number: 1, page_number: 1, text_uthmani: `نص تجريبي ${n}` });
function renderPage(props = {}) {
  return render(
    <QuranMushafPage
      verses={[verse(1), verse(2)]} chapters={[]} pageNum={1} navMode="page" fontSize={28} showTrans={false} ui={getUI('en')}
      isBookmarked={() => false} onToggleBookmark={() => {}} getBookmark={() => null}
      onPrev={() => {}} onNext={() => {}} canPrev={false} canNext chromeHidden={false} onToggleChrome={() => {}} progressLabel="Surah 1 / 114"
      {...props}
    />,
  );
}

describe('Mushaf page: keyboard order and behaviour are unchanged', () => {
  // user-event waits on a timer that RTL only drains for jest's fake clock, so these tests run on the real clock.
  beforeAll(() => { vi.useRealTimers(); });

  it('Tab visits the group, then the enabled next button, then the ayah numbers; the disabled previous button is skipped; Shift+Tab goes back the same way', async () => {
    const user = newUser();
    renderPage();
    const prev = screen.getByRole('button', { name: /previous/i });
    const next = screen.getByRole('button', { name: /next/i });
    expect(prev).toBeDisabled();
    const order = [];
    for (let i = 0; i < 4; i += 1) { await user.tab(); order.push(document.activeElement); }
    expect(order[0]).toBe(document.querySelector('.mushaf-viewport'));
    expect(order[1]).toBe(next);
    expect(order.slice(2).map((e) => e.className)).toEqual(['mushaf-ayah-num', 'mushaf-ayah-num']);
    expect(order).not.toContain(prev);
    await user.tab({ shift: true }); await user.tab({ shift: true });
    expect(document.activeElement).toBe(next);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(document.querySelector('.mushaf-viewport'));
  });

  it('a disabled previous button cannot take focus or fire; an enabled one is a native button that fires only its own handler', async () => {
    const user = newUser();
    const onPrev = vi.fn(); const onNext = vi.fn(); const onToggleChrome = vi.fn();
    const { rerender } = renderPage({ onPrev, onNext, onToggleChrome });
    const prev = screen.getByRole('button', { name: /previous/i });
    prev.focus();
    expect(document.activeElement).not.toBe(prev);
    await user.click(prev);
    expect(onPrev).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToggleChrome).not.toHaveBeenCalled();
    rerender(<QuranMushafPage verses={[verse(1)]} chapters={[]} pageNum={1} navMode="page" fontSize={28} showTrans={false} ui={getUI('en')} isBookmarked={() => false} onToggleBookmark={() => {}} getBookmark={() => null} onPrev={onPrev} onNext={onNext} canPrev canNext chromeHidden={false} onToggleChrome={onToggleChrome} progressLabel="" />);
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onToggleChrome).not.toHaveBeenCalled();
  });

  it('Enter and Space on the group still toggle the reading controls, exactly once each; keys on inner buttons do not', async () => {
    const user = newUser();
    const onToggleChrome = vi.fn();
    renderPage({ onToggleChrome });
    const group = screen.getByRole('group', { name: /toggle reading view controls/i });
    group.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onToggleChrome).toHaveBeenCalledTimes(2);
    screen.getByRole('button', { name: /next/i }).focus();
    await user.keyboard('{Enter}');
    expect(onToggleChrome).toHaveBeenCalledTimes(2);
  });

  it.each(LOCALES.map((l) => [l.lang]))('%s: page-turn buttons keep their glyphs and localized names', (lang) => {
    const ui = getUI(lang);
    renderPage({ ui, canPrev: true });
    const prev = screen.getByRole('button', { name: ui.prevPage || 'Previous' });
    const next = screen.getByRole('button', { name: ui.nextPage || 'Next' });
    expect([prev.textContent, next.textContent]).toEqual(['‹', '›']);
  });
});

// ── Stylesheet wiring ─────────────────────────────────────────────────────
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const QURAN_CSS = stripComments(read('src/styles/quran.css'));
const MUSHAF_CSS = stripComments(read('src/styles/quran-mushaf.css'));
const blocks = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return [...css.matchAll(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]);
};
const block = (css, selector) => blocks(css, selector)[0] ?? null;
// The body of the `@media (max-width: 900px)` block that holds the drawer rules.
const mobileBody = () => {
  const start = QURAN_CSS.indexOf('@media (max-width: 900px) {\n  .qlc { height: 100vh');
  expect(start).toBeGreaterThan(-1);
  let depth = 0; let i = QURAN_CSS.indexOf('{', start);
  const from = i + 1;
  for (; i < QURAN_CSS.length; i += 1) { if (QURAN_CSS[i] === '{') depth += 1; if (QURAN_CSS[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return QURAN_CSS.slice(from, i);
};
const px = (b, prop) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`).exec(b)?.[1]);

describe('stylesheet wiring for the four Wave 5 items', () => {
  it('drawer: the head strip is exactly the close button box (top + height + top), the button stays 30x30 (>= 24) in the top-right corner, and nothing uses z-index to hide a tab', () => {
    const mobile = mobileBody();
    const close = mobile.match(/\.qlc__sidebar-close\s*\{([^}]*)\}/)[1];
    const sidebar = mobile.match(/\.qlc__sidebar\s*\{([^}]*)\}/)[1];
    expect(px(close, 'width')).toBe(30);
    expect(px(close, 'height')).toBe(30);
    expect(px(close, 'width')).toBeGreaterThanOrEqual(24);
    expect(px(close, 'top')).toBe(8);
    expect(px(close, 'right')).toBe(8);
    expect(px(sidebar, 'padding-top')).toBe(px(close, 'top') + px(close, 'height') + px(close, 'top'));
    // The tabs were not restyled to make room: no rule on .qlc__nav-tab(s) in the drawer media block.
    expect(mobile).not.toMatch(/\.qlc__nav-tab/);
    // z-index on the close button is the pre-existing 2; the tabs never get one.
    expect(close).toMatch(/z-index:\s*2/);
    expect(block(QURAN_CSS, '.qlc__nav-tab')).not.toMatch(/z-index/);
    expect(block(QURAN_CSS, '.qlc__nav-tabs')).not.toMatch(/z-index/);
    // Above 900px the button is still display:none, so desktop is untouched.
    expect(block(QURAN_CSS, '.qlc__sidebar-close')).toMatch(/display:\s*none/);
    expect(QURAN_CSS.match(/padding-top:\s*46px/g)).toHaveLength(1);
  });

  it('.mushaf-navbtn: a :focus-visible rule shows the enabled button fully, with a ring; hover-only reveal and the disabled rule are kept; no outline is removed', () => {
    const focus = block(MUSHAF_CSS, '.mushaf-viewport .mushaf-navbtn:focus-visible:not(:disabled)');
    expect(focus).not.toBeNull();
    expect(focus).toMatch(/opacity:\s*1;/);
    expect(focus).not.toMatch(/!important/);
    expect(focus).toMatch(/outline:\s*var\(--ring-width\)\s+solid\s+var\(--ring-color\)/);
    expect(focus).toMatch(/outline-offset:\s*1px/);
    // pointer reveal unchanged
    expect(block(MUSHAF_CSS, '.mushaf-viewport:hover .mushaf-navbtn')).toMatch(/opacity:\s*\.85/);
    expect(block(MUSHAF_CSS, '.mushaf-navbtn')).toMatch(/opacity:\s*0;/);
    expect(block(MUSHAF_CSS, '.mushaf-navbtn:disabled')).toMatch(/opacity:\s*0\s*!important/);
    expect(MUSHAF_CSS.indexOf('.mushaf-navbtn:focus-visible')).toBeGreaterThan(MUSHAF_CSS.indexOf('.mushaf-viewport:hover .mushaf-navbtn'));
    expect(MUSHAF_CSS).not.toMatch(/\.mushaf-navbtn[^{]*\{[^}]*outline:\s*none/);
  });

  it('.qlc__cbar-select: :focus-visible adds a ring outline (width / colour / offset from the focus-ring tokens) on top of the border colour; value, options and behaviour are not touched', () => {
    const b = block(QURAN_CSS, '.qlc .qlc__cbar-select:focus-visible');
    expect(b).not.toBeNull();
    expect(b).toMatch(/outline:\s*var\(--ring-width\)\s+solid\s+var\(--ring-color\)/);
    expect(b).toMatch(/outline-offset:\s*var\(--ring-offset\)/);
    expect(b).toMatch(/border-color:\s*var\(--green\)/);
    // It outranks the themed dark border (.qlc--dark .qlc__cbar-select) that used to swallow the :focus colour.
    expect(QURAN_CSS.indexOf('.qlc .qlc__cbar-select:focus-visible')).toBeGreaterThan(QURAN_CSS.indexOf('.qlc__cbar-select:focus {'));
    expect(block(QURAN_CSS, '.qlc__cbar-select:focus')).toMatch(/outline:\s*none/); // mouse focus keeps its look
  });

  it('Wave 4 tokens and selectors are still wired (no contrast regression in the stylesheet)', () => {
    expect(blocks(QURAN_CSS, '.qlc').find((x) => /--qlc-label/.test(x))).toMatch(/--qlc-label:\s*#3d6b54;\s*--qlc-muted:\s*#4a6a5a;/);
    expect(blocks(QURAN_CSS, '.qlc--dark').find((x) => /--qlc-label/.test(x))).toMatch(/--qlc-label:\s*#7ac898;\s*--qlc-muted:\s*#8fb8a4;/);
    expect(block(QURAN_CSS, '.qlc__cbar-label')).toMatch(/color:\s*var\(--qlc-label\)/);
    expect(block(QURAN_CSS, '.qlc--dark .qlc__nav-tab.active')).toMatch(/color:\s*var\(--qlc-label\)/);
    expect(MUSHAF_CSS).not.toMatch(/#8a7440|#8a6d1a/i);
    expect(QURAN_CSS.match(/--ring-color:/g)).toHaveLength(2);
  });
});
