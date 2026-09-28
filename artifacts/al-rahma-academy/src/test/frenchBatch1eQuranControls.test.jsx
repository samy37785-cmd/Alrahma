import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LangProvider } from '../context/LangContext';
import { QURAN_A11Y_TEXT as A11Y_LABELS_TEXT } from '../i18n/quran/a11yLabels';
import { CONTROLS_PANELS_TEXT } from '../i18n/quran/controlsPanels';
import { VERSE_CARD_MODAL_TEXT } from '../i18n/quran/verseCardModal';

// French Localization Batch 1E: the Quran Reader's settings panel, keyboard-
// shortcuts modal, player, reading controls, verse-list action buttons and
// shareable verse card had accessibility labels and/or visible text
// hardcoded in English with no lang branch at all -- every language,
// Arabic included, always saw this English text. This mounts each affected
// component directly (no router needed; none of them use it) under both
// English and French, and checks the exact literal en/fr values.
//
// The `en` values checked here are the ones the test also imports from the
// same i18n modules the components now read from -- proving both "the
// component renders exactly this" and "this value is the literal that
// shipped before" in one assertion, since those `en` blocks are the
// pre-existing hardcoded text, unchanged.

let QuranControls;
let QuranPlayer;
let QuranReadingControls;
let QuranVerseList;
let VerseCardModal;
let getUI;

function setPath(p) {
  window.history.replaceState({}, '', p);
}

function withLang(path, node) {
  setPath(path);
  return render(<LangProvider>{node}</LangProvider>);
}

beforeAll(async () => {
  const controls = await import('../components/features/quran/QuranControls');
  QuranControls = controls;
  QuranPlayer = (await import('../components/features/quran/QuranPlayer')).default;
  QuranReadingControls = (await import('../components/features/quran/QuranReadingControls')).default;
  QuranVerseList = (await import('../components/features/quran/QuranVerseList')).default;
  VerseCardModal = (await import('../components/ui/VerseCardModal')).default;
  getUI = (await import('../data/quranLangs')).getUI;
});

afterEach(() => cleanup());

describe('Quran Reader: SettingsPanel (French Batch 1E)', () => {
  const props = {
    fontSize: 34, setFontSize: () => {},
    darkMode: false, setDarkMode: () => {},
    showTrans: true, setShowTrans: () => {},
    readingTheme: 'light', setReadingTheme: () => {},
    lineHeight: 2.3, setLineHeight: () => {},
    contentWidth: 'wide', setContentWidth: () => {},
    onClose: () => {},
  };

  it('renders every label in French under /fr, matching the exact English literal elsewhere', () => {
    const { container } = withLang('/fr/tools/quran-reader', <QuranControls.SettingsPanel {...props} />);
    const text = container.textContent;
    const cp = CONTROLS_PANELS_TEXT.fr;
    expect(text).toContain(cp.settingsTitle);
    expect(text).toContain(cp.arabicFontSize);
    expect(text).toContain(cp.readingTheme);
    expect(text).toContain(cp.themes.light);
    expect(text).toContain(cp.themes.sepia);
    expect(text).toContain(cp.themes.dark);
    expect(text).toContain(cp.lineSpacing);
    expect(text).toContain(cp.contentWidth);
    expect(text).toContain(cp.widths.narrow);
    expect(text).toContain(cp.widths.medium);
    expect(text).toContain(cp.widths.wide);
    expect(text).toContain(cp.appearance);
    expect(text).toContain(cp.showTranslation);
    expect(text).not.toContain(CONTROLS_PANELS_TEXT.en.settingsTitle);
    expect(text).not.toContain(CONTROLS_PANELS_TEXT.en.arabicFontSize);
  });

  it('renders the exact original English under every other language (en, ar, it)', () => {
    for (const path of ['/tools/quran-reader', '/ar/tools/quran-reader', '/it/tools/quran-reader']) {
      const { container, unmount } = withLang(path, <QuranControls.SettingsPanel {...props} />);
      const cp = CONTROLS_PANELS_TEXT.en;
      expect(container.textContent, path).toContain(cp.settingsTitle);
      expect(container.textContent, path).toContain(cp.readingTheme);
      expect(container.textContent, path).toContain(cp.themes.sepia);
      unmount();
    }
  });

  it('the "Appearance" dark-mode toggle branch is also French', () => {
    const { container } = withLang('/fr/tools/quran-reader', <QuranControls.SettingsPanel {...props} readingTheme={undefined} setReadingTheme={undefined} />);
    expect(container.textContent).toContain(CONTROLS_PANELS_TEXT.fr.darkMode);
  });
});

describe('Quran Reader: ShortcutsModal (French Batch 1E)', () => {
  it('every group title and item label is French under /fr', () => {
    const { container } = withLang('/fr/tools/quran-reader', <QuranControls.ShortcutsModal onClose={() => {}} />);
    const cp = CONTROLS_PANELS_TEXT.fr;
    const text = container.textContent;
    expect(text).toContain(cp.shortcutsTitle);
    for (const v of Object.values(cp.groups)) expect(text).toContain(v);
    for (const v of Object.values(cp.items)) expect(text).toContain(v);
    expect(text).not.toContain(CONTROLS_PANELS_TEXT.en.shortcutsTitle);
  });

  it('renders the exact original English under Arabic (no EN/AR change)', () => {
    const { container } = withLang('/ar/tools/quran-reader', <QuranControls.ShortcutsModal onClose={() => {}} />);
    const cp = CONTROLS_PANELS_TEXT.en;
    expect(container.textContent).toContain(cp.shortcutsTitle);
    expect(container.textContent).toContain(cp.groups.playback);
  });
});

describe('Quran Reader: KbdSidePanel tab title (French Batch 1E)', () => {
  it('the tab title attribute is French under /fr, English elsewhere', () => {
    const fr = withLang('/fr/tools/quran-reader', <QuranControls.KbdSidePanel open={false} onToggle={() => {}} />);
    expect(fr.container.querySelector('.qlc__ksp-tab').title).toBe(A11Y_LABELS_TEXT.fr.quranKbdShortcutsTab);
    fr.unmount();
    const ar = withLang('/ar/tools/quran-reader', <QuranControls.KbdSidePanel open={false} onToggle={() => {}} />);
    expect(ar.container.querySelector('.qlc__ksp-tab').title).toBe(A11Y_LABELS_TEXT.en.quranKbdShortcutsTab);
  });
});

describe('Quran Reader: QuranPlayer (French Batch 1E)', () => {
  function renderPlayer(path) {
    return withLang(path, <QuranPlayer src="https://example.com/a.mp3" audioKey="k" audioRef={{ current: null }} reciterName="Test" />);
  }

  it('every player aria-label/title is French under /fr', () => {
    const { container } = renderPlayer('/fr/tools/quran-reader');
    const a11y = A11Y_LABELS_TEXT.fr;
    expect(container.querySelector('[role="region"]').getAttribute('aria-label')).toBe(a11y.quranPlayerRegion);
    const seekEl = [...container.querySelectorAll('[aria-label]')].find((el) => el.getAttribute('aria-label') === a11y.quranPlayerPosition);
    expect(seekEl).toBeTruthy();
    expect([...container.querySelectorAll('[title]')].map((el) => el.title)).toEqual(
      expect.arrayContaining([a11y.quranPlayerRewind, a11y.quranPlayerForward]),
    );
    // Not loading, not playing -> "Play"/"Lecture".
    const playBtn = container.querySelector('.qplayer__play-btn');
    expect(playBtn.getAttribute('aria-label')).toBe(a11y.quranPlayerPlay);
    expect(container.querySelector('.qplayer__speeds').getAttribute('aria-label')).toBe(a11y.quranPlayerSpeedGroup);
    expect(container.querySelector('[aria-label="' + a11y.quranPlayerSpeedOption(1) + '"]')).toBeTruthy();
  });

  it('every other language (en, ar, it) keeps the exact original English', () => {
    for (const path of ['/tools/quran-reader', '/ar/tools/quran-reader', '/it/tools/quran-reader']) {
      const { container, unmount } = renderPlayer(path);
      const a11y = A11Y_LABELS_TEXT.en;
      expect(container.querySelector('[role="region"]').getAttribute('aria-label'), path).toBe(a11y.quranPlayerRegion);
      expect(container.querySelector('.qplayer__play-btn').getAttribute('aria-label'), path).toBe(a11y.quranPlayerPlay);
      expect(container.querySelector('.qplayer__speeds').getAttribute('aria-label'), path).toBe(a11y.quranPlayerSpeedGroup);
      unmount();
    }
  });
});

describe('Quran Reader: QuranReadingControls (French Batch 1E)', () => {
  const baseProps = (uiLang) => ({
    reciterId: 7, lang: 'en', tafsirId: 0, fontSize: 28, navMode: 'reading',
    audioUrl: '', audioRef: { current: null }, audioKey: 'k', ui: getUI(uiLang),
    onReciterChange: () => {}, onLangChange: () => {}, onTafsirChange: () => {}, onFontSizeChange: () => {},
  });

  it('"Other languages" optgroup and font buttons are French under /fr', () => {
    const { container } = withLang('/fr/tools/quran-reader', <QuranReadingControls {...baseProps('fr')} />);
    const a11y = A11Y_LABELS_TEXT.fr;
    expect(container.querySelector('optgroup[label="' + a11y.quranOtherLanguages + '"]')).toBeTruthy();
    const [dec, inc] = container.querySelectorAll('.qlc__cbar-font-btn');
    expect(dec.getAttribute('aria-label')).toBe(a11y.quranDecreaseFont);
    expect(inc.getAttribute('aria-label')).toBe(a11y.quranIncreaseFont);
  });

  it('keeps the exact original English under Arabic (the reader UI language, not the translation picker)', () => {
    const { container } = withLang('/ar/tools/quran-reader', <QuranReadingControls {...baseProps('ar')} />);
    const a11y = A11Y_LABELS_TEXT.en;
    expect(container.querySelector('optgroup[label="' + a11y.quranOtherLanguages + '"]')).toBeTruthy();
  });
});

describe('Quran Reader: QuranVerseList action buttons (French Batch 1E)', () => {
  const verse = { id: 1, verse_key: '1:1', text_uthmani: 'بِسْمِ اللَّهِ', translations: [{ text: 'In the name of Allah' }] };
  const baseProps = {
    displayVerses: [verse], tab: 'reading', hifzMode: 'repeat', isPlaying: false, curIdx: 0,
    navMode: 'surah', chapters: [], translationId: null, fontSize: 28, showTrans: false,
    revealed: {}, openTafsir: {}, tafsirId: 0, tafsirPicker: null, copiedKey: '', fromV: 1,
    repeatCount: 1, playCount: 0, showBasmalah: false, loadingVA: false, ui: {}, loading: false,
    error: null, jumpVerse: '',
    onToggleReveal: () => {}, onToggleTafsir: () => {}, onCopyVerse: () => {}, onShareVerse: () => {},
    onShowCard: () => {}, onSetTafsirPicker: () => {}, onSetTafsirId: () => {}, onPlayVerseByIndex: () => {},
    onJumpVerseChange: () => {}, onJump: () => {},
    isBookmarked: () => false, onToggleBookmark: undefined, getBookmark: () => null, onSaveNote: undefined, onSetHighlight: undefined,
  };

  it('the copy-verse and share buttons are French under /fr', () => {
    const { container } = withLang('/fr/tools/quran-reader', <QuranVerseList {...baseProps} />);
    const a11y = A11Y_LABELS_TEXT.fr;
    const titles = [...container.querySelectorAll('.qlc__actbtn')].map((b) => b.title);
    expect(titles).toContain(a11y.quranCopyVerseText);
  });

  it('keeps the exact original English under every other language', () => {
    for (const path of ['/tools/quran-reader', '/ar/tools/quran-reader']) {
      const { container, unmount } = withLang(path, <QuranVerseList {...baseProps} />);
      const titles = [...container.querySelectorAll('.qlc__actbtn')].map((b) => b.title);
      expect(titles, path).toContain(A11Y_LABELS_TEXT.en.quranCopyVerseText);
      unmount();
    }
  });
});

describe('Quran Reader: VerseCardModal (French Batch 1E)', () => {
  const verse = { verse_key: '1:1', text_uthmani: 'بِسْمِ اللَّهِ', translations: [{ text: 'In the name of Allah' }] };

  it('every dialog label, button and hint is French under /fr; the Quran API is not touched', () => {
    const { container } = withLang('/fr/tools/quran-reader', <VerseCardModal verse={verse} chapterName="Al-Fatiha" onClose={() => {}} />);
    const vc = VERSE_CARD_MODAL_TEXT.fr;
    expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe(vc.dialogLabel);
    expect(container.querySelector('.vcard-modal__close').getAttribute('aria-label')).toBe(vc.close);
    expect(container.textContent).toContain(vc.saveAsImage);
    expect(container.textContent).toContain(vc.hint);
    expect(container.textContent).toContain(vc.quran); // "Coran · 1:1"
    // The Arabic verse text itself is untouched (not translated, not altered).
    expect(container.textContent).toContain(verse.text_uthmani);
  });

  it('renders no verse at all when `verse` is null (early-return branch, unaffected by the fix)', () => {
    const { container } = withLang('/fr/tools/quran-reader', <VerseCardModal verse={null} chapterName="" onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('keeps the exact original English under every other language', () => {
    for (const path of ['/tools/quran-reader', '/ar/tools/quran-reader', '/it/tools/quran-reader']) {
      const { container, unmount } = withLang(path, <VerseCardModal verse={verse} chapterName="Al-Fatiha" onClose={() => {}} />);
      const vc = VERSE_CARD_MODAL_TEXT.en;
      expect(container.querySelector('[role="dialog"]').getAttribute('aria-label'), path).toBe(vc.dialogLabel);
      expect(container.textContent, path).toContain(vc.quran);
      unmount();
    }
  });
});
