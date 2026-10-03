// French Localization Batch 1E: the Quran Reader's English keyboard-
// shortcuts modal (ShortcutsModal) and settings panel (SettingsPanel) —
// components/features/quran/QuranControls.jsx — had no lang branch at all;
// every language (Arabic included) always saw this English text, unlike
// the panel's own reading controls, which already read from `ui`
// (data/quranLangs.js). This is a separate, deliberately un-related sibling
// of that per-page reading-controls `ui` object, scoped to just these two
// panels.
//
// `en` is the exact text the components rendered before this change. `fr`
// and `it` are added; every other language keeps seeing the same English
// text.
export const CONTROLS_PANELS_TEXT = {
  en: {
    settingsTitle: '⚙ Settings',
    arabicFontSize: 'Arabic Font Size',
    readingTheme: 'Reading Theme',
    lineSpacing: 'Line Spacing',
    contentWidth: 'Content Width',
    widths: { narrow: 'Narrow', medium: 'Medium', wide: 'Wide' },
    themes: { light: 'Light', sepia: 'Sepia', dark: 'Dark' },
    appearance: 'Appearance',
    darkMode: '🌙 Dark mode',
    showTranslation: '🌐 Show translation',
    shortcutsHintPre: 'Press',
    shortcutsHintMid: 'to see all shortcuts ·',
    shortcutsHintSide: 'side panel',
    shortcutsTitle: '⌨ Keyboard Shortcuts',
    groups: {
      playback: 'Playback',
      navigation: 'Navigation',
      display: 'Display',
      panels: 'Panels',
    },
    items: {
      playPause: 'Play / Pause',
      stop: 'Stop',
      prevNextSurah: 'Prev / Next Surah',
      jumpToSurah: 'Jump to Surah',
      fontSize: 'Font size',
      toggleTranslation: 'Toggle translation',
      darkModeItem: 'Dark mode',
      shortcuts: 'Shortcuts',
      settings: 'Settings',
      sideShortcuts: 'Side shortcuts',
      print: 'Print',
    },
  },
  fr: {
    settingsTitle: '⚙ Paramètres',
    arabicFontSize: 'Taille de la police arabe',
    readingTheme: 'Thème de lecture',
    lineSpacing: 'Interligne',
    contentWidth: 'Largeur du contenu',
    widths: { narrow: 'Étroite', medium: 'Moyenne', wide: 'Large' },
    themes: { light: 'Clair', sepia: 'Sépia', dark: 'Sombre' },
    appearance: 'Apparence',
    darkMode: '🌙 Mode sombre',
    showTranslation: '🌐 Afficher la traduction',
    shortcutsHintPre: 'Appuyez sur',
    shortcutsHintMid: 'pour voir tous les raccourcis ·',
    shortcutsHintSide: 'panneau latéral',
    shortcutsTitle: '⌨ Raccourcis clavier',
    groups: {
      playback: 'Lecture',
      navigation: 'Navigation',
      display: 'Affichage',
      panels: 'Panneaux',
    },
    items: {
      playPause: 'Lecture / Pause',
      stop: 'Arrêter',
      prevNextSurah: 'Sourate précédente / suivante',
      jumpToSurah: 'Aller à une sourate',
      fontSize: 'Taille du texte',
      toggleTranslation: 'Afficher/masquer la traduction',
      darkModeItem: 'Mode sombre',
      shortcuts: 'Raccourcis',
      settings: 'Paramètres',
      sideShortcuts: 'Raccourcis latéraux',
      print: 'Imprimer',
    },
  },
  it: {
    settingsTitle: '⚙ Impostazioni',
    arabicFontSize: 'Dimensione del testo arabo',
    readingTheme: 'Tema di lettura',
    lineSpacing: 'Interlinea',
    contentWidth: 'Larghezza del contenuto',
    widths: { narrow: 'Stretta', medium: 'Media', wide: 'Ampia' },
    themes: { light: 'Chiaro', sepia: 'Seppia', dark: 'Scuro' },
    appearance: 'Aspetto',
    darkMode: '🌙 Tema scuro',
    showTranslation: '🌐 Mostra la traduzione',
    shortcutsHintPre: 'Premi',
    shortcutsHintMid: 'per vedere tutte le scorciatoie ·',
    shortcutsHintSide: 'pannello laterale',
    shortcutsTitle: '⌨ Scorciatoie da tastiera',
    groups: {
      playback: 'Riproduzione',
      navigation: 'Navigazione',
      display: 'Visualizzazione',
      panels: 'Pannelli',
    },
    items: {
      playPause: 'Riproduci / Pausa',
      stop: 'Ferma',
      prevNextSurah: 'Sura precedente / successiva',
      jumpToSurah: 'Vai a una sura',
      fontSize: 'Dimensione del testo',
      toggleTranslation: 'Mostra/nascondi la traduzione',
      darkModeItem: 'Tema scuro',
      shortcuts: 'Scorciatoie',
      settings: 'Impostazioni',
      sideShortcuts: 'Scorciatoie nel pannello laterale',
      print: 'Stampa',
    },
  },
};

export function pickControlsPanels(lang) {
  if (lang === 'it') return CONTROLS_PANELS_TEXT.it;
  return lang === 'fr' ? CONTROLS_PANELS_TEXT.fr : CONTROLS_PANELS_TEXT.en;
}
