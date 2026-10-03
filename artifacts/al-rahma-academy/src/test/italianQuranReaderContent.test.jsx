import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, act, fireEvent, render } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, bodyStrings } from './utils/fullPageRender';
import { LangProvider } from '../context/LangContext';
import Quran from '../pages/Quran';
import VerseCardModal from '../components/ui/VerseCardModal';
import { RECITERS } from '../api/quran';
import { TRANSLATIONS, TAFASEER, JUZ_NAMES, UI } from '../data/quranLangs';
import { CONTROLS_PANELS_TEXT } from '../i18n/quran/controlsPanels';
import { QURAN_A11Y_TEXT } from '../i18n/quran/a11yLabels';
import { VERSE_CARD_MODAL_TEXT } from '../i18n/quran/verseCardModal';
import { KBD_SIDE_PANEL_TEXT, pickKbdSidePanel } from '../i18n/quran/kbdSidePanel';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Quran Reader content readiness. Content only: /it/tools/quran-reader
// is NOT published here (no manifest entry, no sitemap URL). The Arabic verse
// text, references, reciters, Quran.com endpoints and the audio/fetch/cache
// logic are untouched; no Italian translation of the Quran is invented (the
// reader keeps offering the existing Quran.com translation list, whose names
// are source data).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const shaFile = (rel) => sha(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'));
// pages/Quran.jsx is pinned to its origin/main content with ONE allowed difference: the
// Italian breadcrumb prerequisite, i.e. the hidden-breadcrumb gate widened from 'fr' to
// 'fr' + 'it' (quranReaderItalianBreadcrumb.test.jsx). That exact block is normalised back
// to the original line before hashing; it must match exactly once, and any other
// difference in the file still fails the hash.
const BREADCRUMB_GATE_NEW = `      {/* Italian Quran Reader breadcrumb prerequisite: 'it' joins 'fr' so the Italian
          page writes the BreadcrumbList that waitForHydratedSeo() requires. */}
      {(siteLang === 'fr' || siteLang === 'it') && (
`;
const BREADCRUMB_GATE_OLD = "      {siteLang === 'fr' && (\n";
const shaQuranPage = () => {
  const text = fs.readFileSync(path.resolve(__dirname, '../pages/Quran.jsx'), 'utf8').replace(/\r\n/g, '\n');
  expect(text.split(BREADCRUMB_GATE_NEW)).toHaveLength(2);
  return sha(text.replace(BREADCRUMB_GATE_NEW, BREADCRUMB_GATE_OLD));
};
const fn = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? `fn:${v.toString()}` : v));
const ARABIC = /[؀-ۿ]/;
const BASMALAH = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });
const press = async (key) => { await act(async () => { fireEvent.keyDown(window, { key }); }); await settle(); };
const click = async (el) => { await act(async () => { fireEvent.click(el); }); await settle(); };
const button = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent));
const setWebdriver = (value) => Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
let playSpy;

beforeEach(() => {
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

describe('protected content and logic are untouched (SHA-256 baselines from origin/main)', () => {
  it('API, cache, audio/recording/hifz/keyboard logic and player components are byte-identical', () => {
    expect({
      'api/quran.js': shaFile('api/quran.js'),
      'api/cache.js': shaFile('api/cache.js'),
      'pages/Quran.jsx': shaQuranPage(),
      'hooks/useQuranHifz.js': shaFile('hooks/useQuranHifz.js'),
      'hooks/useQuranKeyboard.js': shaFile('hooks/useQuranKeyboard.js'),
      'hooks/useQuranRecorder.js': shaFile('hooks/useQuranRecorder.js'),
      'hooks/useQuranVerseActions.js': shaFile('hooks/useQuranVerseActions.js'),
      'QuranPlayer.jsx': shaFile('components/features/quran/QuranPlayer.jsx'),
      'QuranSyncPlayer.jsx': shaFile('components/features/quran/QuranSyncPlayer.jsx'),
      'QuranTopBar.jsx': shaFile('components/features/quran/QuranTopBar.jsx'),
      'QuranMushafPage.jsx': shaFile('components/features/quran/QuranMushafPage.jsx'),
      'QuranQuickNav.jsx': shaFile('components/features/quran/QuranQuickNav.jsx'),
      'QuranFloatingBar.jsx': shaFile('components/features/quran/QuranFloatingBar.jsx'),
      'QuranControls.jsx': shaFile('components/features/quran/QuranControls.jsx'),
      'VerseCardModal.jsx': shaFile('components/ui/VerseCardModal.jsx'),
    }).toEqual({
      'api/quran.js': '84ad13d403c5ee7f879365971a2140044c85c8c32db2d7c62c702692fd8d1c88',
      'api/cache.js': '90177f0efbcb4469686bb4cd3e45cc61571c0ca7d463a2a8e57f0091c43694e8',
      'pages/Quran.jsx': '94eb77a59a66dd5877eb8308005a0fb492aa9a229861a6dd9d5a884bd6697dc9',
      'hooks/useQuranHifz.js': 'ebe302da6774384cf7e60a18e27d60a64355caa7bb308175978f7138f7f73465',
      'hooks/useQuranKeyboard.js': 'fa801ef69dec3cf88795f7a68560259a852a2b366175ebf7b4f1ba3fe2f8513e',
      'hooks/useQuranRecorder.js': '67313e3e6f0901a0e7f3dce93d188930070548c56ff52247fe6958da1e6161fe',
      'hooks/useQuranVerseActions.js': '62db82585fc6e1916d1141da0e8d4a8e43dbe137fa02cceb93ba9de726a54316',
      'QuranPlayer.jsx': '68b95ebc8b5d04fdd35869a5af94182cedaef4e62365b73b6094e91dd9a07f7b',
      'QuranSyncPlayer.jsx': 'fee945ca559d9982274a29a73cdade9ff293dc49377a0a9f6dc6f20df5146e90',
      'QuranTopBar.jsx': '5b373ad4e5658fe48e8b808f60786db8e9c873098649710e4d2fe3c1aeddb5de',
      'QuranMushafPage.jsx': 'bbf4e79f624571929126fc14e58f51782189a15bbc1d74f8c26edfdf10c4a3a1',
      'QuranQuickNav.jsx': '0f90851769995c31838f36c58696035601d458c78a35ba83f99561ae3b22fbd8',
      'QuranFloatingBar.jsx': '4ca9988c516af36a7268cebbb1f981feae937003955d315f47e4d050ca03ce0a',
      'QuranControls.jsx': '632d50383d2320b936db51acd65d12f8a16347db711e73d6b66a6677aa724add',
      'VerseCardModal.jsx': '8bbf6f558ffb6d3394a67e1d83209588508d298e88a84ffdf2899a38b25e1ce4',
    });
  });

  it('reciters, translation list, tafsir list, juz names and every non-Italian reader UI object are unchanged', () => {
    expect(sha(fn(RECITERS))).toBe('668143e8cacadfe2b0256168d6891496a3d5ce6a9b82c5b0322e6424c736bf19');
    expect(sha(fn(TRANSLATIONS))).toBe('8b59399549e158aea15ce4b87cdb31381a4625f5b942da5e11f75420d906829f');
    expect(sha(fn(TAFASEER))).toBe('48ad894a3e367fc936af56f3b6f1ad011e51456a6925e5b522129c2759f50e11');
    expect(sha(fn(JUZ_NAMES))).toBe('cf808a6499ca826ec51e64397cd458d705a0aa23f4240cb921b6c63862f2868c');
    const ui = Object.fromEntries(['en', 'ar', 'fr', 'de', 'es', 'tr', 'id', 'ru'].map((l) => [l, sha(fn(UI[l]))]));
    expect(ui).toEqual({
      en: '34dfcb374f26554533d40114444747e6ff3d90d7a0c23b5abe8b370f651f7c55',
      ar: '24cff4f19c8f733812afcdf2094b3dc6efde17eb84915bcc8b81290b6df57c9a',
      fr: '1ecdfe11924d5839e3cf85deeffbdad8d9a72807a7a0ef98ced2718991b638be',
      de: '50e8be33e9eb2b143817b611dc4050e517105af5ef59d7cbf282af7afdcf8a2f',
      es: 'af32adfbd5c4923c95a390b58190348f97c201fe3096f736c4c76245646f7220',
      tr: '5dbd36111a1df85e135462dfcad0e5688001fbb6369884e170c74a9f10a17b17',
      id: '92f73e3a3869acd36d57fb01a900ed20bb31965b56f301cc3ad1967f06beb663',
      ru: '1f5fccaff1b3dda350c8e1fc29736436e5af8bbd5db60d6e7216b4de9f8a5526',
    });
  });

  it('the existing en/fr/ar text modules keep their exact original content', () => {
    expect(sha(fn(CONTROLS_PANELS_TEXT.en))).toBe('c8c85367c58f1e92bf590673d39b364e486f9fe35bf01077911eae588b910533');
    expect(sha(fn(CONTROLS_PANELS_TEXT.fr))).toBe('1cc7a30e07d41ed4306203b1913cdcce5797854193a6eeb2fa301ab61fb9aa87');
    expect(sha(fn(QURAN_A11Y_TEXT.en))).toBe('484db1e65d28ba2b2d4e59a3c095a491e1c70d359a911a48d4b366d67044e5a2');
    expect(sha(fn(QURAN_A11Y_TEXT.fr))).toBe('e28423ec474157ef114c9f3fb41a6545b296dd0cead2155e20dee4347f381474');
    expect(sha(fn(VERSE_CARD_MODAL_TEXT.en))).toBe('b18a2a74353ff70e34961e384ef85eeb54a6de9c6ef6e183e5999c7f0473b448');
    expect(sha(fn(VERSE_CARD_MODAL_TEXT.fr))).toBe('57d207b7e9ae88952e2ce2e06e409dbc0f0e3fb591b11207df906eaf1b523c04');
    expect(sha(fn(KBD_SIDE_PANEL_TEXT.ar))).toBe('226ead782851c03cd89f624a08710823c1ba9b5390b7e391d1ee5905c2e8194c');
    expect(sha(fn(KBD_SIDE_PANEL_TEXT.fr))).toBe('87b4665fdcdc127cc615ba762d53a641121abdc06054a3629b241f190a87204a');
  });

  it('EN/AR/FR/ES/DE reader renders (prerender capture and every real-visitor panel) match origin/main', async () => {
    const out = {};
    for (const loc of ['en', 'ar', 'fr', 'es', 'de']) {
      const p = loc === 'en' ? '/tools/quran-reader' : `/${loc}/tools/quran-reader`;
      setWebdriver(true);
      await mountFullPage(p, Quran);
      out[`${loc}.prerender`] = sha(JSON.stringify({ t: document.title, b: document.querySelector('#main-content')?.innerHTML ?? document.body.innerHTML }));
      cleanup();
      setWebdriver(false);
      await mountFullPage(p, Quran);
      await settle();
      const states = [document.body.innerHTML];
      await press('?'); states.push(document.body.innerHTML); await press('?');
      await press('g'); states.push(document.body.innerHTML); await press('g');
      await press('k'); states.push(document.body.innerHTML); await press('k');
      await press('/'); states.push(document.body.innerHTML); await press('Escape');
      const hifz = [...document.querySelectorAll('.qlc__tab, button')].find((b) => /Hifz|Memoriz|Mémoris|حفظ|Auswendig|Memoriz/i.test(b.textContent));
      if (hifz) { await click(hifz); states.push(document.body.innerHTML); }
      // The Arabic page races its first load: some buttons are `disabled` for a moment.
      // That is unrelated to this change, so it is normalised away.
      out[`${loc}.visitor`] = sha(JSON.stringify(states).replace(/ disabled=\\"\\"/g, ''));
      cleanup();
    }
    expect(out).toEqual({
      'en.prerender': '4132f9c7a1656807ded1947e0597605deab4ced4ad07ebd770dd846392d5b3f9',
      'en.visitor': 'f3bce705fcd3921485a17728153c92b3dc44d47dbf47449a94016e0fd59ae939',
      'ar.prerender': 'dc4eeb3ab04987e1233d60ea3081353a2af822f8c09ac30531a021df52b84fd1',
      'ar.visitor': 'af12b5440e97f5d4cc5c96110312897fbc3ed671bdc00f8521531734352df45f',
      'fr.prerender': '7dc5207971e4ff8537c420e34e4359917cc4a43572f0907ab3d0c67e3a02eaed',
      'fr.visitor': 'bb39190f455ffb30dbb50b99557228ca025a91a13d49f695dd6bd55422220191',
      'es.prerender': '0302fdbf11c4ce87822489cad77e4b1cc928d4c4a630f76c7a1d68340c1adfee',
      'es.visitor': '391f90794e1beb5747f37a5b6031d249dff4c202a0a75ad8b9d7f91c10479177',
      'de.prerender': '0ff77fec5ea0e2d291f8c191e814425a4f70e40d60ea34b95b7b9e7931976528',
      'de.visitor': '5c1010c08b742a59e042b131343c97c48e019e5d6510311b64ccc0bc7d40dfe9',
    });
  });
});

describe('keyboard shortcuts side panel: complete Italian, keys untouched', () => {
  const PHYSICAL_KEYS = ['Space', '← →', '+ / −', 'T', 'D', 'G', '?', 'P', 'Esc'];

  it('defines every key the component consumes (tab, title, close, dir and the nine rows), in the original order', () => {
    const it = KBD_SIDE_PANEL_TEXT.it;
    expect(Object.keys(it).sort()).toEqual(Object.keys(KBD_SIDE_PANEL_TEXT.ar).sort());
    expect(Object.keys(it.rows)).toEqual(PHYSICAL_KEYS);
    expect(Object.keys(it.rows)).toEqual(Object.keys(KBD_SIDE_PANEL_TEXT.ar.rows));
    expect(it.dir).toBe('ltr');
    for (const v of [it.tab, it.title, it.close, ...Object.values(it.rows)]) {
      expect(v.length).toBeGreaterThan(1);
      expect(v).not.toMatch(ARABIC);
    }
    expect(pickKbdSidePanel('it')).toBe(it);
    // every other language still resolves exactly as before
    expect(pickKbdSidePanel('fr')).toBe(KBD_SIDE_PANEL_TEXT.fr);
    for (const l of ['en', 'ar', 'es', 'de']) expect(pickKbdSidePanel(l)).toBe(KBD_SIDE_PANEL_TEXT.ar);
  });

  it('renders as Italian LTR on /it/ with the physical key names unchanged', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    const panel = document.querySelector('.qlc__ksp');
    expect(panel.querySelector('.qlc__ksp-body').getAttribute('dir')).toBe('ltr');
    expect(panel.querySelector('.qlc__ksp-tab-text').textContent).toBe('Tasti');
    expect(panel.querySelector('.qlc__ksp-title').textContent).toBe('⌨ Scorciatoie da tastiera');
    expect(panel.querySelector('.qlc__ksp-close').textContent).toBe('Chiudi ✕');
    expect([...panel.querySelectorAll('.qlc__kbd')].map((k) => k.textContent)).toEqual(PHYSICAL_KEYS);
    expect([...panel.querySelectorAll('.qlc__ksp-label')].map((l) => l.textContent)).toEqual(Object.values(KBD_SIDE_PANEL_TEXT.it.rows));
    expect(panel.textContent).not.toMatch(ARABIC);
    expect(panel.querySelector('.qlc__ksp-tab').getAttribute('title')).toBe('Scorciatoie da tastiera (K)');
    await press('k');
    expect(panel.classList.contains('open')).toBe(true);
  });
});

describe('every reader panel is Italian on /it/ (no Arabic or English interface fallback)', () => {
  const EN_UI = [
    ...Object.values(CONTROLS_PANELS_TEXT.en).filter((v) => typeof v === 'string'),
    ...Object.values(CONTROLS_PANELS_TEXT.en.groups), ...Object.values(CONTROLS_PANELS_TEXT.en.items),
    ...Object.values(CONTROLS_PANELS_TEXT.en.themes), ...Object.values(CONTROLS_PANELS_TEXT.en.widths),
    ...Object.values(QURAN_A11Y_TEXT.en).filter((v) => typeof v === 'string'),
  ].filter((s) => s.length > 3 && !Object.values(CONTROLS_PANELS_TEXT.it).includes(s) && s !== 'Sepia');

  it('shortcuts modal, settings panel and the quick-nav field use the Italian text', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await press('?');
    const modal = document.querySelector('.qlc__shortcuts').textContent;
    const cp = CONTROLS_PANELS_TEXT.it;
    for (const s of [cp.shortcutsTitle, ...Object.values(cp.groups), ...Object.values(cp.items)]) expect(modal, s).toContain(s);
    expect(modal).not.toMatch(ARABIC);
    // physical keys inside the modal are not translated
    expect([...document.querySelectorAll('.qlc__shortcuts kbd')].map((k) => k.textContent)).toEqual(['Space', 'Esc', '← →', '1–9', '+ / −', 'T', 'D', '?', 'G', 'K', 'P']);
    await press('?');
    await press('g');
    const settings = document.querySelector('.qlc__settings, .qlc__panel') ?? document.body;
    for (const s of [cp.settingsTitle, cp.arabicFontSize, cp.readingTheme, cp.lineSpacing, cp.contentWidth, cp.appearance, cp.showTranslation, ...Object.values(cp.widths), ...Object.values(cp.themes)]) {
      expect(settings.textContent, s).toContain(s);
    }
    await press('g');
    await press('/');
    expect(document.querySelector('.qlc__quicknav input, input[placeholder*="Vai a"]').getAttribute('placeholder')).toBe(UI.it.quickNavPlaceholder);
  });

  it('no English interface string and no Arabic interface string is left (Arabic only in source text)', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await press('?'); await press('?'); await press('g'); await press('g'); await press('k');
    const strings = [...bodyStrings()];
    const bare = strings.map((x) => x.replace(/^@[a-z-]+: /, ''));
    for (const s of EN_UI) expect(bare, s).not.toContain(s);
    for (const s of ['↵ Go', 'ON', 'OFF', 'Select Tafsir', 'Keyboard Shortcuts', 'Settings (G)', 'Quick navigation', 'Dark mode (D)', 'Print (P)', 'Decrease font size']) {
      expect(strings, s).not.toContain(s);
    }
    // The only Arabic left in the first screen: the verse text, the chapter name,
    // the Arabic tafsir names (source titles), the Arabic translation-list entry
    // ("ar" endonym + its Quran.com name) and the Arabic-Indic verse numbers.
    const arabic = strings.filter((s) => ARABIC.test(s));
    const allowed = new Set([
      'نص', 'س', '۝', '١', '٢', BASMALAH,
      ...TAFASEER.map((t) => t.name),
      ...TRANSLATIONS.flatMap((t) => [t.label, t.name]),
    ]);
    expect(arabic.filter((s) => !allowed.has(s))).toEqual([]);
    // tooltips / aria-labels
    const a11y = QURAN_A11Y_TEXT.it;
    for (const s of [a11y.quranKbdShortcutsTab, a11y.quranQuickNavTab, a11y.quranSettingsTab, a11y.quranKbdPanelTab, a11y.quranDarkModeTab, a11y.quranPrintTab]) {
      expect(strings, s).toContain(`@title: ${s}`);
    }
    for (const s of [a11y.quranDecreaseFont, a11y.quranIncreaseFont, a11y.quranPlayerSpeedGroup]) {
      expect(strings, s).toContain(`@aria-label: ${s}`);
    }
  });

  it('verse-by-verse actions, the tafsir picker and the tafsir panel are Italian', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await click(button(/Versetto per versetto/));
    const a11y = QURAN_A11Y_TEXT.it;
    const titles = [...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title'));
    for (const s of [a11y.quranCopyVerseText, a11y.quranCopyVerseLink, a11y.quranShareVerseCard, UI.it.tafsirVerseTitle]) expect(titles, s).toContain(s);
    expect(document.body.textContent).toContain(UI.it.go);
    await click(document.querySelector('.qlc__tafsirbtn'));
    const picker = document.querySelector('.qlc__tafsir-picker');
    expect(picker.getAttribute('dir')).toBe('ltr');
    expect(picker.querySelector('.qlc__tafsir-picker-head span').textContent).toBe('📚 Scegli il tafsir');
    expect([...picker.querySelectorAll('.qlc__tafsir-picker-cat')].map((e) => e.textContent)).toEqual(['Tafsir in arabo', 'Tafsir in altre lingue']);
    // source tafsir titles stay as published
    expect([...picker.querySelectorAll('.qlc__tafsir-picker-name')].map((e) => e.textContent)).toContain('ابن كثير');
    await click(picker.querySelector('.qlc__tafsir-picker-item'));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(document.querySelector('.qlc__tafsir-err').textContent).toBe('⚠ Tafsir non disponibile per questo versetto.');
    expect(document.querySelector('.qlc__tafsir-panel').textContent).not.toMatch(/التفسير غير متوفر/);
    // the reading-controls tafsir select
    const select = [...document.querySelectorAll('select.qlc__cbar-select')].find((s) => s.querySelector('optgroup'));
    expect(select.querySelector('option[value="0"]').textContent).toBe('— Scegli un tafsir —');
    expect(select.querySelector('optgroup').getAttribute('label')).toBe('Tafsir in arabo');
    expect(select.querySelectorAll('optgroup')[1].getAttribute('label')).toBe('Altre lingue');
  });

  it('sidebar khatm tab, progress and reset are Italian', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await click(button(/^Khatm$/));
    const sidebar = document.querySelector('.qlc__sidebar').textContent;
    expect(sidebar).toContain('0/114 sure');
    expect(sidebar).toContain('Nuovo khatm ↺');
    expect(sidebar).not.toMatch(/ختمة|سورة/);
  });

  it('hifz test mode toggle and recording errors are Italian', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await click(button(/Memorizzazione/));
    await click(button(/Prova di memorizzazione/));
    const toggle = document.querySelector('.qlc__cbar-toggle');
    expect(toggle.textContent).toBe('Attivo');
    await click(toggle.querySelector('input'));
    expect(document.querySelector('.qlc__cbar-toggle').textContent).toBe('Disattivo');
    // every English message the recorder hook can raise has an Italian counterpart
    const hook = fs.readFileSync(path.resolve(__dirname, '../hooks/useQuranRecorder.js'), 'utf8');
    for (const [en, itl] of Object.entries(UI.it.recordingErrors)) {
      expect(hook, en).toContain(`'${en}'`);
      expect(itl).not.toMatch(ARABIC);
    }
    expect(Object.keys(UI.it.recordingErrors)).toHaveLength(3);
  });

  it('the shareable verse card is Italian on /it/ and unchanged in English elsewhere', () => {
    const verse = { verse_key: '1:1', text_uthmani: 'بِسْمِ اللَّهِ', translations: [{ text: 'In the name of Allah' }] };
    window.history.replaceState({}, '', '/it/tools/quran-reader');
    const { container, unmount } = render(<LangProvider><VerseCardModal verse={verse} chapterName="Al-Fatiha" onClose={() => {}} /></LangProvider>);
    const vc = VERSE_CARD_MODAL_TEXT.it;
    expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe(vc.dialogLabel);
    expect(container.querySelector('.vcard-modal__close').getAttribute('aria-label')).toBe(vc.close);
    for (const s of [vc.copyLink, vc.saveAsImage, vc.hint, `${vc.quran} · 1:1`]) expect(container.textContent, s).toContain(s);
    expect(container.textContent).toContain(verse.text_uthmani);
    expect(container.textContent).not.toContain(VERSE_CARD_MODAL_TEXT.en.hint);
    unmount();
  });
});

describe('Italian a11y text covers every key the English module has', () => {
  it('a11y, controls and verse-card modules: same keys as en, no Arabic, nothing empty', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(QURAN_A11Y_TEXT.it)).toEqual(keys(QURAN_A11Y_TEXT.en));
    expect(keys(CONTROLS_PANELS_TEXT.it)).toEqual(keys(CONTROLS_PANELS_TEXT.en));
    expect(keys(CONTROLS_PANELS_TEXT.it.items)).toEqual(keys(CONTROLS_PANELS_TEXT.en.items));
    expect(keys(CONTROLS_PANELS_TEXT.it.groups)).toEqual(keys(CONTROLS_PANELS_TEXT.en.groups));
    expect(keys(VERSE_CARD_MODAL_TEXT.it)).toEqual(keys(VERSE_CARD_MODAL_TEXT.en));
    for (const v of Object.values(QURAN_A11Y_TEXT.it)) {
      const s = typeof v === 'function' ? v(7) : v;
      expect(s.length).toBeGreaterThan(1);
      expect(s).not.toMatch(ARABIC);
    }
    expect(QURAN_A11Y_TEXT.it.quranPlayerSpeedOption(1.5)).toBe('Velocità 1.5×');
    expect(QURAN_A11Y_TEXT.it.qiblaDirectionAria(45)).toBe('Direzione della Qibla: 45 gradi da nord');
  });
});

describe('Italian page metadata, loading and error states', () => {
  it('SEO title/description are Italian and the h1 placeholder is Italian before data loads', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/quran-reader', Quran);
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toContain('Leggi e ascolta il Corano');
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(UI.it.seoDescription);
    expect(document.querySelector('h1').textContent).toBe('Centro di apprendimento del Corano');
  });

  it('prerender capture fetches nothing and shows no verse, chapter or audio data', async () => {
    setWebdriver(true);
    await mountFullPage('/it/tools/quran-reader', Quran);
    for (const m of Object.values(mocks)) expect(m).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.querySelector('.qlc__arabic, .qlc__chapter-ar')).toBeNull();
    expect(document.querySelector('#main-content').textContent).not.toMatch(/\d{1,3}:\d{1,3}/);
  });

  it('a failed verse load shows the Italian error text', async () => {
    mocks.getVerses.mockReset().mockRejectedValue(new Error('offline'));
    await mountFullPage('/it/tools/quran-reader', Quran);
    expect(document.body.textContent).toContain('Impossibile caricare questo contenuto.');
    expect(document.querySelector('.qlc__arabic')).toBeNull();
  });

  it('real-visitor load keeps the Quran.com data path: the Arabic verse, its reference and the translation id are untouched', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    expect(mocks.getVerses).toHaveBeenCalledWith(1, 153);
    expect(document.body.textContent).toContain('نص');
    expect(document.body.textContent).toContain('1:1');
    expect(TRANSLATIONS.find((t) => t.lang === 'it')).toEqual({ lang: 'it', id: 153, label: 'Italiano', flag: '🇮🇹', name: 'Hamza Piccardo' });
  });

  it('no real audio is played and no real network is used while exercising every panel', async () => {
    await mountFullPage('/it/tools/quran-reader', Quran);
    await press('?'); await press('?'); await press('g'); await press('g'); await press('k'); await press('/'); await press('Escape');
    expect(playSpy).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('nothing is published by this change', () => {
  it('/it/tools/quran-reader has no manifest entry and no sitemap URL; sitemap stays 133 (IT 35)', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/tools/quran-reader' && e.status === 'published').map((e) => e.locale)).toEqual(['fr']);
    const xml = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(133);
    expect(locs.filter((u) => u.includes('/it/'))).toHaveLength(35);
    expect(locs.filter((u) => u.endsWith('/tools/quran-reader'))).toEqual(['https://al-rahmaacademy.com/fr/tools/quran-reader']);
  });
});
