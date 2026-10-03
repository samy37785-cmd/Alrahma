// French Localization Batch 1E: accessibility labels (aria-label / title)
// hardcoded in English in the Quran Reader's player, reading controls,
// verse-list action buttons, keyboard-shortcuts tab and the Qibla compass —
// every language, Arabic included, always saw this English text.
//
// Kept as its own module, separate from the sitewide `i18n/a11yLabels.js`
// (Batch 1A): that file is already imported eagerly from the Home page, so
// adding these Quran/Qibla-only keys to it would make the bundler treat it
// as shared by both the eager Home chunk and these lazy-loaded reader
// routes, hoisting it into a new common chunk and adding a modulepreload
// tag to every prerendered page's HTML (confirmed via a build-output diff
// against origin/main). This module is only ever imported by the Quran
// Reader and Qibla routes, so it chunks with them alone, leaving every
// other page's build output byte-for-byte unchanged.
//
// `en` is the exact text the components rendered before this change. `fr`
// and `it` are added; every other language keeps getting the same English
// text.
export const QURAN_A11Y_TEXT = {
  en: {
    quranStopMemorization: 'Stop memorization',
    quranPlayerRegion: 'Chapter recitation player',
    quranPlayerPosition: 'Audio position',
    quranPlayerRewind: 'Rewind 10 seconds',
    quranPlayerForward: 'Forward 10 seconds',
    quranPlayerLoadingLabel: 'Loading…',
    quranPlayerPause: 'Pause',
    quranPlayerPlay: 'Play',
    quranPlayerLoadingAudio: 'Loading audio',
    quranPlayerSpeedGroup: 'Playback speed',
    quranPlayerSpeedOption: (s) => `${s}× speed`,
    quranOtherLanguages: 'Other languages',
    quranDecreaseFont: 'Decrease font size',
    quranIncreaseFont: 'Increase font size',
    quranCopyVerseLink: 'Copy link to this verse',
    quranShareVerseCard: 'Share as a verse card',
    quranCopyVerseText: 'Copy verse (text + translation)',
    quranKbdShortcutsTab: 'Keyboard Shortcuts (K)',
    quranQuickNavTab: 'Quick navigation (/)',
    quranSettingsTab: 'Settings (G)',
    quranKbdPanelTab: 'Keyboard panel (K)',
    quranDarkModeTab: 'Dark mode (D)',
    quranPrintTab: 'Print (P)',
    qiblaDirectionAria: (deg) => `Qibla direction: ${deg} degrees from North`,
  },
  fr: {
    quranStopMemorization: 'Arrêter la mémorisation',
    quranPlayerRegion: 'Lecteur de récitation de la sourate',
    quranPlayerPosition: 'Position audio',
    quranPlayerRewind: 'Reculer de 10 secondes',
    quranPlayerForward: 'Avancer de 10 secondes',
    quranPlayerLoadingLabel: 'Chargement…',
    quranPlayerPause: 'Pause',
    quranPlayerPlay: 'Lecture',
    quranPlayerLoadingAudio: "Chargement de l'audio",
    quranPlayerSpeedGroup: 'Vitesse de lecture',
    quranPlayerSpeedOption: (s) => `Vitesse ${s}×`,
    quranOtherLanguages: 'Autres langues',
    quranDecreaseFont: 'Réduire la taille du texte',
    quranIncreaseFont: 'Augmenter la taille du texte',
    quranCopyVerseLink: 'Copier le lien de ce verset',
    quranShareVerseCard: 'Partager comme carte de verset',
    quranCopyVerseText: 'Copier le verset (texte et traduction)',
    quranKbdShortcutsTab: 'Raccourcis clavier (K)',
    quranQuickNavTab: 'Navigation rapide (/)',
    quranSettingsTab: 'Paramètres (G)',
    quranKbdPanelTab: 'Panneau des raccourcis (K)',
    quranDarkModeTab: 'Mode sombre (D)',
    quranPrintTab: 'Imprimer (P)',
    qiblaDirectionAria: (deg) => `Direction de la Qibla : ${deg} degrés depuis le Nord`,
  },
  it: {
    quranStopMemorization: 'Interrompi la memorizzazione',
    quranPlayerRegion: 'Lettore della recitazione della sura',
    quranPlayerPosition: 'Posizione audio',
    quranPlayerRewind: 'Indietro di 10 secondi',
    quranPlayerForward: 'Avanti di 10 secondi',
    quranPlayerLoadingLabel: 'Caricamento…',
    quranPlayerPause: 'Pausa',
    quranPlayerPlay: 'Riproduci',
    quranPlayerLoadingAudio: 'Caricamento dell’audio',
    quranPlayerSpeedGroup: 'Velocità di riproduzione',
    quranPlayerSpeedOption: (s) => `Velocità ${s}×`,
    quranOtherLanguages: 'Altre lingue',
    quranDecreaseFont: 'Riduci la dimensione del testo',
    quranIncreaseFont: 'Aumenta la dimensione del testo',
    quranCopyVerseLink: 'Copia il link di questo versetto',
    quranShareVerseCard: 'Condividi come scheda del versetto',
    quranCopyVerseText: 'Copia il versetto (testo e traduzione)',
    quranKbdShortcutsTab: 'Scorciatoie da tastiera (K)',
    quranQuickNavTab: 'Navigazione rapida (/)',
    quranSettingsTab: 'Impostazioni (G)',
    quranKbdPanelTab: 'Pannello delle scorciatoie (K)',
    quranDarkModeTab: 'Tema scuro (D)',
    quranPrintTab: 'Stampa (P)',
    qiblaDirectionAria: (deg) => `Direzione della Qibla: ${deg} gradi da nord`,
  },
};

export function pickQuranA11y(lang) {
  if (lang === 'it') return QURAN_A11Y_TEXT.it;
  return lang === 'fr' ? QURAN_A11Y_TEXT.fr : QURAN_A11Y_TEXT.en;
}
